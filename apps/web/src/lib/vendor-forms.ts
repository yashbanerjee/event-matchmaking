import { formatVendorStatus, statusTone } from '@/lib/status';
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

export function badgeToneForStatus(status: string) {
  return statusTone(status);
}

export function formatFilledDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}
