'use client';

import { useQuery } from '@tanstack/react-query';
import { EventPulseBoard } from '@/components/event-pulse';
import { PageHeader } from '@/components/page-header';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import type { EventPulse } from '@/lib/event-pulse';

export default function AdminOverviewPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: () =>
      apiFetch<EventPulse>('/dashboard/overview', {
        token: getAccessToken(),
      }),
    refetchInterval: 20_000,
  });

  if (isLoading) {
    return <p className="text-[var(--muted)]">Reading the floor…</p>;
  }
  if (error) {
    return <p className="text-rose-700">{(error as Error).message}</p>;
  }
  if (!data) return null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Control center"
        title="Overview"
        description="Live pulse of investor–innovator meetings: capacity, availability, success, and ratings."
      />
      <EventPulseBoard data={data} />
    </div>
  );
}
