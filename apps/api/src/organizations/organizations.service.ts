import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { OrganizationType } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  formSchemaDefinition,
  renderInvitationEmail,
  renderVerifiedEmail,
} from '@em/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EnvService } from '../config/env.service';
import { OutboxService } from '../messaging/outbox.service';
import { EmailService } from '../integrations/email/email.service';
import { PeerRecommendationsService } from '../meetings/peer-recommendations.service';
import { generateSecureToken, hashToken } from '../common/crypto.util';
import type { AuthUser } from '../common/decorators';

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly env: EnvService,
    private readonly outbox: OutboxService,
    private readonly email: EmailService,
    @Inject(forwardRef(() => PeerRecommendationsService))
    private readonly peerRecs: PeerRecommendationsService,
  ) {}

  async createCompany(
    actor: AuthUser,
    input: {
      code: string;
      name: string;
      industry?: string;
      country?: string;
      region?: string;
      website?: string;
      timeZone?: string;
    },
  ) {
    const existing = await this.prisma.organization.findUnique({
      where: { code: input.code },
    });
    if (existing) {
      throw new BadRequestException('Organization code already exists');
    }

    const org = await this.prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          type: OrganizationType.COMPANY,
          code: input.code,
          name: input.name,
          industry: input.industry,
          country: input.country,
          region: input.region,
          website: input.website,
          timeZone: input.timeZone ?? 'UTC',
          status: 'ACTIVE',
        },
      });
      await tx.company.create({
        data: {
          organizationId: created.id,
          approvalStatus: 'VERIFIED',
          verificationStatus: 'VERIFIED',
          matchingEligible: true,
        },
      });
      return created;
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'company.create',
      entityType: 'Organization',
      entityId: org.id,
      outcome: 'SUCCESS',
      after: { code: org.code, name: org.name },
    });

    this.peerRecs.scheduleRecompute(org.id, 'company.create');

    return org;
  }

  async inviteCompany(
    actor: AuthUser,
    input: {
      name: string;
      email: string;
      phone?: string;
      phoneCountryCode?: string;
      formId?: string;
      formVersionId?: string;
      code?: string;
      industry?: string;
    },
  ) {
    const defaults = input.formId
      ? null
      : await this.resolveOnboardingForm('COMPANY');
    const formId = input.formId ?? defaults?.formId;
    const formVersionId = input.formVersionId ?? defaults?.formVersionId;
    if (!formId || !formVersionId) {
      throw new BadRequestException(
        'Select a published investor form before sending the invitation',
      );
    }
    return this.inviteOrganization(actor, {
      ...input,
      formId,
      formVersionId,
      type: OrganizationType.COMPANY,
      roleCode: 'COMPANY_USER',
      industry: input.industry,
    });
  }

  async inviteVendor(
    actor: AuthUser,
    input: {
      name: string;
      email: string;
      phone?: string;
      phoneCountryCode?: string;
      formId?: string;
      formVersionId?: string;
      code?: string;
    },
  ) {
    const defaults = input.formId
      ? null
      : await this.resolveOnboardingForm('VENDOR');
    const formId = input.formId ?? defaults?.formId;
    const formVersionId = input.formVersionId ?? defaults?.formVersionId;
    if (!formId || !formVersionId) {
      throw new BadRequestException(
        'Select a published innovator form before sending the invitation',
      );
    }
    return this.inviteOrganization(actor, {
      ...input,
      formId,
      formVersionId,
      type: OrganizationType.VENDOR,
      roleCode: 'VENDOR_USER',
    });
  }

  private async inviteOrganization(
    actor: AuthUser,
    input: {
      type: 'COMPANY' | 'VENDOR';
      roleCode: 'COMPANY_USER' | 'VENDOR_USER';
      name: string;
      email: string;
      phone?: string;
      phoneCountryCode?: string;
      formId?: string;
      formVersionId?: string;
      code?: string;
      industry?: string;
    },
  ) {
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();
    const kind = input.type === 'COMPANY' ? 'Investor' : 'Innovator';
    if (!name || !email) {
      throw new BadRequestException(`${kind} name and email are required`);
    }

    const prefix = input.type === 'COMPANY' ? 'CMP' : 'VND';
    const code =
      input.code?.trim() ||
      name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 24) ||
      `${prefix}_${Date.now().toString(36).toUpperCase()}`;

    const existingCode = await this.prisma.organization.findUnique({
      where: { code },
    });
    if (existingCode) {
      throw new BadRequestException(
        `Organization code ${code} already exists — provide a unique code`,
      );
    }

    const role = await this.prisma.role.findUnique({
      where: { code: input.roleCode },
    });
    if (!role) {
      throw new BadRequestException(`${input.roleCode} role is missing`);
    }

    if (input.formId || input.formVersionId) {
      if (!input.formId || !input.formVersionId) {
        throw new BadRequestException(
          'Both formId and formVersionId are required to attach a form',
        );
      }
      const version = await this.prisma.formVersion.findUnique({
        where: { id: input.formVersionId },
      });
      if (
        !version ||
        version.formId !== input.formId ||
        version.status !== 'PUBLISHED'
      ) {
        throw new BadRequestException('Select a published form version');
      }
    }

    const token = generateSecureToken(32);
    const tokenHash = hashToken(token);
    const expiresAt = new Date(
      Date.now() + this.env.invitationTtlDays * 86_400_000,
    );
    const phone =
      input.phone?.trim() && input.phoneCountryCode
        ? {
            phone: input.phone.trim(),
            phoneCountryCode: input.phoneCountryCode.trim(),
            contactEmail: email,
          }
        : {
            ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
            contactEmail: email,
          };

    const result = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          type: input.type,
          code,
          name,
          industry: input.industry,
          status: 'PENDING_APPROVAL',
          customAttrs: phone,
        },
      });

      if (input.type === 'VENDOR') {
        await tx.vendor.create({
          data: {
            organizationId: org.id,
            displayName: name,
            categories: [],
            capabilities: [],
            approvalStatus: 'INVITED',
          },
        });
      } else {
        await tx.company.create({
          data: {
            organizationId: org.id,
            approvalStatus: 'INVITED',
          },
        });
      }

      if (input.formId && input.formVersionId) {
        await tx.formAssignment.create({
          data: {
            formId: input.formId,
            formVersionId: input.formVersionId,
            organizationId: org.id,
          },
        });
      }

      const invitation = await tx.invitation.create({
        data: {
          email,
          organizationId: org.id,
          roleId: role.id,
          tokenHash,
          status: 'PENDING',
          expiresAt,
          createdById: actor.id,
          idempotencyKey: `${input.type.toLowerCase()}-invite:${email}:${org.id}:${Date.now()}`,
        },
      });

      const formQuery =
        input.formId && input.formVersionId
          ? `&formId=${input.formId}&formVersionId=${input.formVersionId}`
          : '';
      const registrationUrl = `${this.env.appUrl}${
        input.type === 'COMPANY' ? '/register/investor' : '/register/innovator'
      }?token=${token}${formQuery}`;

      await this.outbox.enqueue(tx, {
        aggregateType: 'Invitation',
        aggregateId: invitation.id,
        eventType: 'invitation.send',
        idempotencyKey: `invitation.send:${invitation.id}`,
        payload: {
          invitationId: invitation.id,
          email,
          organizationName: org.name,
          roleCode: input.roleCode,
          registrationUrl,
          expiresAt: expiresAt.toISOString(),
          formAttached: Boolean(input.formId),
        },
      });

      return { org, invitation, registrationUrl };
    });

    let emailSent = false;
    try {
      const fromName = await this.email.getFromName();
      const template = renderInvitationEmail({
        brandName: fromName,
        organizationName: result.org.name,
        kind: input.type === 'COMPANY' ? 'company' : 'vendor',
        registrationUrl: result.registrationUrl,
        expiresAt,
        formAttached: Boolean(input.formId),
      });
      await this.email.send({
        to: email,
        subject: template.subject,
        text: template.text,
        html: template.html,
        idempotencyKey: `invitation.email:${result.invitation.id}`,
        templateCode: 'invitation',
      });
      emailSent = true;
    } catch (err) {
      this.logger.warn(
        `Invitation email failed for ${email}: ${(err as Error).message}`,
      );
    }

    await this.audit.record({
      actorId: actor.id,
      action:
        input.type === 'COMPANY' ? 'company.invite' : 'vendor.invite',
      entityType: 'Organization',
      entityId: result.org.id,
      outcome: 'SUCCESS',
      after: { email, name, code, emailSent },
    });

    return {
      organization: result.org,
      invitation: {
        id: result.invitation.id,
        email: result.invitation.email,
        status: result.invitation.status,
        expiresAt: result.invitation.expiresAt,
      },
      inviteUrl: result.registrationUrl,
      emailQueued: true,
      emailSent,
    };
  }

  /** Create company without invitation; admin will fill the form next. */
  async createCompanyForAdminFill(
    actor: AuthUser,
    input: {
      name: string;
      email: string;
      phone?: string;
      phoneCountryCode?: string;
      formId: string;
      formVersionId: string;
      code?: string;
      industry?: string;
    },
  ) {
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();
    if (!name || !email) {
      throw new BadRequestException('Investor name and email are required');
    }
    if (!input.formId || !input.formVersionId) {
      throw new BadRequestException(
        'Select a published form for admin to fill',
      );
    }

    const version = await this.prisma.formVersion.findUnique({
      where: { id: input.formVersionId },
      include: { form: true, fields: true },
    });
    if (
      !version ||
      version.formId !== input.formId ||
      version.status !== 'PUBLISHED'
    ) {
      throw new BadRequestException('Select a published form version');
    }

    const code =
      input.code?.trim() ||
      name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 24) ||
      `CMP_${Date.now().toString(36).toUpperCase()}`;

    const existingCode = await this.prisma.organization.findUnique({
      where: { code },
    });
    if (existingCode) {
      throw new BadRequestException(
        `Organization code ${code} already exists — provide a unique code`,
      );
    }

    const phone =
      input.phone?.trim() && input.phoneCountryCode
        ? {
            phone: input.phone.trim(),
            phoneCountryCode: input.phoneCountryCode.trim(),
            contactEmail: email,
          }
        : {
            ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
            contactEmail: email,
          };

    const org = await this.prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          type: OrganizationType.COMPANY,
          code,
          name,
          industry: input.industry,
          status: 'PENDING_APPROVAL',
          customAttrs: phone,
        },
      });
      await tx.company.create({
        data: {
          organizationId: created.id,
          approvalStatus: 'IN_REVIEW',
        },
      });
      await tx.formAssignment.create({
        data: {
          formId: input.formId,
          formVersionId: input.formVersionId,
          organizationId: created.id,
        },
      });
      return created;
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'company.create.admin_fill',
      entityType: 'Organization',
      entityId: org.id,
      outcome: 'SUCCESS',
      after: { email, name, code },
    });

    const schemaJson = version.schemaJson;
    const parsed = formSchemaDefinition.safeParse(schemaJson);
    const schema = parsed.success
      ? parsed.data
      : {
          sections: [
            {
              id: randomUUID(),
              title: 'General',
              description: '',
              order: 0,
            },
          ],
          fields: [],
        };

    return {
      organization: org,
      formId: input.formId,
      formVersionId: input.formVersionId,
      formName: version.form.name,
      schema,
      contactEmail: email,
    };
  }

  async completeCompanyAdminFill(
    actor: AuthUser,
    organizationId: string,
    input: {
      formVersionId: string;
      responses: Record<string, unknown>;
    },
  ) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: { company: true },
    });
    if (!org?.company) {
      throw new NotFoundException('Investor not found');
    }

    const version = await this.prisma.formVersion.findUnique({
      where: { id: input.formVersionId },
      include: { fields: true },
    });
    if (!version || version.status !== 'PUBLISHED') {
      throw new BadRequestException('Invalid form version');
    }

    const submission = await this.prisma.$transaction(async (tx) => {
      const created = await tx.formSubmission.create({
        data: {
          formVersionId: input.formVersionId,
          organizationId,
          submittedById: actor.id,
          status: 'APPROVED',
          responses: input.responses as object,
          submittedAt: new Date(),
          reviewedAt: new Date(),
          reviewNotes: 'Submitted by admin and verified directly',
        },
      });
      await tx.company.update({
        where: { organizationId },
        data: {
          approvalStatus: 'VERIFIED',
          verificationStatus: 'VERIFIED',
          matchingEligible: true,
          normalizedProfile: {
            sourceSubmissionId: created.id,
            responses: input.responses,
          } as object,
          profileVersion: { increment: 1 },
        },
      });
      await tx.organization.update({
        where: { id: organizationId },
        data: { status: 'APPROVED' },
      });
      return created;
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'company.admin_fill.complete',
      entityType: 'FormSubmission',
      entityId: submission.id,
      outcome: 'SUCCESS',
    });

    this.peerRecs.scheduleRecompute(organizationId, 'company.admin_fill');

    return { submission, organizationId, status: 'VERIFIED' };
  }

  async inviteVendorsCsv(
    actor: AuthUser,
    rows: Array<{
      name: string;
      email: string;
      phone?: string;
      phoneCountryCode?: string;
      formId?: string;
      formVersionId?: string;
      code?: string;
    }>,
  ) {
    if (!rows.length) {
      throw new BadRequestException('CSV contains no rows');
    }
    const results = [];
    for (const row of rows) {
      try {
        const invited = await this.inviteVendor(actor, row);
        results.push({
          email: row.email,
          ok: true,
          organizationId: invited.organization.id,
          inviteUrl: invited.inviteUrl,
        });
      } catch (err) {
        results.push({
          email: row.email,
          ok: false,
          error: (err as Error).message,
        });
      }
    }
    return {
      total: rows.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  async createVendor(
    actor: AuthUser,
    input: {
      code: string;
      name: string;
      displayName?: string;
      industry?: string;
      country?: string;
      categories?: string[];
      capabilities?: string[];
    },
  ) {
    const existing = await this.prisma.organization.findUnique({
      where: { code: input.code },
    });
    if (existing) {
      throw new BadRequestException('Organization code already exists');
    }

    const org = await this.prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          type: OrganizationType.VENDOR,
          code: input.code,
          name: input.name,
          industry: input.industry,
          country: input.country,
          status: 'PENDING_APPROVAL',
        },
      });
      await tx.vendor.create({
        data: {
          organizationId: created.id,
          displayName: input.displayName ?? input.name,
          categories: input.categories ?? [],
          capabilities: input.capabilities ?? [],
          approvalStatus: 'INVITED',
        },
      });
      return created;
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'vendor.create',
      entityType: 'Organization',
      entityId: org.id,
      outcome: 'SUCCESS',
      after: { code: org.code, name: org.name },
    });

    return org;
  }

  async list(params: {
    type?: OrganizationType;
    page?: number;
    pageSize?: number;
    q?: string;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(Math.max(1, params.pageSize ?? 20), 100);
    const q = params.q?.trim().replace(/\s+/g, ' ') ?? '';
    const where = {
      ...(params.type ? { type: params.type } : {}),
      status: { not: 'ARCHIVED' as const },
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { code: { contains: q, mode: 'insensitive' as const } },
              { industry: { contains: q, mode: 'insensitive' as const } },
              {
                vendor: {
                  displayName: { contains: q, mode: 'insensitive' as const },
                },
              },
              {
                invitations: {
                  some: {
                    email: { contains: q, mode: 'insensitive' as const },
                  },
                },
              },
              {
                members: {
                  some: {
                    user: {
                      email: { contains: q, mode: 'insensitive' as const },
                    },
                  },
                },
              },
              {
                customAttrs: {
                  path: ['contactEmail'],
                  string_contains: q,
                },
              },
            ],
          }
        : {}),
    };

    const now = new Date();
    const [items, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        // Name-first when searching; newest-first for the default directory.
        orderBy: q ? { name: 'asc' } : { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          company: true,
          vendor: true,
          invitations: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { email: true, status: true },
          },
          members: {
            take: 1,
            orderBy: { joinedAt: 'asc' },
            include: {
              user: { select: { email: true } },
            },
          },
          formSubmissions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              status: true,
              submittedAt: true,
              formVersionId: true,
            },
          },
        },
      }),
      this.prisma.organization.count({ where }),
    ]);

    const orgIds = items.map((item) => item.id);
    const [assignments, meetings] = orgIds.length
      ? await Promise.all([
          this.prisma.investorPlaceAssignment.findMany({
            where: {
              organizationId: { in: orgIds },
              endsAt: { gt: now },
            },
            include: {
              place: {
                select: { id: true, name: true, location: true, code: true },
              },
            },
            orderBy: { startsAt: 'asc' },
          }),
          this.prisma.meeting.findMany({
            where: {
              OR: [
                { companyOrgId: { in: orgIds } },
                { vendorOrgId: { in: orgIds } },
              ],
              status: { not: 'CANCELLED' },
            },
            select: {
              companyOrgId: true,
              vendorOrgId: true,
              status: true,
              startsAt: true,
            },
          }),
        ])
      : [[], []];

    const assignmentByOrg = new Map<string, (typeof assignments)[number]>();
    for (const row of assignments) {
      if (!assignmentByOrg.has(row.organizationId)) {
        assignmentByOrg.set(row.organizationId, row);
      }
    }

    return {
      items: items.map((item) => {
        const attrs =
          item.customAttrs && typeof item.customAttrs === 'object'
            ? (item.customAttrs as Record<string, unknown>)
            : {};
        const attrEmail =
          typeof attrs.contactEmail === 'string' ? attrs.contactEmail : null;
        const logoUrl =
          typeof attrs.logoUrl === 'string' ? attrs.logoUrl : null;
        const mine = meetings.filter(
          (meeting) =>
            meeting.companyOrgId === item.id || meeting.vendorOrgId === item.id,
        );
        const upcoming = mine.filter(
          (meeting) =>
            meeting.startsAt >= now &&
            !['COMPLETED', 'NO_SHOW'].includes(meeting.status),
        );
        const confirmed = mine.filter((meeting) =>
          [
            'CONFIRMED',
            'IN_PROGRESS',
            'PUBLISHED',
            'AWAITING_CONFIRMATION',
            'RESCHEDULED',
            'RESCHEDULE_REQUESTED',
          ].includes(meeting.status),
        );
        const completed = mine.filter(
          (meeting) => meeting.status === 'COMPLETED',
        );
        const nextMeeting = [...upcoming].sort(
          (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
        )[0];
        const assignment = assignmentByOrg.get(item.id);
        return {
          ...item,
          contactEmail:
            item.invitations[0]?.email ??
            attrEmail ??
            item.members[0]?.user.email ??
            null,
          logoUrl,
          latestSubmission: item.formSubmissions[0] ?? null,
          workflowStatus:
            item.vendor?.approvalStatus ??
            item.company?.approvalStatus ??
            item.status,
          tableAssignment: assignment
            ? {
                placeName: assignment.place.name,
                location: assignment.place.location,
                startsAt: assignment.startsAt,
                endsAt: assignment.endsAt,
                allDay: assignment.allDay,
              }
            : null,
          meetingStats: {
            upcoming: upcoming.length,
            confirmed: confirmed.length,
            completed: completed.length,
            nextStartsAt: nextMeeting?.startsAt ?? null,
          },
        };
      }),
      page,
      pageSize,
      total,
    };
  }

  private async resolveOnboardingForm(type: 'COMPANY' | 'VENDOR') {
    const codes =
      type === 'COMPANY'
        ? ['WATER_INVESTOR_ONBOARDING']
        : ['WATER_INNOVATOR_ONBOARDING'];
    for (const code of codes) {
      const form = await this.prisma.form.findUnique({
        where: { code },
        include: {
          versions: {
            where: { status: 'PUBLISHED' },
            orderBy: { version: 'desc' },
            take: 1,
          },
        },
      });
      if (form?.versions[0]) {
        return { formId: form.id, formVersionId: form.versions[0].id };
      }
    }
    const fallback = await this.prisma.form.findFirst({
      where: {
        OR: [{ targetType: type }, { targetType: null }],
        versions: { some: { status: 'PUBLISHED' } },
      },
      include: {
        versions: {
          where: { status: 'PUBLISHED' },
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (fallback?.versions[0]) {
      return { formId: fallback.id, formVersionId: fallback.versions[0].id };
    }
    return null;
  }

  async getProfile(id: string) {
    const org = await this.get(id);
    const [submission, invitations, meetings, auditLogs] = await Promise.all([
      this.prisma.formSubmission.findFirst({
        where: { organizationId: id },
        orderBy: { createdAt: 'desc' },
        include: {
          formVersion: {
            include: {
              form: { select: { id: true, name: true, code: true } },
              fields: { orderBy: { displayOrder: 'asc' } },
            },
          },
        },
      }),
      this.prisma.invitation.findMany({
        where: { organizationId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.meeting.findMany({
        where: { OR: [{ companyOrgId: id }, { vendorOrgId: id }] },
        orderBy: { startsAt: 'desc' },
        take: 20,
        include: {
          companyOrg: { select: { name: true } },
          vendorOrg: { select: { name: true } },
          place: { select: { name: true } },
        },
      }),
      this.prisma.auditLog.findMany({
        where: { entityId: id },
        orderBy: { createdAt: 'desc' },
        take: 40,
        include: {
          actor: {
            select: { email: true, firstName: true, lastName: true },
          },
        },
      }),
    ]);

    const responses = (submission?.responses ?? {}) as Record<string, unknown>;
    const schema = (submission?.formVersion.schemaJson ?? {}) as {
      fields?: Array<{
        id?: string;
        key?: string;
        label?: string;
        type?: string;
      }>;
    };
    const answers = (schema.fields ?? [])
      .filter((field) => field.type !== 'heading' && field.type !== 'info')
      .map((field) => {
        const value =
          (field.key ? responses[field.key] : undefined) ??
          (field.id ? responses[field.id] : undefined);
        return {
          key: field.key ?? field.id ?? '',
          label: field.label ?? field.key ?? 'Field',
          value,
        };
      })
      .filter((row) => row.value !== undefined && row.value !== '');

    const activity = [
      ...auditLogs.map((log) => ({
        id: `audit:${log.id}`,
        at: log.createdAt,
        kind: 'audit',
        title: log.action.replaceAll('.', ' '),
        detail: log.actor
          ? [log.actor.firstName, log.actor.lastName].filter(Boolean).join(' ') ||
            log.actor.email
          : log.outcome,
      })),
      ...invitations.map((inv) => ({
        id: `invite:${inv.id}`,
        at: inv.createdAt,
        kind: 'invitation',
        title: `Invitation ${inv.status.toLowerCase()}`,
        detail: inv.email,
      })),
      ...(submission
        ? [
            {
              id: `submission:${submission.id}`,
              at: submission.submittedAt ?? submission.createdAt,
              kind: 'form',
              title: `Onboarding ${submission.status.toLowerCase()}`,
              detail: submission.formVersion.form.name,
            },
          ]
        : []),
      ...meetings.map((meeting) => ({
        id: `meeting:${meeting.id}`,
        at: meeting.startsAt,
        kind: 'meeting',
        title: `Meeting ${meeting.status.replaceAll('_', ' ').toLowerCase()}`,
        detail: `${meeting.companyOrg.name} × ${meeting.vendorOrg.name}${
          meeting.place ? ` · ${meeting.place.name}` : ''
        }`,
      })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    const latestInvitation = invitations[0] ?? null;
    const invitationLink = this.describeInvitationLinkForOrg(
      org,
      latestInvitation,
    );

    return {
      organization: org,
      submission: submission
        ? {
            id: submission.id,
            status: submission.status,
            submittedAt: submission.submittedAt,
            formName: submission.formVersion.form.name,
          }
        : null,
      answers,
      activity,
      invitationLink,
    };
  }

  private resolveOrgContactEmail(
    org: {
      members?: Array<{ isPrimary?: boolean; user: { email: string } }>;
      customAttrs?: unknown;
    },
    invitation: { email: string } | null,
  ): string | null {
    if (invitation?.email) {
      return invitation.email;
    }
    const attrs = org.customAttrs as { contactEmail?: string } | null;
    if (attrs?.contactEmail?.trim()) {
      return attrs.contactEmail.trim().toLowerCase();
    }
    const primary =
      org.members?.find((member) => member.isPrimary) ?? org.members?.[0];
    return primary?.user.email?.toLowerCase() ?? null;
  }

  private isOrgRegistered(org: {
    company?: { approvalStatus?: string } | null;
    vendor?: { approvalStatus?: string } | null;
    members?: Array<{ user: { status: string } }>;
  }): boolean {
    const approval =
      org.vendor?.approvalStatus ?? org.company?.approvalStatus ?? '';
    if (approval === 'VERIFIED' || approval === 'APPROVED') {
      return true;
    }
    return (
      org.members?.some((member) => member.user.status === 'ACTIVE') ?? false
    );
  }

  private describeInvitationLinkForOrg(
    org: {
      company?: { approvalStatus?: string } | null;
      vendor?: { approvalStatus?: string } | null;
      members?: Array<{ isPrimary?: boolean; user: { email: string; status: string } }>;
      customAttrs?: unknown;
    },
    invitation: {
      email: string;
      status: string;
      expiresAt: Date;
    } | null,
  ) {
    const email = this.resolveOrgContactEmail(org, invitation);
    const registered = this.isOrgRegistered(org);

    if (invitation?.status === 'ACCEPTED' || registered) {
      return {
        show: true as const,
        canCopy: false as const,
        reason: 'registered' as const,
        email: email ?? invitation?.email,
        status: invitation?.status,
      };
    }
    if (invitation?.status === 'REVOKED') {
      return {
        show: true as const,
        canCopy: false as const,
        reason: 'revoked' as const,
        email: invitation.email,
        status: invitation.status,
      };
    }
    const copyableInvite =
      invitation &&
      ['PENDING', 'SENT', 'DELIVERED', 'EXPIRED', 'FAILED'].includes(
        invitation.status,
      );
    if (copyableInvite) {
      return {
        show: true as const,
        canCopy: true as const,
        reason: 'ready' as const,
        email: invitation.email,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      };
    }
    if (email) {
      return {
        show: true as const,
        canCopy: true as const,
        reason: 'create_on_issue' as const,
        email,
      };
    }
    return {
      show: true as const,
      canCopy: false as const,
      reason: 'no_email' as const,
    };
  }

  private buildRegistrationUrl(
    type: OrganizationType,
    token: string,
    formId?: string | null,
    formVersionId?: string | null,
  ) {
    const formQuery =
      formId && formVersionId
        ? `&formId=${formId}&formVersionId=${formVersionId}`
        : '';
    const path =
      type === OrganizationType.COMPANY
        ? '/register/investor'
        : '/register/innovator';
    return `${this.env.appUrl}${path}?token=${token}${formQuery}`;
  }

  async issueInvitationLink(actor: AuthUser, organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        company: true,
        vendor: true,
        members: {
          include: {
            user: { select: { email: true, status: true } },
          },
        },
        formAssignments: { orderBy: { assignedAt: 'desc' }, take: 1 },
      },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    if (this.isOrgRegistered(org)) {
      throw new BadRequestException(
        'This profile is already registered. Invitation links are only for pending sign-ups.',
      );
    }

    let invitation = await this.prisma.invitation.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    if (invitation?.status === 'REVOKED') {
      throw new BadRequestException('The invitation was revoked.');
    }

    const contactEmail = this.resolveOrgContactEmail(org, invitation);
    if (!contactEmail) {
      throw new BadRequestException(
        'No invite email on this profile. Add an email when inviting from the directory.',
      );
    }

    let assignment = org.formAssignments[0];
    if (!assignment) {
      const defaults = await this.resolveOnboardingForm(
        org.type === OrganizationType.COMPANY ? 'COMPANY' : 'VENDOR',
      );
      if (defaults) {
        assignment = await this.prisma.formAssignment.create({
          data: {
            formId: defaults.formId,
            formVersionId: defaults.formVersionId,
            organizationId: org.id,
          },
        });
      }
    }

    const token = generateSecureToken(32);
    const tokenHash = hashToken(token);
    const expiresAt = new Date(
      Date.now() + this.env.invitationTtlDays * 86_400_000,
    );
    const inviteUrl = this.buildRegistrationUrl(
      org.type,
      token,
      assignment?.formId,
      assignment?.formVersionId,
    );

    const roleCode =
      org.type === OrganizationType.COMPANY ? 'COMPANY_USER' : 'VENDOR_USER';
    const role = await this.prisma.role.findUnique({ where: { code: roleCode } });
    if (!role) {
      throw new BadRequestException('Role configuration missing');
    }

    if (!invitation) {
      invitation = await this.prisma.invitation.create({
        data: {
          email: contactEmail,
          organizationId: org.id,
          roleId: role.id,
          tokenHash,
          status: 'PENDING',
          expiresAt,
          createdById: actor.id,
          idempotencyKey: `invite-link:${organizationId}:${contactEmail}:${Date.now()}`,
        },
      });
    } else {
      invitation = await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: {
          email: contactEmail,
          tokenHash,
          status: 'PENDING',
          expiresAt,
        },
      });
    }

    await this.audit.record({
      actorId: actor.id,
      action: 'invitation.link_issue',
      entityType: 'Invitation',
      entityId: invitation.id,
      outcome: 'SUCCESS',
      after: { organizationId, email: invitation.email, expiresAt },
    });

    return {
      inviteUrl,
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      status: invitation.status,
    };
  }

  async get(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        company: true,
        vendor: true,
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                status: true,
              },
            },
          },
        },
      },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return org;
  }

  async update(
    actor: AuthUser,
    id: string,
    input: {
      name?: string;
      industry?: string | null;
      country?: string | null;
      region?: string | null;
      website?: string | null;
      address?: string | null;
      timeZone?: string;
      status?: string;
      displayName?: string;
      categories?: string[];
      capabilities?: string[];
    },
  ) {
    const existing = await this.prisma.organization.findUnique({
      where: { id },
      include: { company: true, vendor: true },
    });
    if (!existing) {
      throw new NotFoundException('Organization not found');
    }

    const org = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.organization.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.industry !== undefined ? { industry: input.industry } : {}),
          ...(input.country !== undefined ? { country: input.country } : {}),
          ...(input.region !== undefined ? { region: input.region } : {}),
          ...(input.website !== undefined ? { website: input.website } : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          ...(input.timeZone !== undefined ? { timeZone: input.timeZone } : {}),
          ...(input.status !== undefined
            ? { status: input.status as never }
            : {}),
        },
        include: { company: true, vendor: true },
      });

      if (existing.vendor) {
        await tx.vendor.update({
          where: { organizationId: id },
          data: {
            ...(input.displayName !== undefined
              ? { displayName: input.displayName }
              : {}),
            ...(input.categories !== undefined
              ? { categories: input.categories }
              : {}),
            ...(input.capabilities !== undefined
              ? { capabilities: input.capabilities }
              : {}),
          },
        });
      }

      return tx.organization.findUniqueOrThrow({
        where: { id },
        include: { company: true, vendor: true },
      });
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'organization.update',
      entityType: 'Organization',
      entityId: id,
      outcome: 'SUCCESS',
      before: { name: existing.name, status: existing.status },
      after: { name: org.name, status: org.status },
    });

    return org;
  }

  async setFeatured(actor: AuthUser, id: string, featured: boolean) {
    const existing = await this.prisma.organization.findUnique({
      where: { id },
      include: { company: true, vendor: true },
    });
    if (!existing) {
      throw new NotFoundException('Organization not found');
    }
    if (existing.type === 'PLATFORM') {
      throw new BadRequestException('Platform organization cannot be featured');
    }
    if (!existing.company && !existing.vendor) {
      throw new BadRequestException('Organization profile not found');
    }

    if (existing.company) {
      await this.prisma.company.update({
        where: { organizationId: id },
        data: { featured },
      });
    }
    if (existing.vendor) {
      await this.prisma.vendor.update({
        where: { organizationId: id },
        data: { featured },
      });
    }

    await this.audit.record({
      actorId: actor.id,
      action: featured ? 'organization.feature' : 'organization.unfeature',
      entityType: 'Organization',
      entityId: id,
      outcome: 'SUCCESS',
      metadata: { featured, type: existing.type },
    });

    return this.get(id);
  }

  async remove(actor: AuthUser, id: string) {
    const existing = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        members: { select: { userId: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException('Organization not found');
    }
    if (existing.type === 'PLATFORM') {
      throw new BadRequestException('Platform organization cannot be deleted');
    }

    const memberUserIds = [
      ...new Set(existing.members.map((member) => member.userId)),
    ];

    await this.prisma.$transaction(async (tx) => {
      const meetings = await tx.meeting.findMany({
        where: {
          OR: [{ companyOrgId: id }, { vendorOrgId: id }],
        },
        select: { id: true },
      });
      const meetingIds = meetings.map((meeting) => meeting.id);

      if (meetingIds.length) {
        await tx.meetingFeedback.deleteMany({
          where: { meetingId: { in: meetingIds } },
        });
        await tx.followUpAction.deleteMany({
          where: { meetingId: { in: meetingIds } },
        });
        await tx.meetingRequest.deleteMany({
          where: { meetingId: { in: meetingIds } },
        });
        await tx.meetingOccupancy.deleteMany({
          where: { meetingId: { in: meetingIds } },
        });
        await tx.meeting.deleteMany({
          where: { id: { in: meetingIds } },
        });
      }

      await tx.meetingFeedback.deleteMany({ where: { organizationId: id } });
      await tx.followUpAction.deleteMany({ where: { organizationId: id } });
      await tx.meetingRequest.deleteMany({
        where: { OR: [{ fromOrgId: id }, { toOrgId: id }] },
      });

      await tx.matchCandidate.deleteMany({
        where: { OR: [{ companyOrgId: id }, { vendorOrgId: id }] },
      });
      await tx.match.deleteMany({
        where: { OR: [{ companyOrgId: id }, { vendorOrgId: id }] },
      });

      const submissions = await tx.formSubmission.findMany({
        where: { organizationId: id },
        select: { id: true },
      });
      if (submissions.length) {
        await tx.submissionCorrection.deleteMany({
          where: {
            submissionId: { in: submissions.map((submission) => submission.id) },
          },
        });
        await tx.formSubmission.deleteMany({
          where: { organizationId: id },
        });
      }

      await tx.formAssignment.deleteMany({ where: { organizationId: id } });
      await tx.invitation.deleteMany({ where: { organizationId: id } });
      await tx.document.deleteMany({ where: { organizationId: id } });
      await tx.eventRegistration.deleteMany({ where: { organizationId: id } });

      await tx.organization.delete({ where: { id } });

      for (const userId of memberUserIds) {
        const remaining = await tx.organizationMember.count({
          where: { userId },
        });
        if (remaining > 0) continue;

        const adminRole = await tx.userRole.findFirst({
          where: {
            userId,
            role: { code: { in: ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'] } },
          },
        });
        if (adminRole) continue;

        await tx.auditLog.updateMany({
          where: { actorId: userId },
          data: { actorId: null },
        });
        await tx.invitation.updateMany({
          where: { acceptedById: userId },
          data: { acceptedById: null },
        });
        await tx.eventRegistration.deleteMany({ where: { userId } });
        await tx.followUpAction.deleteMany({
          where: { OR: [{ assigneeId: userId }, { createdById: userId }] },
        });
        await tx.meetingFeedback.deleteMany({ where: { reviewerUserId: userId } });
        await tx.meetingParticipant.deleteMany({ where: { userId } });
        await tx.meetingConfirmation.deleteMany({ where: { userId } });

        const leftoverInvites = await tx.invitation.count({
          where: { createdById: userId },
        });
        const leftoverSubmissions = await tx.formSubmission.count({
          where: { submittedById: userId },
        });
        const leftoverCorrections = await tx.submissionCorrection.count({
          where: { requestedById: userId },
        });
        if (leftoverInvites || leftoverSubmissions || leftoverCorrections) {
          continue;
        }

        await tx.user.delete({ where: { id: userId } });
      }
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'organization.delete.permanent',
      entityType: 'Organization',
      entityId: id,
      outcome: 'SUCCESS',
      before: {
        status: existing.status,
        name: existing.name,
        type: existing.type,
        code: existing.code,
      },
      after: { deleted: true },
      metadata: { memberUserIds },
    });

    return { id, deleted: true };
  }

  async approveVendor(actor: AuthUser, id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        vendor: true,
        members: {
          include: {
            user: { select: { email: true, firstName: true, lastName: true } },
          },
          orderBy: [{ isPrimary: 'desc' }, { joinedAt: 'asc' }],
          take: 1,
        },
      },
    });
    if (!org?.vendor) {
      throw new NotFoundException('Innovator not found');
    }

    const latestSubmission = await this.prisma.formSubmission.findFirst({
      where: { organizationId: id },
      orderBy: { updatedAt: 'desc' },
      include: {
        formVersion: { include: { form: true } },
        submittedBy: {
          select: { email: true, firstName: true, lastName: true },
        },
      },
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id },
        data: { status: 'APPROVED' },
      });
      if (latestSubmission) {
        await tx.formSubmission.update({
          where: { id: latestSubmission.id },
          data: { status: 'APPROVED', reviewedAt: new Date() },
        });
        await tx.submissionCorrection.updateMany({
          where: { submissionId: latestSubmission.id, status: 'OPEN' },
          data: { status: 'RESOLVED', resolvedAt: new Date() },
        });
      }
      return tx.vendor.update({
        where: { organizationId: id },
        data: {
          approvalStatus: 'VERIFIED',
          verificationStatus: 'VERIFIED',
          matchingEligible: true,
          onboardingComplete: true,
        },
      });
    });

    const attrs =
      org.customAttrs && typeof org.customAttrs === 'object'
        ? (org.customAttrs as Record<string, unknown>)
        : {};
    const contactEmail =
      latestSubmission?.submittedBy?.email ||
      (typeof attrs.contactEmail === 'string' ? attrs.contactEmail : null) ||
      org.members[0]?.user.email ||
      null;
    const contactName =
      [latestSubmission?.submittedBy?.firstName, latestSubmission?.submittedBy?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim() ||
      (typeof attrs.contactName === 'string' ? attrs.contactName : null) ||
      [org.members[0]?.user.firstName, org.members[0]?.user.lastName]
        .filter(Boolean)
        .join(' ')
        .trim() ||
      null;

    let emailSent = false;
    if (contactEmail) {
      try {
        const fromName = await this.email.getFromName();
        const template = renderVerifiedEmail({
          brandName: fromName,
          organizationName: org.name,
          formName: latestSubmission?.formVersion.form.name,
          audience: 'vendor',
          recipientName: contactName,
          dashboardUrl: `${this.env.appUrl}/vendor`,
        });
        await this.email.send({
          to: contactEmail,
          subject: template.subject,
          text: template.text,
          html: template.html,
          idempotencyKey: `vendor.verified.email:${id}`,
          templateCode: 'approved',
        });
        emailSent = true;
      } catch (err) {
        this.logger.warn(
          `Innovator verified email failed for ${contactEmail}: ${(err as Error).message}`,
        );
      }
    }

    await this.audit.record({
      actorId: actor.id,
      action: 'vendor.approve',
      entityType: 'Innovator',
      entityId: id,
      outcome: 'SUCCESS',
      after: { emailSent, email: contactEmail },
    });

    this.peerRecs.scheduleRecompute(id, 'vendor.approve');

    return { ...updated, emailSent, email: contactEmail };
  }
}
