export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  COMPANY_USER: 'COMPANY_USER',
  VENDOR_USER: 'VENDOR_USER',
  OPERATIONS_MANAGER: 'OPERATIONS_MANAGER',
} as const;

export type RoleCode = (typeof ROLES)[keyof typeof ROLES];

export const DEFAULT_MATCHING_WEIGHTS = {
  capability: 0.3,
  industry: 0.2,
  requirements: 0.2,
  geography: 0.1,
  commercial: 0.1,
  mutualPreferences: 0.1,
} as const;

export const DEFAULT_SCHEDULE_CONFIG = {
  slotCount: 6,
  meetingDurationMinutes: 30,
  bufferMinutes: 10,
  maxMeetingsPerParticipant: 6,
  mode: 'VIRTUAL' as const,
};
