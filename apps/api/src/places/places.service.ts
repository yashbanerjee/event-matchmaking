import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/decorators';

type PlaceDb = Prisma.TransactionClient | PrismaService;

const ASSIGNMENT_INCLUDE = {
  organization: { select: { id: true, name: true, code: true, type: true } },
  place: {
    select: {
      id: true,
      name: true,
      code: true,
      location: true,
      latitude: true,
      longitude: true,
      mapAddress: true,
      isActive: true,
    },
  },
} as const;

function venueLabel(place: { name: string; location?: string | null }) {
  return place.location ? `${place.name} · ${place.location}` : place.name;
}

function dubaiRange(date: string, startHm: string, endHm: string) {
  const startsAt = new Date(`${date}T${startHm}:00+04:00`);
  const endsAt = new Date(`${date}T${endHm}:00+04:00`);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw new BadRequestException('Invalid date or time');
  }
  if (endsAt <= startsAt) {
    throw new BadRequestException('End time must be after start time');
  }
  return { startsAt, endsAt };
}

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
   * Places free for the given window — excludes booked meetings, open
   * request holds, and tables reserved for another investor.
   */
  async available(
    startsAt: Date,
    endsAt: Date,
    options?: {
      excludeRequestId?: string;
      fromOrgId?: string;
      toOrgId?: string;
    },
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

    const ownerOrgIds = [options?.fromOrgId, options?.toOrgId].filter(
      (id): id is string => Boolean(id),
    );
    const assigned = await this.resolveInvestorPlace({
      organizationIds: ownerOrgIds,
      startsAt,
      endsAt,
    });
    if (assigned) {
      return [{ ...assigned, assignedToInvestor: true }];
    }

    const places = await this.prisma.place.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    const [busyMeetings, busyProposals, reserved] = await Promise.all([
      this.prisma.meeting.findMany({
        where: {
          placeId: { not: null },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
        select: { placeId: true },
      }),
      this.prisma.meetingRequest.findMany({
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
      }),
      this.prisma.investorPlaceAssignment.findMany({
        where: {
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
        select: { placeId: true },
      }),
    ]);

    const busyIds = new Set(
      [...busyMeetings, ...busyProposals, ...reserved]
        .map((row) => row.placeId)
        .filter((id): id is string => Boolean(id)),
    );

    return places
      .filter((p) => !busyIds.has(p.id))
      .map((place) => ({ ...place, assignedToInvestor: false }));
  }

  async listAssignments(params?: { organizationId?: string; placeId?: string }) {
    return this.prisma.investorPlaceAssignment.findMany({
      where: {
        ...(params?.organizationId
          ? { organizationId: params.organizationId }
          : {}),
        ...(params?.placeId ? { placeId: params.placeId } : {}),
      },
      include: ASSIGNMENT_INCLUDE,
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createAssignments(
    actor: AuthUser,
    input: {
      organizationId: string;
      placeId: string;
      dates?: string[];
      date?: string;
      startTime?: string;
      endTime?: string;
      allDay?: boolean;
      note?: string;
    },
  ) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: input.organizationId },
    });
    if (!organization || organization.type !== 'COMPANY') {
      throw new BadRequestException('Select an investor');
    }

    const place = await this.prisma.place.findFirst({
      where: { id: input.placeId, isActive: true },
    });
    if (!place) throw new BadRequestException('Place is not available');

    const dates = [
      ...new Set(
        (input.dates?.length ? input.dates : input.date ? [input.date] : [])
          .map((value) => value.trim())
          .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)),
      ),
    ].sort();
    if (!dates.length) {
      throw new BadRequestException('Select at least one event day');
    }

    const hasTimes = Boolean(input.startTime && input.endTime);
    const allDay = hasTimes ? false : input.allDay !== false;
    const startTime = allDay ? '00:00' : input.startTime;
    const endTime = allDay ? '24:00' : input.endTime;
    if (!startTime || !endTime) {
      throw new BadRequestException('Start and end time are required');
    }

    const windows = dates.map((date) => ({
      date,
      ...dubaiRange(date, startTime, endTime),
    }));

    for (const window of windows) {
      await this.assertAssignmentFree({
        organizationId: organization.id,
        placeId: place.id,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
      });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const rows = [];
      for (const window of windows) {
        const row = await tx.investorPlaceAssignment.create({
          data: {
            organizationId: organization.id,
            placeId: place.id,
            startsAt: window.startsAt,
            endsAt: window.endsAt,
            allDay,
            note: input.note?.trim() || null,
            createdById: actor.id,
          },
          include: ASSIGNMENT_INCLUDE,
        });
        const applied = await this.applyAssignedPlaces(
          [
            {
              companyOrgId: organization.id,
              startsAt: window.startsAt,
              endsAt: window.endsAt,
            },
          ],
          tx,
        );
        rows.push({ ...row, meetingsUpdated: applied });
      }
      return rows;
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'place.investor_assign',
      entityType: 'Place',
      entityId: place.id,
      outcome: 'SUCCESS',
      metadata: {
        organizationId: organization.id,
        dates,
        allDay,
        meetingsUpdated: created.reduce(
          (sum, row) => sum + row.meetingsUpdated,
          0,
        ),
      },
    });

    return { items: created };
  }

  async removeAssignment(actor: AuthUser, id: string) {
    const existing = await this.prisma.investorPlaceAssignment.findUnique({
      where: { id },
      include: ASSIGNMENT_INCLUDE,
    });
    if (!existing) throw new NotFoundException('Assignment not found');

    await this.prisma.investorPlaceAssignment.delete({ where: { id } });
    await this.audit.record({
      actorId: actor.id,
      action: 'place.investor_unassign',
      entityType: 'Place',
      entityId: existing.placeId,
      outcome: 'SUCCESS',
      metadata: { organizationId: existing.organizationId, assignmentId: id },
    });
    return { ok: true };
  }

  async resolveInvestorPlace(input: {
    organizationIds: string[];
    startsAt: Date;
    endsAt: Date;
    db?: PlaceDb;
  }) {
    const db = input.db ?? this.prisma;
    const orgIds = [...new Set(input.organizationIds.filter(Boolean))];
    if (!orgIds.length) return null;

    const companies = await db.organization.findMany({
      where: { id: { in: orgIds }, type: 'COMPANY' },
      select: { id: true },
    });
    if (!companies.length) return null;

    const assignment = await db.investorPlaceAssignment.findFirst({
      where: {
        organizationId: { in: companies.map((org) => org.id) },
        startsAt: { lt: input.endsAt },
        endsAt: { gt: input.startsAt },
      },
      include: { place: true },
      orderBy: { startsAt: 'asc' },
    });
    if (!assignment?.place?.isActive) return null;
    return assignment.place;
  }

  async applyAssignedPlaces(
    meetings: Array<{
      id?: string;
      companyOrgId: string;
      startsAt: Date;
      endsAt: Date;
    }>,
    db: PlaceDb = this.prisma,
  ) {
    if (!meetings.length) return 0;
    const companyIds = [...new Set(meetings.map((row) => row.companyOrgId))];
    const minStart = meetings.reduce(
      (min, row) => (row.startsAt < min ? row.startsAt : min),
      meetings[0]!.startsAt,
    );
    const maxEnd = meetings.reduce(
      (max, row) => (row.endsAt > max ? row.endsAt : max),
      meetings[0]!.endsAt,
    );

    const assignments = await db.investorPlaceAssignment.findMany({
      where: {
        organizationId: { in: companyIds },
        startsAt: { lt: maxEnd },
        endsAt: { gt: minStart },
      },
      include: { place: true },
    });
    if (!assignments.length) return 0;

    let updated = 0;
    for (const assignment of assignments) {
      if (!assignment.place.isActive) continue;
      const venue = venueLabel(assignment.place);
      const result = await db.meeting.updateMany({
        where: {
          ...(meetings.every((row) => row.id)
            ? { id: { in: meetings.map((row) => row.id!).filter(Boolean) } }
            : {}),
          companyOrgId: assignment.organizationId,
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          startsAt: { lt: assignment.endsAt },
          endsAt: { gt: assignment.startsAt },
        },
        data: {
          placeId: assignment.placeId,
          venue,
          mode: 'IN_PERSON',
        },
      });
      updated += result.count;

      await db.meetingRequest.updateMany({
        where: {
          status: {
            in: ['PENDING', 'INTEREST_ACCEPTED', 'AWAITING_CONFIRMATION'],
          },
          OR: [
            { fromOrgId: assignment.organizationId },
            { toOrgId: assignment.organizationId },
          ],
          proposedStartsAt: { lt: assignment.endsAt },
          proposedEndsAt: { gt: assignment.startsAt },
        },
        data: { placeId: assignment.placeId },
      });
    }
    return updated;
  }

  async assertAvailableForMeeting(input: {
    placeId: string;
    startsAt: Date;
    endsAt: Date;
    ownerOrgIds?: string[];
    excludeRequestId?: string;
  }) {
    const place = await this.prisma.place.findFirst({
      where: { id: input.placeId, isActive: true },
    });
    if (!place) {
      throw new BadRequestException('Place not available');
    }

    const reserved = await this.prisma.investorPlaceAssignment.findFirst({
      where: {
        placeId: place.id,
        startsAt: { lt: input.endsAt },
        endsAt: { gt: input.startsAt },
      },
      include: { organization: { select: { id: true, name: true } } },
    });
    const ownerOrgIds = input.ownerOrgIds ?? [];
    if (reserved && !ownerOrgIds.includes(reserved.organizationId)) {
      throw new BadRequestException(
        `${place.name} is reserved for ${reserved.organization.name} at that time.`,
      );
    }
    if (reserved && ownerOrgIds.includes(reserved.organizationId)) {
      return place;
    }

    const placeBusy = await this.prisma.meeting.findFirst({
      where: {
        placeId: place.id,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        startsAt: { lt: input.endsAt },
        endsAt: { gt: input.startsAt },
      },
    });
    if (placeBusy) {
      throw new BadRequestException(
        `${place.name} is already booked for that time. Choose another free place.`,
      );
    }

    const proposalBusy = await this.prisma.meetingRequest.findFirst({
      where: {
        placeId: place.id,
        status: { in: ['AWAITING_CONFIRMATION', 'INTEREST_ACCEPTED'] },
        ...(input.excludeRequestId
          ? { id: { not: input.excludeRequestId } }
          : {}),
        proposedStartsAt: { lt: input.endsAt },
        proposedEndsAt: { gt: input.startsAt },
      },
    });
    if (proposalBusy) {
      throw new BadRequestException(
        `${place.name} is already held by another proposed meeting. Choose another free place.`,
      );
    }

    return place;
  }

  private async assertAssignmentFree(input: {
    organizationId: string;
    placeId: string;
    startsAt: Date;
    endsAt: Date;
    excludeId?: string;
  }) {
    const investorClash = await this.prisma.investorPlaceAssignment.findFirst({
      where: {
        organizationId: input.organizationId,
        startsAt: { lt: input.endsAt },
        endsAt: { gt: input.startsAt },
        ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      },
      include: { place: { select: { name: true } } },
    });
    if (investorClash) {
      throw new BadRequestException(
        `This investor already has ${investorClash.place.name} in that window.`,
      );
    }

    const placeClash = await this.prisma.investorPlaceAssignment.findFirst({
      where: {
        placeId: input.placeId,
        startsAt: { lt: input.endsAt },
        endsAt: { gt: input.startsAt },
        ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      },
      include: { organization: { select: { name: true } } },
    });
    if (placeClash) {
      throw new BadRequestException(
        `This table is already allotted to ${placeClash.organization.name} in that window.`,
      );
    }
  }
}
