import type { ComponentProps } from 'react';
import type { Badge } from '@/components/ui/badge';

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>['variant']>;

export function statusTone(status: string): BadgeVariant {
  const s = status.toUpperCase();
  if (
    [
      'ACTIVE',
      'CONFIRMED',
      'COMPLETED',
      'SUCCEEDED',
      'SENT',
      'PUBLISHED',
      'VERIFIED',
      'APPROVED',
      'SCHEDULED',
      'INTEREST_ACCEPTED',
    ].includes(s)
  ) {
    return 'success';
  }
  if (
    [
      'PENDING',
      'QUEUED',
      'RUNNING',
      'AWAITING_CONFIRMATION',
      'DRAFT',
      'INVITED',
      'WAITING_FOR_REVIEW',
      'IN_REVIEW',
      'PENDING_APPROVAL',
      'SUBMITTED',
      'UNDER_REVIEW',
      'NEEDS_INFO',
      'RESEND_FOR_IMPROVEMENTS',
    ].includes(s)
  ) {
    return 'warning';
  }
  if (
    [
      'FAILED',
      'CANCELLED',
      'REVOKED',
      'EXPIRED',
      'DEAD_LETTERED',
      'NO_SHOW',
      'REJECTED',
      'DECLINED',
    ].includes(s)
  ) {
    return 'danger';
  }
  return 'secondary';
}

export function formatVendorStatus(status: string): string {
  const map: Record<string, string> = {
    INVITED: 'Invited',
    WAITING_FOR_REVIEW: 'Waiting for review',
    IN_REVIEW: 'In review',
    PENDING_APPROVAL: 'Pending approval',
    VERIFIED: 'Verified',
    APPROVED: 'Verified',
    REJECTED: 'Rejected',
    RESEND_FOR_IMPROVEMENTS: 'Resend for improvements',
    PENDING: 'Invited',
  };
  return map[status.toUpperCase()] ?? status.replaceAll('_', ' ');
}
