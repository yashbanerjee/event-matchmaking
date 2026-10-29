import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/decorators';

@Injectable()
export class PlacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(params?: { activeOnly?: boolean }) {
    return this.prisma.place.findMany({
      where: params?.activeOnly ? { isActive: true } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async create(
    actor: AuthUser,
    input: {
      name: string;
      code?: string;
      description?: string;
      capacity?: number;
      location?: string;
    },
  ) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Place name is required');
    const code =
      input.code?.trim().toUpperCase() ||
      name
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .toUpperCase()
        .slice(0, 24) ||
      `PLACE-${Date.now()}`;

    const place = await this.prisma.place.create({
      data: {
        name,
        code,
        description: input.description?.trim() || null,
        capacity: input.capacity ?? null,
        location: input.location?.trim() || null,
      },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'place.create',
      entityType: 'Place',
      entityId: place.id,
      outcome: 'SUCCESS',
    });

    return place;
  }

  async update(
    actor: AuthUser,
    id: string,
    input: {
      name?: string;
      code?: string;
      description?: string | null;
      capacity?: number | null;
      location?: string | null;
      isActive?: boolean;
    },
  ) {
    const existing = await this.prisma.place.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Place not found');

    const nextCode =
      input.code !== undefined
        ? input.code.trim().toUpperCase() || existing.code
        : undefined;
    if (nextCode && nextCode !== existing.code) {
      const clash = await this.prisma.place.findFirst({
        where: { code: nextCode, id: { not: id } },
        select: { id: true },
      });
      if (clash) {
        throw new BadRequestException('A place with this code already exists');
      }
    }

    const place = await this.prisma.place.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(nextCode !== undefined ? { code: nextCode } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'place.update',
      entityType: 'Place',
      entityId: place.id,
      outcome: 'SUCCESS',
    });

    return place;
  }

  async remove(actor: AuthUser, id: string) {
    const existing = await this.prisma.place.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Place not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.meeting.updateMany({
        where: { placeId: id },
        data: { placeId: null },
      });
      await tx.meetingRequest.updateMany({
        where: { placeId: id },
        data: { placeId: null },
      });
      await tx.place.delete({ where: { id } });
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'place.delete',
      entityType: 'Place',
      entityId: id,
      outcome: 'SUCCESS',
      metadata: { name: existing.name, code: existing.code },
    });

    return { id, deleted: true as const };
  }

  /** Places free for the given window (no overlapping non-cancelled meeting). */
  async available(startsAt: Date, endsAt: Date) {
    if (!(startsAt instanceof Date) || Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException('Invalid start time');
    }
    if (!(endsAt instanceof Date) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Invalid end time');
    }
    if (endsAt <= startsAt) {
      throw new BadRequestException('End time must be after start time');
    }

    const places = await this.prisma.place.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    const busy = await this.prisma.meeting.findMany({
      where: {
        placeId: { not: null },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { placeId: true },
    });
    const busyIds = new Set(
      busy.map((m) => m.placeId).filter((id): id is string => Boolean(id)),
    );

    return places.filter((p) => !busyIds.has(p.id));
  }
}
