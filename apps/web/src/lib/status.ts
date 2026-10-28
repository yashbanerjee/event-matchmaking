import type { ComponentProps } from 'react';
import type { Badge } from '@/components/ui/badge';

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>['variant']>;

export function statusTone(status: string): BadgeVariant {
  const s = status.toUpperCase();
  if (['ACTIVE', 'CONFIRMED', 'COMPLETED', 'SUCCEEDED', 'SENT', 'PUBLISHED'].includes(s)) {
    return 'success';
  }
  if (['PENDING', 'QUEUED', 'RUNNING', 'AWAITING_CONFIRMATION', 'DRAFT'].includes(s)) {
    return 'warning';
  }
  if (['FAILED', 'CANCELLED', 'REVOKED', 'EXPIRED', 'DEAD_LETTERED', 'NO_SHOW'].includes(s)) {
    return 'danger';
  }
  return 'secondary';
}
