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

  private normalizeCoords(input: {
    latitude?: number | null;
    longitude?: number | null;
  }) {
    const hasLat = input.latitude !== undefined;
    const hasLng = input.longitude !== undefined;
    if (!hasLat && !hasLng) return {};

    const latitude =
      input.latitude === null || input.latitude === undefined
        ? null
        : Number(input.latitude);
    const longitude =
      input.longitude === null || input.longitude === undefined
        ? null
        : Number(input.longitude);

    if (latitude === null && longitude === null) {
      return { latitude: null, longitude: null };
    }
    if (
      latitude == null ||
      longitude == null ||
      Number.isNaN(latitude) ||
      Number.isNaN(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new BadRequestException('Valid latitude and longitude are required');
    }
    return { latitude, longitude };
  }

  async create(
    actor: AuthUser,
    input: {
      name: string;
      code?: string;
      description?: string;
      capacity?: number;
      location?: string;
      latitude?: number | null;
      longitude?: number | null;
      mapAddress?: string | null;
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
    const coords = this.normalizeCoords(input);

    const place = await this.prisma.place.create({
      data: {
        name,
        code,
        description: input.description?.trim() || null,
        capacity: input.capacity ?? null,
        location: input.location?.trim() || null,
        ...coords,
        mapAddress:
          input.mapAddress === undefined
            ? null
            : input.mapAddress?.trim() || null,
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
      latitude?: number | null;
      longitude?: number | null;
      mapAddress?: string | null;
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

    const coords = this.normalizeCoords(input);

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
        ...coords,
        ...(input.mapAddress !== undefined
          ? { mapAddress: input.mapAddress?.trim() || null }
          : {}),
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

  /**
   * Proxy OpenStreetMap Nominatim so the browser can search locations
   * without CORS issues and with a proper User-Agent.
   */
  async searchMap(query: string) {
    const q = query.trim();
    if (q.length < 2) return [];
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'json');
    url.searchParams.set('q', q);
    url.searchParams.set('limit', '8');
    url.searchParams.set('addressdetails', '0');

    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'EtharaMatchmaking/1.0 (places-map-search)',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      throw new BadRequestException(`Map search failed (${res.status})`);
    }
    const rows = (await res.json()) as Array<{
      display_name?: string;
      lat?: string;
      lon?: string;
    }>;
    return rows
      .map((row) => {
        const latitude = Number(row.lat);
        const longitude = Number(row.lon);
        if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
        return {
          label: row.display_name ?? `${latitude}, ${longitude}`,
          latitude,
          longitude,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
  }

  async reverseGeocode(latitude: number, longitude: number) {
    if (
      Number.isNaN(latitude) ||
      Number.isNaN(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new BadRequestException('Valid latitude and longitude are required');
    }
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'json');
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('zoom', '18');

    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'EtharaMatchmaking/1.0 (places-map-reverse)',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      throw new BadRequestException(`Reverse geocode failed (${res.status})`);
    }
    const json = (await res.json()) as { display_name?: string };
    return {
      label: json.display_name ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
      latitude,
      longitude,
    };
  }

  /**
   * Places free for the given window — excludes booked meetings and open
   * request holds. Declined / cancelled requests do not occupy a place.
   */
  async available(
    startsAt: Date,
    endsAt: Date,
    options?: { excludeRequestId?: string },
  ) {
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

    const busyMeetings = await this.prisma.meeting.findMany({
      where: {
        placeId: { not: null },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { placeId: true },
    });

    // Reserve places held by open proposals (not declined/cancelled/scheduled).
    const busyProposals = await this.prisma.meetingRequest.findMany({
      where: {
        placeId: { not: null },
        status: { in: ['AWAITING_CONFIRMATION', 'INTEREST_ACCEPTED'] },
        proposedStartsAt: { not: null, lt: endsAt },
        proposedEndsAt: { not: null, gt: startsAt },
        ...(options?.excludeRequestId
          ? { id: { not: options.excludeRequestId } }
          : {}),
      },
      select: { placeId: true },
    });

    const busyIds = new Set(
      [...busyMeetings, ...busyProposals]
        .map((row) => row.placeId)
        .filter((id): id is string => Boolean(id)),
    );

    return places.filter((p) => !busyIds.has(p.id));
  }
}
