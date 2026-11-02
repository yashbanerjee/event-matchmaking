export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  COMPANY_USER: 'COMPANY_USER',
  VENDOR_USER: 'VENDOR_USER',
  OPERATIONS_MANAGER: 'OPERATIONS_MANAGER',
} as const;

export type RoleCode = (typeof ROLES)[keyof typeof ROLES];

/** Investor–innovator complementarity weights (sum to 1). */
export const DEFAULT_MATCHING_WEIGHTS = {
  challenge: 0.35,
  solution: 0.2,
  geography: 0.18,
  commercial: 0.12,
  stage: 0.1,
  ticket: 0.05,
} as const;

export const DEFAULT_SCHEDULE_CONFIG = {
  slotCount: 6,
  meetingDurationMinutes: 15,
  bufferMinutes: 10,
  maxMeetingsPerParticipant: 6,
  mode: 'VIRTUAL' as const,
};
