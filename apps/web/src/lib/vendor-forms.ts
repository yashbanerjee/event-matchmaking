import { formatVendorStatus } from '@/lib/status';
import type { OnboardingItem } from '@/lib/portal-onboarding';

export function statusForFormItem(item: OnboardingItem) {
  if (item.action === 'correct') return 'RESEND_FOR_IMPROVEMENTS';
  if (item.submission?.status) return item.submission.status;
  return item.workflowStatus;
}

export function labelForFormItem(item: OnboardingItem) {
  if (item.action === 'submit') return 'Pending submission';
  if (item.action === 'correct') return 'Updates requested';
  if (item.submission?.status === 'APPROVED') return 'Verified';
  return formatVendorStatus(item.submission?.status ?? item.workflowStatus);
}

export function lozengeAppearanceForStatus(
  status: string,
): 'default' | 'inprogress' | 'moved' | 'new' | 'removed' | 'success' {
  const s = status.toUpperCase();
  if (
    ['APPROVED', 'VERIFIED', 'CONFIRMED', 'COMPLETED', 'PUBLISHED', 'ACTIVE'].includes(
      s,
    )
  ) {
    return 'success';
  }
  if (
    [
      'SUBMITTED',
      'UNDER_REVIEW',
      'WAITING_FOR_REVIEW',
      'IN_REVIEW',
      'AWAITING_CONFIRMATION',
      'IN_PROGRESS',
    ].includes(s)
  ) {
    return 'inprogress';
  }
  if (
    ['NEEDS_INFO', 'RESEND_FOR_IMPROVEMENTS', 'DRAFT', 'PENDING', 'RESCHEDULE_REQUESTED'].includes(
      s,
    )
  ) {
    return 'moved';
  }
  if (['REJECTED', 'CANCELLED', 'NO_SHOW', 'FAILED', 'EXPIRED'].includes(s)) {
    return 'removed';
  }
  if (['PROPOSED', 'INVITED'].includes(s)) return 'new';
  return 'default';
}

export function formatFilledDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}
