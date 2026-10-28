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
}

export interface SchedulerResult {
  assignments: ScheduledMeeting[];
  unassigned: CandidateAssignment[];
  conflictsResolved: number;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Weighted greedy scheduler with conflict resolution.
 * Not globally optimal — designed behind a stable interface for a future solver.
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

  const assignments: ScheduledMeeting[] = [];
  const unassigned: CandidateAssignment[] = [];
  let conflictsResolved = 0;

  const companyCounts = new Map<string, number>();
  const vendorCounts = new Map<string, number>();
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

  for (const candidate of sorted) {
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

    let placed = false;
    for (const slot of usableSlots) {
      if (
        isFree(candidate.companyOrgId, slot.startsAt, slot.endsAt) &&
        isFree(candidate.vendorOrgId, slot.startsAt, slot.endsAt)
      ) {
        assignments.push({
          companyOrgId: candidate.companyOrgId,
          vendorOrgId: candidate.vendorOrgId,
          score: candidate.score,
          slotIndex: slot.slotIndex,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
        });
        reserve(candidate.companyOrgId, slot.startsAt, slot.endsAt);
        reserve(candidate.vendorOrgId, slot.startsAt, slot.endsAt);
        companyCounts.set(candidate.companyOrgId, companyCount + 1);
        vendorCounts.set(candidate.vendorOrgId, vendorCount + 1);
        placed = true;
        break;
      }
    }

    if (!placed) {
      unassigned.push(candidate);
      conflictsResolved += 1;
    }
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
    cursor =
      endsAt.getTime() + params.bufferMinutes * 60_000;
  }

  return slots;
}
