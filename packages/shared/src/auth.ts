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

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterFromInvitationInput = z.infer<
  typeof registerFromInvitationSchema
>;
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
