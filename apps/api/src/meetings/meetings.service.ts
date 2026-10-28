import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { assertTransition, type MeetingStatus } from '@em/domain';
import { FeedbackOutcome, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../messaging/outbox.service';
import type { AuthUser } from '../common/decorators';

@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async listForUser(user: AuthUser, params: { page?: number; pageSize?: number }) {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 20, 100);
    const isPrivileged =
      user.permissions.includes('meetings:manage') ||
      user.permissions.includes('meetings:read');

    const where: Prisma.MeetingWhereInput = isPrivileged &&
    user.roles.some((r) =>
      ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'].includes(r),
    )
      ? {}
      : {
          OR: [
            { companyOrgId: { in: user.organizationIds } },
            { vendorOrgId: { in: user.organizationIds } },
          ],
          status: {
            in: [
              'PUBLISHED',
              'AWAITING_CONFIRMATION',
              'CONFIRMED',
              'RESCHEDULE_REQUESTED',
              'RESCHEDULED',
              'IN_PROGRESS',
              'COMPLETED',
              'NO_SHOW',
            ],
          },
        };

    const [items, total] = await Promise.all([
      this.prisma.meeting.findMany({
        where,
        orderBy: { startsAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          companyOrg: true,
          vendorOrg: true,
          confirmations: true,
          feedbacks: {
            select: {
              id: true,
              organizationId: true,
              outcome: true,
              isConfidential: true,
              meetingQuality: true,
              followUpRequired: true,
              createdAt: true,
              comments: true,
            },
          },
        },
      }),
      this.prisma.meeting.count({ where }),
    ]);

    // Enforce feedback visibility: confidential comments hidden from counterpart
    const sanitized = items.map((meeting) => ({
      ...meeting,
      feedbacks: meeting.feedbacks.map((fb) => {
        const isOwnOrg = user.organizationIds.includes(fb.organizationId);
        const canSeeAll = user.permissions.includes('feedback:read_all');
        if (fb.isConfidential && !isOwnOrg && !canSeeAll) {
          return {
            id: fb.id,
            organizationId: fb.organizationId,
            outcome: fb.outcome,
            followUpRequired: fb.followUpRequired,
            isConfidential: true,
            createdAt: fb.createdAt,
            comments: null,
            meetingQuality: null,
          };
        }
        return fb;
      }),
    }));

    return { items: sanitized, page, pageSize, total };
  }

  async confirm(user: AuthUser, meetingId: string, note?: string) {
    const meeting = await this.requireMeetingAccess(user, meetingId);
    if (
      !['AWAITING_CONFIRMATION', 'RESCHEDULED', 'PUBLISHED'].includes(
        meeting.status,
      )
    ) {
      throw new BadRequestException('Meeting cannot be confirmed in current status');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.meetingConfirmation.upsert({
        where: {
          meetingId_userId: { meetingId, userId: user.id },
        },
        create: {
          meetingId,
          userId: user.id,
          status: 'CONFIRMED',
          note,
          respondedAt: new Date(),
        },
        update: {
          status: 'CONFIRMED',
          note,
          respondedAt: new Date(),
        },
      });

      if (meeting.status !== 'CONFIRMED') {
        assertTransition(meeting.status as MeetingStatus, 'CONFIRMED');
        await tx.meeting.update({
          where: { id: meetingId },
          data: { status: 'CONFIRMED', version: { increment: 1 } },
        });
        await tx.meetingStatusHistory.create({
          data: {
            meetingId,
            fromStatus: meeting.status,
            toStatus: 'CONFIRMED',
            actorId: user.id,
          },
        });
      }
    });

    return this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { confirmations: true },
    });
  }

  async requestReschedule(
    user: AuthUser,
    meetingId: string,
    reason: string,
  ) {
    const meeting = await this.requireMeetingAccess(user, meetingId);
    assertTransition(
      meeting.status as MeetingStatus,
      'RESCHEDULE_REQUESTED',
    );

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.meeting.update({
        where: { id: meetingId },
        data: {
          status: 'RESCHEDULE_REQUESTED',
          version: { increment: 1 },
        },
      });
      await tx.meetingStatusHistory.create({
        data: {
          meetingId,
          fromStatus: meeting.status,
          toStatus: 'RESCHEDULE_REQUESTED',
          reason,
          actorId: user.id,
        },
      });
      await this.outbox.enqueue(tx, {
        aggregateType: 'Meeting',
        aggregateId: meetingId,
        eventType: 'notification.reschedule_requested',
        idempotencyKey: `meeting.reschedule_req:${meetingId}:${updated.version}`,
        payload: { meetingId, reason },
      });
      return updated;
    });
  }

  async submitFeedback(
    user: AuthUser,
    input: {
      meetingId: string;
      organizationId: string;
      attendanceConfirmed: boolean;
      meetingQuality?: number;
      relevance?: number;
      businessPotential?: number;
      communicationQuality?: number;
      interestLevel?: number;
      followUpRequired?: boolean;
      followUpDate?: string;
      outcome: FeedbackOutcome;
      outcomeCustom?: string;
      comments?: string;
      isConfidential?: boolean;
    },
  ) {
    if (!user.organizationIds.includes(input.organizationId)) {
      throw new ForbiddenException('Organization access denied');
    }

    const meeting = await this.requireMeetingAccess(user, input.meetingId);
    if (
      meeting.companyOrgId !== input.organizationId &&
      meeting.vendorOrgId !== input.organizationId
    ) {
      throw new ForbiddenException('Organization is not a meeting party');
    }

    const existing = await this.prisma.meetingFeedback.findUnique({
      where: {
        meetingId_organizationId: {
          meetingId: input.meetingId,
          organizationId: input.organizationId,
        },
      },
    });
    if (existing) {
      throw new BadRequestException(
        'Feedback already submitted; revision workflow required',
      );
    }

    const feedback = await this.prisma.$transaction(async (tx) => {
      const created = await tx.meetingFeedback.create({
        data: {
          meetingId: input.meetingId,
          organizationId: input.organizationId,
          reviewerUserId: user.id,
          attendanceConfirmed: input.attendanceConfirmed,
          meetingQuality: input.meetingQuality,
          relevance: input.relevance,
          businessPotential: input.businessPotential,
          communicationQuality: input.communicationQuality,
          interestLevel: input.interestLevel,
          followUpRequired: input.followUpRequired ?? false,
          followUpDate: input.followUpDate
            ? new Date(input.followUpDate)
            : null,
          outcome: input.outcome,
          outcomeCustom: input.outcomeCustom,
          comments: input.comments,
          isConfidential: input.isConfidential ?? true,
        },
      });

      if (input.followUpRequired) {
        await tx.followUpAction.create({
          data: {
            meetingId: input.meetingId,
            organizationId: input.organizationId,
            title: 'Post-meeting follow-up',
            description: input.comments,
            dueAt: input.followUpDate ? new Date(input.followUpDate) : null,
            createdById: user.id,
          },
        });
      }

      return created;
    });

    await this.audit.record({
      actorId: user.id,
      action: 'feedback.submit',
      entityType: 'MeetingFeedback',
      entityId: feedback.id,
      outcome: 'SUCCESS',
    });

    return feedback;
  }

  private async requireMeetingAccess(user: AuthUser, meetingId: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
    });
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    const privileged = user.roles.some((r) =>
      ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'].includes(r),
    );
    if (
      !privileged &&
      !user.organizationIds.includes(meeting.companyOrgId) &&
      !user.organizationIds.includes(meeting.vendorOrgId)
    ) {
      throw new ForbiddenException('No access to this meeting');
    }
    return meeting;
  }
}
