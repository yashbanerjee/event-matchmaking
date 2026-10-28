import type { FormSchemaDefinition } from '@em/shared';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';

export type OnboardingItem = {
  assignmentId: string;
  organizationId: string;
  organizationName: string;
  organizationType: string;
  formId: string;
  formVersionId: string;
  formName: string;
  schema: FormSchemaDefinition;
  workflowStatus: string;
  canEdit: boolean;
  locked: boolean;
  action: 'submit' | 'correct' | 'view';
  submission: {
    id: string;
    status: string;
    submittedAt?: string | null;
    responses: Record<string, unknown>;
  } | null;
  openCorrection: {
    id: string;
    editableFieldIds: string[];
    notes: Array<{ fieldId: string; note: string }>;
  } | null;
};

export type OnboardingResponse = {
  items: OnboardingItem[];
  pendingCount: number;
};

export async function fetchOnboarding(
  token?: string | null,
): Promise<OnboardingResponse> {
  return apiFetch<OnboardingResponse>('/forms/onboarding/me', {
    token: token ?? getAccessToken(),
  });
}

/** After login/register, send participants to onboarding when work remains. */
export async function resolveParticipantHome(
  roles: string[],
): Promise<string> {
  const isAdmin = roles.some((role) =>
    ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'].includes(role),
  );
  if (isAdmin) return '/admin';

  try {
    const onboarding = await fetchOnboarding();
    if (onboarding.pendingCount > 0) {
      return '/portal/onboarding';
    }
  } catch {
    // Fall through to meetings if onboarding is unavailable.
  }
  return '/portal';
}
