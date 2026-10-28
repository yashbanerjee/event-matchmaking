import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrganizationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/decorators';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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
        include: { company: true, vendor: true },
      }),
      this.prisma.organization.count({ where }),
    ]);

    return { items, page, pageSize, total };
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
          approvalStatus: 'APPROVED',
          matchingEligible: org.vendor!.onboardingComplete,
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
