export type PulseSnapshot = {
  planned: number;
  inProgress: number;
  completed: number;
  missed: number;
  cancelled: number;
  remaining: number;
  confirmed: number;
  successRate: number;
  confirmationRate: number;
  noShowRate: number;
  feedbackCoverage: number;
};

export type ActivityRow = {
  id: string;
  name: string;
  bookedToday: number;
  bookedTotal: number;
  completed: number;
  capacity: number;
  fillRate: number;
  available: boolean;
  inMeeting: boolean;
};

export type EventPulse = {
  totalCompanies: number;
  totalVendors: number;
  activeUsers: number;
  pendingInvitations: number;
  eligibleParticipants: number;
  generatedMatches: number;
  scheduledMeetings: number;
  confirmedMeetings: number;
  completedMeetings: number;
  cancellationRate: number;
  noShowRate: number;
  pendingFeedback: number;
  followUpsRequired: number;
  averageMatchScore: number;
  backgroundJobFailures: number;
  timezone: string;
  today: string;
  pulse: {
    today: PulseSnapshot;
    event: PulseSnapshot;
  };
  statusBreakdown: Array<{ status: string; count: number }>;
  hourlyToday: Array<{ hour: number; booked: number }>;
  ratings: {
    overall: number;
    sampleSize: number;
    followUpSignals: number;
    meetingQuality: number;
    relevance: number;
    businessPotential: number;
    communicationQuality: number;
    interestLevel: number;
  };
  outcomes: Array<{ outcome: string; count: number }>;
  investorActivity: ActivityRow[];
  innovatorActivity: ActivityRow[];
  liveMeetings: Array<{
    id: string;
    investor: string;
    innovator: string;
    startsAt: string;
    endsAt: string;
    place: string | null;
    status: string;
  }>;
  idleInvestors: number;
  idleInnovators: number;
  investorsInMeeting: number;
  innovatorsInMeeting: number;
  investorsAvailable: number;
  innovatorsAvailable: number;
  closedMeetings: number;
};

export function pct(value: number) {
  return `${Math.round((value || 0) * 100)}%`;
}

export function formatOutcome(value: string) {
  return value.replaceAll('_', ' ').toLowerCase();
}

export function formatHour(hour: number) {
  const suffix = hour >= 12 ? 'pm' : 'am';
  const h = hour % 12 || 12;
  return `${h}${suffix}`;
}

export const STARTABLE_STATUSES = [
  'PUBLISHED',
  'AWAITING_CONFIRMATION',
  'CONFIRMED',
  'RESCHEDULED',
] as const;

export function canStartMeeting(status: string) {
  return STARTABLE_STATUSES.includes(
    status as (typeof STARTABLE_STATUSES)[number],
  );
}

export function canEndMeeting(status: string) {
  return status === 'IN_PROGRESS';
}
