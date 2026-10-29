import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email().max(320),
  // Login accepts the stored password as-is; strength rules apply only at registration.
  password: z.string().min(1).max(128),
});

export const registerFromInvitationSchema = z.object({
  token: z.string().min(32).max(512),
  password: z.string().min(4, 'Password must be at least 4 characters').max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
});

export const createInvitationSchema = z.object({
  email: z.string().email().max(320),
  organizationId: z.string().uuid(),
  roleCode: z.enum([
    'SUPER_ADMIN',
    'ADMIN',
    'COMPANY_USER',
    'VENDOR_USER',
    'OPERATIONS_MANAGER',
  ]),
  onboardingWorkflowId: z.string().uuid().optional(),
});

export const eventRegistrationStartSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(['CLIENT', 'GUEST']),
  organizationName: z.string().min(1).max(200),
  responses: z.record(z.unknown()).default({}),
});

export const eventRegistrationVerifyOtpSchema = z.object({
  registrationId: z.string().uuid(),
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export const eventRegistrationCompleteSchema = z.object({
  registrationToken: z.string().min(16).max(2048),
  password: z.string().min(4, 'Password must be at least 4 characters').max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterFromInvitationInput = z.infer<
  typeof registerFromInvitationSchema
>;
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type EventRegistrationStartInput = z.infer<
  typeof eventRegistrationStartSchema
>;
export type EventRegistrationVerifyOtpInput = z.infer<
  typeof eventRegistrationVerifyOtpSchema
>;
export type EventRegistrationCompleteInput = z.infer<
  typeof eventRegistrationCompleteSchema
>;
