import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrganizationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EnvService } from '../config/env.service';
import { OutboxService } from '../messaging/outbox.service';
import { generateSecureToken, hashToken } from '../common/crypto.util';
import type { AuthUser } from '../common/decorators';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly env: EnvService,
    private readonly outbox: OutboxService,
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
        data: { organizationId: created.id },
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

    return org;
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
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();
    if (!name || !email) {
      throw new BadRequestException('Vendor name and email are required');
    }

    const code =
      input.code?.trim() ||
      name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 24) ||
      `VND_${Date.now().toString(36).toUpperCase()}`;

    const existingCode = await this.prisma.organization.findUnique({
      where: { code },
    });
    if (existingCode) {
      throw new BadRequestException(
        `Organization code ${code} already exists — provide a unique code`,
      );
    }

    const role = await this.prisma.role.findUnique({
      where: { code: 'VENDOR_USER' },
    });
    if (!role) {
      throw new BadRequestException('VENDOR_USER role is missing');
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
      if (!version || version.formId !== input.formId || version.status !== 'PUBLISHED') {
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
          }
        : input.phone?.trim()
          ? { phone: input.phone.trim() }
          : {};

    const result = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          type: OrganizationType.VENDOR,
          code,
          name,
          status: 'PENDING_APPROVAL',
          customAttrs: phone,
        },
      });

      await tx.vendor.create({
        data: {
          organizationId: org.id,
          displayName: name,
          categories: [],
          capabilities: [],
          approvalStatus: 'INVITED',
        },
      });

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
          idempotencyKey: `vendor-invite:${email}:${org.id}:${Date.now()}`,
        },
      });

      const formQuery =
        input.formId && input.formVersionId
          ? `&formId=${input.formId}&formVersionId=${input.formVersionId}`
          : '';
      const registrationUrl = `${this.env.appUrl}/register?token=${token}${formQuery}`;

      await this.outbox.enqueue(tx, {
        aggregateType: 'Invitation',
        aggregateId: invitation.id,
        eventType: 'invitation.send',
        idempotencyKey: `invitation.send:${invitation.id}`,
        payload: {
          invitationId: invitation.id,
          email,
          organizationName: org.name,
          roleCode: 'VENDOR_USER',
          registrationUrl,
          expiresAt: expiresAt.toISOString(),
          formAttached: Boolean(input.formId),
        },
      });

      return { org, invitation, registrationUrl };
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'vendor.invite',
      entityType: 'Organization',
      entityId: result.org.id,
      outcome: 'SUCCESS',
      after: { email, name, code },
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
    };
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
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 20, 100);
    const where = {
      ...(params.type ? { type: params.type } : {}),
      status: { not: 'ARCHIVED' as const },
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: 'insensitive' as const } },
              { code: { contains: params.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          company: true,
          vendor: true,
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

    return {
      items: items.map((item) => ({
        ...item,
        latestSubmission: item.formSubmissions[0] ?? null,
        workflowStatus: item.vendor?.approvalStatus ?? item.status,
      })),
      page,
      pageSize,
      total,
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

  async remove(actor: AuthUser, id: string) {
    const existing = await this.prisma.organization.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Organization not found');
    }
    if (existing.type === 'PLATFORM') {
      throw new BadRequestException('Platform organization cannot be deleted');
    }

    const org = await this.prisma.organization.update({
      where: { id },
      data: {
        status: 'ARCHIVED',
        archivedAt: new Date(),
      },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'organization.delete',
      entityType: 'Organization',
      entityId: id,
      outcome: 'SUCCESS',
      before: { status: existing.status },
      after: { status: org.status },
    });

    return { id: org.id, status: org.status, archivedAt: org.archivedAt };
  }

  async approveVendor(actor: AuthUser, id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: { vendor: true },
    });
    if (!org?.vendor) {
      throw new NotFoundException('Vendor not found');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id },
        data: { status: 'APPROVED' },
      });
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

    await this.audit.record({
      actorId: actor.id,
      action: 'vendor.approve',
      entityType: 'Vendor',
      entityId: id,
      outcome: 'SUCCESS',
    });

    return updated;
  }
}
