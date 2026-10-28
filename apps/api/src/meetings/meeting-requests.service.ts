import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { renderBrandedEmail } from '@em/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../integrations/email/email.service';
import { EffectiveConfigService } from '../settings/effective-config.service';
import { EnvService } from '../config/env.service';
import type { AuthUser } from '../common/decorators';

@Injectable()
export class MeetingRequestsService {
  private readonly logger = new Logger(MeetingRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly config: EffectiveConfigService,
    private readonly env: EnvService,
  ) {}

  private actorOrgIds(actor: AuthUser) {
    return actor.organizationIds ?? [];
  }

  private assertMember(actor: AuthUser, orgId: string) {
    if (!this.actorOrgIds(actor).includes(orgId)) {
      throw new ForbiddenException('Not a member of this organization');
    }
  }

  async listForUser(actor: AuthUser) {
    const orgIds = this.actorOrgIds(actor);
    if (!orgIds.length) return { items: [] };

    const items = await this.prisma.meetingRequest.findMany({
      where: {
        OR: [{ fromOrgId: { in: orgIds } }, { toOrgId: { in: orgIds } }],
      },
      include: {
        fromOrg: { select: { id: true, name: true, type: true } },
        toOrg: { select: { id: true, name: true, type: true } },
        place: true,
        meeting: { select: { id: true, status: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    return { items };
  }

  async create(
    actor: AuthUser,
    input: { fromOrgId: string; toOrgId: string; message?: string },
  ) {
    this.assertMember(actor, input.fromOrgId);
    if (input.fromOrgId === input.toOrgId) {
      throw new BadRequestException('Cannot request a meeting with yourself');
    }

    const [fromOrg, toOrg] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: input.fromOrgId } }),
      this.prisma.organization.findUnique({ where: { id: input.toOrgId } }),
    ]);
    if (!fromOrg || !toOrg) {
      throw new NotFoundException('Organization not found');
    }
    const types = new Set([fromOrg.type, toOrg.type]);
    if (!types.has('COMPANY') || !types.has('VENDOR')) {
      throw new BadRequestException(
        'Meetings must be between a company/delegate and a vendor',
      );
    }

    const open = await this.prisma.meetingRequest.findFirst({
      where: {
        status: {
          in: ['PENDING', 'INTEREST_ACCEPTED', 'AWAITING_CONFIRMATION'],
        },
        OR: [
          { fromOrgId: input.fromOrgId, toOrgId: input.toOrgId },
          { fromOrgId: input.toOrgId, toOrgId: input.fromOrgId },
        ],
      },
    });
    if (open) {
      throw new BadRequestException(
        'An open meeting request already exists with this organization',
      );
    }

    const created = await this.prisma.meetingRequest.create({
      data: {
        fromOrgId: input.fromOrgId,
        toOrgId: input.toOrgId,
        requestedById: actor.id,
        message: input.message?.trim() || null,
        status: 'PENDING',
      },
      include: {
        fromOrg: true,
        toOrg: true,
      },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'meeting_request.create',
      entityType: 'MeetingRequest',
      entityId: created.id,
      outcome: 'SUCCESS',
    });

    void this.notifyOrgs(created.id, 'request_created').catch((err) =>
      this.logger.warn(err.message),
    );

    return created;
  }

  async acceptInterest(actor: AuthUser, id: string) {
    const request = await this.getRequestOrThrow(id);
    this.assertMember(actor, request.toOrgId);
    if (request.status !== 'PENDING') {
      throw new BadRequestException('Request is not awaiting interest accept');
    }

    const updated = await this.prisma.meetingRequest.update({
      where: { id },
      data: { status: 'INTEREST_ACCEPTED' },
      include: { fromOrg: true, toOrg: true, place: true },
    });

    void this.notifyOrgs(id, 'interest_accepted').catch((err) =>
      this.logger.warn(err.message),
    );
    return updated;
  }

  async decline(actor: AuthUser, id: string, reason?: string) {
    const request = await this.getRequestOrThrow(id);
    const orgIds = this.actorOrgIds(actor);
    if (
      !orgIds.includes(request.toOrgId) &&
      !orgIds.includes(request.fromOrgId)
    ) {
      throw new ForbiddenException();
    }
    if (['SCHEDULED', 'DECLINED', 'CANCELLED'].includes(request.status)) {
      throw new BadRequestException('Request can no longer be declined');
    }

    const updated = await this.prisma.meetingRequest.update({
      where: { id },
      data: {
        status: 'DECLINED',
        declineReason: reason?.trim() || 'Declined',
      },
      include: { fromOrg: true, toOrg: true, place: true },
    });

    void this.notifyOrgs(id, 'declined').catch((err) =>
      this.logger.warn(err.message),
    );
    return updated;
  }

  async proposeSchedule(
    actor: AuthUser,
    id: string,
    input: { startsAt: string; placeId: string },
  ) {
    const request = await this.getRequestOrThrow(id);
    // Either side can propose after interest is accepted.
    const orgIds = this.actorOrgIds(actor);
    if (
      !orgIds.includes(request.fromOrgId) &&
      !orgIds.includes(request.toOrgId)
    ) {
      throw new ForbiddenException();
    }
    if (request.status !== 'INTEREST_ACCEPTED') {
      throw new BadRequestException(
        'Accept the meeting interest before proposing a time and place',
      );
    }

    const duration = await this.config.getNumber(
      'ops.meetingDurationMinutes',
      15,
    );
    const startsAt = new Date(input.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException('Invalid start time');
    }
    const endsAt = new Date(startsAt.getTime() + duration * 60_000);

    const place = await this.prisma.place.findFirst({
      where: { id: input.placeId, isActive: true },
    });
    if (!place) throw new BadRequestException('Place not available');

    const placeBusy = await this.prisma.meeting.findFirst({
      where: {
        placeId: place.id,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    });
    if (placeBusy) {
      throw new BadRequestException('Place is already booked for that time');
    }

    const partyBusy = await this.prisma.meeting.findFirst({
      where: {
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        OR: [
          { companyOrgId: { in: [request.fromOrgId, request.toOrgId] } },
          { vendorOrgId: { in: [request.fromOrgId, request.toOrgId] } },
        ],
      },
    });
    if (partyBusy) {
      throw new BadRequestException(
        'Company or vendor already has a meeting in that window',
      );
    }

    const proposedByOrgId = orgIds.includes(request.fromOrgId)
      ? request.fromOrgId
      : request.toOrgId;

    const updated = await this.prisma.meetingRequest.update({
      where: { id },
      data: {
        proposedStartsAt: startsAt,
        proposedEndsAt: endsAt,
        proposedByOrgId,
        placeId: place.id,
        status: 'AWAITING_CONFIRMATION',
      },
      include: { fromOrg: true, toOrg: true, place: true },
    });

    void this.notifyOrgs(id, 'schedule_proposed').catch((err) =>
      this.logger.warn(err.message),
    );
    return updated;
  }

  async confirmSchedule(actor: AuthUser, id: string) {
    const request = await this.getRequestOrThrow(id);
    const orgIds = this.actorOrgIds(actor);
    if (
      !orgIds.includes(request.fromOrgId) &&
      !orgIds.includes(request.toOrgId)
    ) {
      throw new ForbiddenException();
    }
    if (request.status !== 'AWAITING_CONFIRMATION') {
      throw new BadRequestException('Nothing to confirm');
    }
    if (!request.proposedStartsAt || !request.proposedEndsAt || !request.placeId) {
      throw new BadRequestException('Schedule details are incomplete');
    }

    const proposerOrgId =
      request.proposedByOrgId ??
      (orgIds.includes(request.fromOrgId) ? request.toOrgId : request.fromOrgId);
    const confirmerOrgId =
      proposerOrgId === request.fromOrgId ? request.toOrgId : request.fromOrgId;
    if (!orgIds.includes(confirmerOrgId)) {
      throw new ForbiddenException(
        'Only the other party can confirm this schedule proposal',
      );
    }

    const fromOrg = await this.prisma.organization.findUnique({
      where: { id: request.fromOrgId },
    });
    const toOrg = await this.prisma.organization.findUnique({
      where: { id: request.toOrgId },
    });
    if (!fromOrg || !toOrg) throw new NotFoundException();

    const companyOrgId =
      fromOrg.type === 'COMPANY' ? fromOrg.id : toOrg.id;
    const vendorOrgId = fromOrg.type === 'VENDOR' ? fromOrg.id : toOrg.id;
    const duration = Math.round(
      (request.proposedEndsAt.getTime() - request.proposedStartsAt.getTime()) /
        60_000,
    );
    const place = await this.prisma.place.findUnique({
      where: { id: request.placeId },
    });

    const meeting = await this.prisma.$transaction(async (tx) => {
      const created = await tx.meeting.create({
        data: {
          companyOrgId,
          vendorOrgId,
          placeId: request.placeId,
          startsAt: request.proposedStartsAt!,
          endsAt: request.proposedEndsAt!,
          durationMinutes: duration,
          timeZone: 'UTC',
          mode: 'IN_PERSON',
          venue: place?.name ?? null,
          status: 'CONFIRMED',
          idempotencyKey: `peer-meeting:${request.id}`,
        },
      });

      await tx.meetingOccupancy.createMany({
        data: [
          {
            meetingId: created.id,
            participantKey: `org:${companyOrgId}`,
            startsAt: created.startsAt,
            endsAt: created.endsAt,
          },
          {
            meetingId: created.id,
            participantKey: `org:${vendorOrgId}`,
            startsAt: created.startsAt,
            endsAt: created.endsAt,
          },
        ],
      });

      await tx.meetingRequest.update({
        where: { id: request.id },
        data: { status: 'SCHEDULED', meetingId: created.id },
      });

      return created;
    });

    void this.notifyOrgs(id, 'scheduled').catch((err) =>
      this.logger.warn(err.message),
    );

    await this.audit.record({
      actorId: actor.id,
      action: 'meeting_request.confirm',
      entityType: 'MeetingRequest',
      entityId: id,
      outcome: 'SUCCESS',
      metadata: { meetingId: meeting.id },
    });

    return this.getRequestOrThrow(id);
  }

  async availableSlots(date: string, requestId?: string) {
    const duration = await this.config.getNumber(
      'ops.meetingDurationMinutes',
      15,
    );
    const buffer = 5;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }
    const [y, m, d] = date.split('-').map(Number) as [number, number, number];
    const dayStart = Date.UTC(y, m - 1, d, 9, 0, 0, 0);
    const dayEnd = Date.UTC(y, m - 1, d, 17, 0, 0, 0);

    let partyOrgIds: string[] = [];
    if (requestId) {
      const request = await this.getRequestOrThrow(requestId);
      partyOrgIds = [request.fromOrgId, request.toOrgId];
    }

    const busy = partyOrgIds.length
      ? await this.prisma.meeting.findMany({
          where: {
            status: { notIn: ['CANCELLED', 'NO_SHOW'] },
            startsAt: { lt: new Date(dayEnd) },
            endsAt: { gt: new Date(dayStart) },
            OR: [
              { companyOrgId: { in: partyOrgIds } },
              { vendorOrgId: { in: partyOrgIds } },
            ],
          },
          select: { startsAt: true, endsAt: true },
        })
      : [];

    const slots: Array<{ startsAt: string; endsAt: string }> = [];
    let cursor = dayStart;
    while (cursor + duration * 60_000 <= dayEnd) {
      const startsAt = new Date(cursor);
      const endsAt = new Date(cursor + duration * 60_000);
      const overlaps = busy.some(
        (m) => m.startsAt < endsAt && m.endsAt > startsAt,
      );
      if (!overlaps) {
        slots.push({
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        });
      }
      cursor = endsAt.getTime() + buffer * 60_000;
    }
    return { durationMinutes: duration, slots };
  }

  private async getRequestOrThrow(id: string) {
    const request = await this.prisma.meetingRequest.findUnique({
      where: { id },
      include: {
        fromOrg: true,
        toOrg: true,
        place: true,
        meeting: true,
      },
    });
    if (!request) throw new NotFoundException('Meeting request not found');
    return request;
  }

  private async resolveOrgEmails(orgId: string): Promise<string[]> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        invitations: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { email: true },
        },
        members: {
          include: { user: { select: { email: true, id: true } } },
        },
      },
    });
    if (!org) return [];
    const emails = new Set<string>();
    const attrs =
      org.customAttrs && typeof org.customAttrs === 'object'
        ? (org.customAttrs as Record<string, unknown>)
        : {};
    if (typeof attrs.contactEmail === 'string' && attrs.contactEmail) {
      emails.add(attrs.contactEmail.toLowerCase());
    }
    if (org.invitations[0]?.email) {
      emails.add(org.invitations[0].email.toLowerCase());
    }
    for (const member of org.members) {
      emails.add(member.user.email.toLowerCase());
    }
    return [...emails];
  }

  private async notifyOrgs(
    requestId: string,
    kind:
      | 'request_created'
      | 'interest_accepted'
      | 'schedule_proposed'
      | 'scheduled'
      | 'declined',
  ) {
    const request = await this.getRequestOrThrow(requestId);
    const fromName = await this.email.getFromName();
    const portalUrl = `${this.env.appUrl.replace(/\/$/, '')}/portal/requests`;
    const vendorUrl = `${this.env.appUrl.replace(/\/$/, '')}/vendor/requests`;

    const titles: Record<typeof kind, string> = {
      request_created: 'New meeting request',
      interest_accepted: 'Meeting interest accepted — pick a time',
      schedule_proposed: 'Meeting time & place proposed',
      scheduled: 'Meeting scheduled',
      declined: 'Meeting request declined',
    };

    const bodies: Record<typeof kind, string> = {
      request_created: `${request.fromOrg.name} wants to meet ${request.toOrg.name}.`,
      interest_accepted: `${request.toOrg.name} accepted. Propose a time slot and place.`,
      schedule_proposed: `A time and place were proposed for ${request.fromOrg.name} ↔ ${request.toOrg.name}. Please confirm or decline.`,
      scheduled: `Your meeting is confirmed: ${request.fromOrg.name} ↔ ${request.toOrg.name}.`,
      declined: `The meeting request between ${request.fromOrg.name} and ${request.toOrg.name} was declined.`,
    };

    const targets =
      kind === 'request_created' || kind === 'schedule_proposed'
        ? [request.toOrgId]
        : kind === 'interest_accepted'
          ? [request.fromOrgId]
          : [request.fromOrgId, request.toOrgId];

    for (const orgId of targets) {
      const org = orgId === request.fromOrgId ? request.fromOrg : request.toOrg;
      const emails = await this.resolveOrgEmails(orgId);
      const actionUrl = org.type === 'VENDOR' ? vendorUrl : portalUrl;
      const template = renderBrandedEmail({
        kind: kind === 'declined' ? 'rejected' : 'meeting',
        brandName: fromName,
        contextName: org.name,
        title: titles[kind],
        body: ['Hello,', '', bodies[kind]].join('\n'),
        actionUrl,
        actionLabel: 'Open requests',
        details: [
          { label: 'From', value: request.fromOrg.name },
          { label: 'To', value: request.toOrg.name },
          ...(request.proposedStartsAt
            ? [
                {
                  label: 'Starts',
                  value: request.proposedStartsAt.toUTCString(),
                },
              ]
            : []),
          ...(request.place
            ? [{ label: 'Place', value: request.place.name }]
            : []),
        ],
      });

      for (const to of emails) {
        try {
          await this.email.send({
            to,
            subject: `${titles[kind]}: ${request.fromOrg.name} ↔ ${request.toOrg.name}`,
            text: template.text,
            html: template.html,
            idempotencyKey: `meeting_request.${kind}:${requestId}:${to}:${Date.now()}`,
            templateCode: `meeting_request_${kind}`,
          });
        } catch (err) {
          this.logger.warn(
            `Meeting request email failed (${to}): ${(err as Error).message}`,
          );
        }
      }

      // Push: record a notification event for each member (web-push delivery can attach later).
      const members = await this.prisma.organizationMember.findMany({
        where: { organizationId: orgId },
        select: { userId: true },
      });
      for (const member of members) {
        const subs = await this.prisma.pushSubscription.findMany({
          where: { userId: member.userId },
        });
        for (const sub of subs) {
          await this.prisma.notificationEvent.create({
            data: {
              templateCode: `push.meeting_request.${kind}`,
              recipientEmail: `user:${member.userId}`,
              payload: {
                title: titles[kind],
                body: bodies[kind],
                url: actionUrl,
                endpoint: sub.endpoint,
              },
              idempotencyKey: `push.mr.${kind}:${requestId}:${sub.id}:${Date.now()}`,
            },
          });
        }
      }
    }
  }
}
