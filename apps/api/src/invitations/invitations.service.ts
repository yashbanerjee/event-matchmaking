import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createInvitationSchema, type CreateInvitationInput } from '@em/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EnvService } from '../config/env.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../messaging/outbox.service';
import { generateSecureToken, hashToken } from '../common/crypto.util';
import type { AuthUser } from '../common/decorators';

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly env: EnvService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async create(actor: AuthUser, raw: CreateInvitationInput) {
    const input = createInvitationSchema.parse(raw);
    const role = await this.prisma.role.findUnique({
      where: { code: input.roleCode },
    });
    if (!role) {
      throw new BadRequestException('Unknown role');
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: input.organizationId },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const token = generateSecureToken(32);
    const tokenHash = hashToken(token);
    const idempotencyKey = `invite:${input.email.toLowerCase()}:${input.organizationId}:${Date.now()}`;
    const expiresAt = new Date(
      Date.now() + this.env.invitationTtlDays * 86_400_000,
    );

    const invitation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invitation.create({
        data: {
          email: input.email.toLowerCase(),
          organizationId: input.organizationId,
          roleId: role.id,
          onboardingWorkflowId: input.onboardingWorkflowId,
          tokenHash,
          status: 'PENDING',
          expiresAt,
          createdById: actor.id,
          idempotencyKey,
        },
      });

      await this.outbox.enqueue(tx, {
        aggregateType: 'Invitation',
        aggregateId: created.id,
        eventType: 'invitation.send',
        idempotencyKey: `invitation.send:${created.id}`,
        payload: {
          invitationId: created.id,
          email: created.email,
          organizationName: org.name,
          roleCode: role.code,
          registrationUrl: `${this.env.appUrl}/register?token=${token}`,
          expiresAt: expiresAt.toISOString(),
        },
      });

      await this.audit.record({
        actorId: actor.id,
        action: 'invitation.create',
        entityType: 'Invitation',
        entityId: created.id,
        outcome: 'SUCCESS',
        after: {
          email: created.email,
          organizationId: created.organizationId,
          roleCode: role.code,
        },
      });

      return created;
    });

    return {
      id: invitation.id,
      email: invitation.email,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      // plaintext token returned only at creation for admin copy/debug in non-prod
      registrationToken:
        this.env.nodeEnv === 'production' ? undefined : token,
    };
  }

  async list(params: { page?: number; pageSize?: number; status?: string }) {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 20, 100);
    const where = params.status
      ? { status: params.status as never }
      : undefined;

    const [items, total] = await Promise.all([
      this.prisma.invitation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          organization: { select: { id: true, name: true, code: true } },
          role: { select: { code: true, name: true } },
        },
      }),
      this.prisma.invitation.count({ where }),
    ]);

    return {
      items,
      page,
      pageSize,
      total,
    };
  }

  async revoke(actor: AuthUser, id: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.status === 'ACCEPTED') {
      throw new BadRequestException('Cannot revoke an accepted invitation');
    }

    const updated = await this.prisma.invitation.update({
      where: { id },
      data: {
        status: 'REVOKED',
        tokenHash: hashToken(generateSecureToken()),
      },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'invitation.revoke',
      entityType: 'Invitation',
      entityId: id,
      outcome: 'SUCCESS',
    });

    return updated;
  }
}
