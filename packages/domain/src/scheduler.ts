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

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function pairKey(companyOrgId: string, vendorOrgId: string): string {
  return `${companyOrgId}::${vendorOrgId}`;
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
    return used.every(
      (prev) => Math.abs(slotIndex - prev) > vendorGapSlots,
    );
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

export function buildDailySlots(params: {
  date: string;
  startTime: string;
  meetingDurationMinutes: number;
  bufferMinutes: number;
  slotCount: number;
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

  const slots: ScheduleSlot[] = [];
  let cursor = Date.UTC(year, month - 1, day, startH, startM, 0, 0);

  for (let i = 0; i < params.slotCount; i += 1) {
    const startsAt = new Date(cursor);
    const endsAt = new Date(
      cursor + params.meetingDurationMinutes * 60_000,
    );
    slots.push({
      slotIndex: i,
      startsAt,
      endsAt,
      isBreak: false,
    });
    cursor = endsAt.getTime() + params.bufferMinutes * 60_000;
  }

  return slots;
}
