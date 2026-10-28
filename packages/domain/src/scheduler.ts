export interface ScheduleSlot {
  slotIndex: number;
  startsAt: Date;
  endsAt: Date;
  isBreak: boolean;
}

export interface CandidateAssignment {
  companyOrgId: string;
  vendorOrgId: string;
  score: number;
}

export interface ScheduledMeeting {
  companyOrgId: string;
  vendorOrgId: string;
  score: number;
  slotIndex: number;
  startsAt: Date;
  endsAt: Date;
}

export interface SchedulerLimits {
  maxMeetingsPerParticipant: number;
  /**
   * Preferred number of free slots between two meetings for the same vendor.
   * Tried first; consecutive booking is only used when no gapped slot fits.
   */
  vendorGapSlots?: number;
}

export interface SchedulerResult {
  assignments: ScheduledMeeting[];
  unassigned: CandidateAssignment[];
  conflictsResolved: number;
}

export interface ExcludeInterval {
  startTime: string;
  endTime: string;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function pairKey(companyOrgId: string, vendorOrgId: string): string {
  return `${companyOrgId}::${vendorOrgId}`;
}

function parseHm(value: string): number {
  const [h, m] = value.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

/**
 * Weighted greedy scheduler with conflict resolution.
 * - Never double-books a company or vendor in the same slot
 * - Schedules each company–vendor pair at most once
 * - Prefers a rest gap for vendors between meetings when possible
 */
export function scheduleGreedy(
  candidates: CandidateAssignment[],
  slots: ScheduleSlot[],
  limits: SchedulerLimits,
  initialOccupied: Array<{
    participantId: string;
    startsAt: Date;
    endsAt: Date;
  }> = [],
): SchedulerResult {
  const usableSlots = slots.filter((s) => !s.isBreak);
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const vendorGapSlots = Math.max(0, limits.vendorGapSlots ?? 1);

  const assignments: ScheduledMeeting[] = [];
  const unassigned: CandidateAssignment[] = [];
  let conflictsResolved = 0;

  const companyCounts = new Map<string, number>();
  const vendorCounts = new Map<string, number>();
  const paired = new Set<string>();
  const vendorSlotIndexes = new Map<string, number[]>();
  const occupied = new Map<string, { startsAt: Date; endsAt: Date }[]>();

  for (const row of initialOccupied) {
    const windows = occupied.get(row.participantId) ?? [];
    windows.push({ startsAt: row.startsAt, endsAt: row.endsAt });
    occupied.set(row.participantId, windows);
  }

  const isFree = (participantId: string, start: Date, end: Date): boolean => {
    const windows = occupied.get(participantId) ?? [];
    return !windows.some((w) => overlaps(w.startsAt, w.endsAt, start, end));
  };

  const reserve = (participantId: string, start: Date, end: Date): void => {
    const windows = occupied.get(participantId) ?? [];
    windows.push({ startsAt: start, endsAt: end });
    occupied.set(participantId, windows);
  };

  const vendorHasGap = (vendorOrgId: string, slotIndex: number): boolean => {
    if (vendorGapSlots <= 0) return true;
    const used = vendorSlotIndexes.get(vendorOrgId) ?? [];
    if (used.length === 0) return true;
    return used.every((prev) => Math.abs(slotIndex - prev) > vendorGapSlots);
  };

  for (const candidate of sorted) {
    const key = pairKey(candidate.companyOrgId, candidate.vendorOrgId);
    if (paired.has(key)) {
      unassigned.push(candidate);
      conflictsResolved += 1;
      continue;
    }

    const companyCount = companyCounts.get(candidate.companyOrgId) ?? 0;
    const vendorCount = vendorCounts.get(candidate.vendorOrgId) ?? 0;
    if (
      companyCount >= limits.maxMeetingsPerParticipant ||
      vendorCount >= limits.maxMeetingsPerParticipant
    ) {
      unassigned.push(candidate);
      conflictsResolved += 1;
      continue;
    }

    const freeSlots = usableSlots.filter(
      (slot) =>
        isFree(candidate.companyOrgId, slot.startsAt, slot.endsAt) &&
        isFree(candidate.vendorOrgId, slot.startsAt, slot.endsAt),
    );

    const preferred =
      freeSlots.find((slot) =>
        vendorHasGap(candidate.vendorOrgId, slot.slotIndex),
      ) ?? null;
    const chosen = preferred ?? freeSlots[0] ?? null;

    if (!chosen) {
      unassigned.push(candidate);
      conflictsResolved += 1;
      continue;
    }

    assignments.push({
      companyOrgId: candidate.companyOrgId,
      vendorOrgId: candidate.vendorOrgId,
      score: candidate.score,
      slotIndex: chosen.slotIndex,
      startsAt: chosen.startsAt,
      endsAt: chosen.endsAt,
    });
    reserve(candidate.companyOrgId, chosen.startsAt, chosen.endsAt);
    reserve(candidate.vendorOrgId, chosen.startsAt, chosen.endsAt);
    paired.add(key);
    companyCounts.set(candidate.companyOrgId, companyCount + 1);
    vendorCounts.set(candidate.vendorOrgId, vendorCount + 1);
    const vendorSlots = vendorSlotIndexes.get(candidate.vendorOrgId) ?? [];
    vendorSlots.push(chosen.slotIndex);
    vendorSlotIndexes.set(candidate.vendorOrgId, vendorSlots);
  }

  return { assignments, unassigned, conflictsResolved };
}

/**
 * Build meeting slots from start→end. Slots that overlap an exclude interval
 * are marked as breaks and never used for meetings.
 */
export function buildDailySlots(params: {
  date: string;
  startTime: string;
  endTime?: string;
  meetingDurationMinutes: number;
  bufferMinutes: number;
  slotCount?: number;
  excludeIntervals?: ExcludeInterval[];
  timeZone?: string;
}): ScheduleSlot[] {
  const [year, month, day] = params.date.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const [startH, startM] = params.startTime.split(':').map(Number) as [
    number,
    number,
  ];

  const dayStartMs = Date.UTC(year, month - 1, day, startH, startM, 0, 0);
  const endMinutes = params.endTime
    ? parseHm(params.endTime)
    : parseHm(params.startTime) +
      (params.slotCount ?? 6) *
        (params.meetingDurationMinutes + params.bufferMinutes);
  const dayEndMs = Date.UTC(
    year,
    month - 1,
    day,
    Math.floor(endMinutes / 60),
    endMinutes % 60,
    0,
    0,
  );

  const excludes = (params.excludeIntervals ?? []).map((interval) => {
    const startMin = parseHm(interval.startTime);
    const endMin = parseHm(interval.endTime);
    return {
      start: Date.UTC(
        year,
        month - 1,
        day,
        Math.floor(startMin / 60),
        startMin % 60,
        0,
        0,
      ),
      end: Date.UTC(
        year,
        month - 1,
        day,
        Math.floor(endMin / 60),
        endMin % 60,
        0,
        0,
      ),
    };
  });

  const maxSlots = Math.min(
    64,
    params.slotCount ??
      Math.max(
        1,
        Math.floor(
          (dayEndMs - dayStartMs) /
            Math.max(
              1,
              (params.meetingDurationMinutes + params.bufferMinutes) * 60_000,
            ),
        ),
      ),
  );

  const slots: ScheduleSlot[] = [];
  let cursor = dayStartMs;
  let index = 0;

  while (cursor < dayEndMs && index < maxSlots) {
    const startsAt = new Date(cursor);
    const endsAt = new Date(cursor + params.meetingDurationMinutes * 60_000);
    if (endsAt.getTime() > dayEndMs) break;

    const isBreak = excludes.some((ex) =>
      overlaps(startsAt, endsAt, new Date(ex.start), new Date(ex.end)),
    );

    slots.push({
      slotIndex: index,
      startsAt,
      endsAt,
      isBreak,
    });
    index += 1;
    cursor = endsAt.getTime() + params.bufferMinutes * 60_000;
  }

  return slots;
}
