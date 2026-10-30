import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/decorators';

const PROFILE_KEYS = new Set([
  'categories',
  'preferredCategories',
  'capabilities',
  'industry',
  'regions',
  'commercialTags',
]);

function slugify(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

@Injectable()
export class FiltersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listDimensions(params?: { activeOnly?: boolean }) {
    return this.prisma.filterDimension.findMany({
      where: params?.activeOnly ? { isActive: true } : undefined,
      include: {
        tags: {
          where: params?.activeOnly ? { isActive: true } : undefined,
          orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createDimension(
    actor: AuthUser,
    input: {
      name: string;
      code?: string;
      description?: string;
      profileKey?: string;
    },
  ) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Name is required');
    const code = slugify(input.code?.trim() || name);
    if (!code) throw new BadRequestException('Code is required');
    const profileKey = input.profileKey?.trim() || 'categories';
    if (!PROFILE_KEYS.has(profileKey)) {
      throw new BadRequestException(
        `profileKey must be one of: ${[...PROFILE_KEYS].join(', ')}`,
      );
    }

    const created = await this.prisma.filterDimension.create({
      data: {
        name,
        code,
        description: input.description?.trim() || null,
        profileKey,
      },
      include: { tags: true },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'filter_dimension.create',
      entityType: 'FilterDimension',
      entityId: created.id,
      outcome: 'SUCCESS',
    });

    return created;
  }

  async updateDimension(
    actor: AuthUser,
    id: string,
    input: {
      name?: string;
      description?: string | null;
      profileKey?: string;
      isActive?: boolean;
      sortOrder?: number;
    },
  ) {
    const existing = await this.prisma.filterDimension.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Filter dimension not found');

    if (input.profileKey && !PROFILE_KEYS.has(input.profileKey)) {
      throw new BadRequestException(
        `profileKey must be one of: ${[...PROFILE_KEYS].join(', ')}`,
      );
    }

    const updated = await this.prisma.filterDimension.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.profileKey !== undefined
          ? { profileKey: input.profileKey }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
      include: {
        tags: { orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] },
      },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'filter_dimension.update',
      entityType: 'FilterDimension',
      entityId: id,
      outcome: 'SUCCESS',
    });

    return updated;
  }

  async createTag(
    actor: AuthUser,
    dimensionId: string,
    input: { label: string; value?: string },
  ) {
    const dimension = await this.prisma.filterDimension.findUnique({
      where: { id: dimensionId },
    });
    if (!dimension) throw new NotFoundException('Filter dimension not found');

    const label = input.label.trim();
    if (!label) throw new BadRequestException('Tag label is required');
    const value = slugify(input.value?.trim() || label);
    if (!value) throw new BadRequestException('Tag value is required');

    const maxOrder = await this.prisma.filterTag.aggregate({
      where: { dimensionId },
      _max: { sortOrder: true },
    });

    const created = await this.prisma.filterTag.create({
      data: {
        dimensionId,
        label,
        value,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'filter_tag.create',
      entityType: 'FilterTag',
      entityId: created.id,
      outcome: 'SUCCESS',
    });

    return created;
  }

  async updateTag(
    actor: AuthUser,
    id: string,
    input: {
      label?: string;
      value?: string;
      isActive?: boolean;
      sortOrder?: number;
    },
  ) {
    const existing = await this.prisma.filterTag.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Filter tag not found');

    const updated = await this.prisma.filterTag.update({
      where: { id },
      data: {
        ...(input.label !== undefined ? { label: input.label.trim() } : {}),
        ...(input.value !== undefined
          ? { value: slugify(input.value) }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'filter_tag.update',
      entityType: 'FilterTag',
      entityId: id,
      outcome: 'SUCCESS',
    });

    return updated;
  }

  async deleteTag(actor: AuthUser, id: string) {
    const existing = await this.prisma.filterTag.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Filter tag not found');
    await this.prisma.filterTag.delete({ where: { id } });
    await this.audit.record({
      actorId: actor.id,
      action: 'filter_tag.delete',
      entityType: 'FilterTag',
      entityId: id,
      outcome: 'SUCCESS',
    });
    return { ok: true };
  }

  listMappings() {
    return this.prisma.filterTagMapping.findMany({
      include: {
        fromTag: {
          include: { dimension: { select: { id: true, name: true, code: true } } },
        },
        toTag: {
          include: { dimension: { select: { id: true, name: true, code: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createMapping(
    actor: AuthUser,
    input: { fromTagId: string; toTagId: string; bidirectional?: boolean },
  ) {
    if (input.fromTagId === input.toTagId) {
      throw new BadRequestException('Cannot map a tag to itself');
    }
    const [fromTag, toTag] = await Promise.all([
      this.prisma.filterTag.findUnique({ where: { id: input.fromTagId } }),
      this.prisma.filterTag.findUnique({ where: { id: input.toTagId } }),
    ]);
    if (!fromTag || !toTag) {
      throw new NotFoundException('One or both tags were not found');
    }

    const created = await this.prisma.filterTagMapping.create({
      data: {
        fromTagId: input.fromTagId,
        toTagId: input.toTagId,
        bidirectional: input.bidirectional ?? true,
      },
      include: {
        fromTag: { include: { dimension: true } },
        toTag: { include: { dimension: true } },
      },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'filter_tag_mapping.create',
      entityType: 'FilterTagMapping',
      entityId: created.id,
      outcome: 'SUCCESS',
    });

    return created;
  }

  async deleteMapping(actor: AuthUser, id: string) {
    const existing = await this.prisma.filterTagMapping.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Mapping not found');
    await this.prisma.filterTagMapping.delete({ where: { id } });
    await this.audit.record({
      actorId: actor.id,
      action: 'filter_tag_mapping.delete',
      entityType: 'FilterTagMapping',
      entityId: id,
      outcome: 'SUCCESS',
    });
    return { ok: true };
  }

  /** Label/value pairs for synonym expansion in scoring. */
  async listEquivalences(): Promise<
    Array<{ from: string; to: string; bidirectional: boolean }>
  > {
    const mappings = await this.prisma.filterTagMapping.findMany({
      include: {
        fromTag: { select: { label: true, value: true } },
        toTag: { select: { label: true, value: true } },
      },
    });
    const edges: Array<{ from: string; to: string; bidirectional: boolean }> =
      [];
    for (const mapping of mappings) {
      // Match on both stored value (slug) and display label.
      const pairs = [
        [mapping.fromTag.value, mapping.toTag.value],
        [mapping.fromTag.label, mapping.toTag.label],
        [mapping.fromTag.value, mapping.toTag.label],
        [mapping.fromTag.label, mapping.toTag.value],
      ] as const;
      for (const [from, to] of pairs) {
        edges.push({
          from,
          to,
          bidirectional: mapping.bidirectional,
        });
      }
    }
    return edges;
  }

  /**
   * Normalize slug/value and label → Ethara display label for recommendation copy.
   */
  async listTagLabelIndex(): Promise<Record<string, string>> {
    const tags = await this.prisma.filterTag.findMany({
      where: { isActive: true },
      select: { value: true, label: true },
    });
    const index: Record<string, string> = {};
    for (const tag of tags) {
      const label = tag.label.trim();
      if (!label) continue;
      const valueKey = tag.value.trim().toLowerCase();
      const labelKey = label.toLowerCase();
      if (valueKey) index[valueKey] = label;
      index[labelKey] = label;
    }
    return index;
  }

  optionsForDimension(dimensionId: string) {
    return this.prisma.filterTag.findMany({
      where: { dimensionId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      select: { id: true, value: true, label: true },
    });
  }
}
