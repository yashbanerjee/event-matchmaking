import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InvitationStatus, Prisma } from '@prisma/client';
import { createInvitationSchema, type CreateInvitationInput, renderInvitationEmail } from '@em/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EnvService } from '../config/env.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../messaging/outbox.service';
import { EmailService } from '../integrations/email/email.service';
import { generateSecureToken, hashToken } from '../common/crypto.util';
import type { AuthUser } from '../common/decorators';

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly env: EnvService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly email: EmailService,
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
    const registrationUrl = `${this.env.appUrl}/register?token=${token}`;

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
          registrationUrl,
          expiresAt: expiresAt.toISOString(),
          organizationType: org.type,
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

    let emailSent = false;
    try {
      const fromName = await this.email.getFromName();
      const template = renderInvitationEmail({
        brandName: fromName,
        organizationName: org.name,
        kind: org.type === 'COMPANY' ? 'company' : 'vendor',
        registrationUrl,
        expiresAt,
      });
      await this.email.send({
        to: invitation.email,
        subject: template.subject,
        text: template.text,
        html: template.html,
        idempotencyKey: `invitation.email:${invitation.id}`,
        templateCode: 'invitation',
      });
      emailSent = true;
    } catch (err) {
      this.logger.warn(
        `Invitation email failed for ${invitation.email}: ${(err as Error).message}`,
      );
    }

    return {
      id: invitation.id,
      email: invitation.email,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      emailSent,
      // plaintext token returned only at creation for admin copy/debug in non-prod
      registrationToken:
        this.env.nodeEnv === 'production' ? undefined : token,
    };
  }

  async list(params: {
    page?: number;
    pageSize?: number;
    status?: string;
    organizationId?: string;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    const status = params.status
      ? (params.status as InvitationStatus)
      : undefined;
    const where: Prisma.InvitationWhereInput = {
      ...(status ? { status } : {}),
      ...(params.organizationId
        ? { organizationId: params.organizationId }
        : {}),
    };

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

    return { items, total, page, pageSize };
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
      data: { status: 'REVOKED' },
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
