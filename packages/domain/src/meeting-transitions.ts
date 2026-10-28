export type MeetingStatus =
  | 'PROPOSED'
  | 'PUBLISHED'
  | 'AWAITING_CONFIRMATION'
  | 'CONFIRMED'
  | 'RESCHEDULE_REQUESTED'
  | 'RESCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

const ALLOWED: Record<MeetingStatus, MeetingStatus[]> = {
  PROPOSED: ['PUBLISHED', 'AWAITING_CONFIRMATION', 'CONFIRMED', 'CANCELLED'],
  PUBLISHED: ['AWAITING_CONFIRMATION', 'CONFIRMED', 'CANCELLED'],
  AWAITING_CONFIRMATION: [
    'CONFIRMED',
    'RESCHEDULE_REQUESTED',
    'CANCELLED',
    'NO_SHOW',
  ],
  CONFIRMED: [
    'IN_PROGRESS',
    'RESCHEDULE_REQUESTED',
    'RESCHEDULED',
    'COMPLETED',
    'CANCELLED',
    'NO_SHOW',
  ],
  RESCHEDULE_REQUESTED: ['RESCHEDULED', 'CANCELLED', 'CONFIRMED'],
  RESCHEDULED: ['AWAITING_CONFIRMATION', 'CONFIRMED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'NO_SHOW', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function canTransition(
  from: MeetingStatus,
  to: MeetingStatus,
): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(
  from: MeetingStatus,
  to: MeetingStatus,
): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid meeting transition ${from} -> ${to}`);
  }
}
