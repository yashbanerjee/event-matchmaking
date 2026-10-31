'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';

type Overview = {
  totalCompanies: number;
  totalVendors: number;
  activeUsers: number;
  pendingInvitations: number;
  eligibleParticipants: number;
  generatedMatches: number;
  scheduledMeetings: number;
  confirmedMeetings: number;
  completedMeetings: number;
  cancellationRate: number;
  noShowRate: number;
  pendingFeedback: number;
  followUpsRequired: number;
  averageMatchScore: number;
  backgroundJobFailures: number;
};

export default function AdminOverviewPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: () =>
      apiFetch<Overview>('/dashboard/overview', {
        token: getAccessToken(),
      }),
  });

  if (isLoading) {
    return <p className="text-[var(--muted)]">Loading metrics…</p>;
  }
  if (error) {
    return <p className="text-rose-700">{(error as Error).message}</p>;
  }
  if (!data) return null;

  const metrics: Array<{ label: string; value: string | number }> = [
    { label: 'Clients', value: data.totalCompanies },
    { label: 'Guests', value: data.totalVendors },
    { label: 'Scheduled meetings', value: data.scheduledMeetings },
    { label: 'Confirmed meetings', value: data.confirmedMeetings },
    { label: 'Completed meetings', value: data.completedMeetings },
    { label: 'Active users', value: data.activeUsers },
    { label: 'Pending invitations', value: data.pendingInvitations },
    { label: 'Eligible participants', value: data.eligibleParticipants },
    { label: 'Generated matches', value: data.generatedMatches },
    {
      label: 'Avg match score',
      value: data.averageMatchScore.toFixed(1),
    },
    {
      label: 'Cancellation rate',
      value: `${(data.cancellationRate * 100).toFixed(1)}%`,
    },
    {
      label: 'No-show rate',
      value: `${(data.noShowRate * 100).toFixed(1)}%`,
    },
    { label: 'Pending feedback', value: data.pendingFeedback },
    { label: 'Job failures', value: data.backgroundJobFailures },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Control center"
        title="Overview"
        description="Operational metrics from invitations through meeting outcomes."
      />

      <Card className="overflow-hidden p-0">
        <div className="grid divide-y divide-[var(--border)] sm:grid-cols-2 sm:divide-x xl:grid-cols-3">
          {metrics.map((m) => (
            <div key={m.label} className="px-4 py-3 sm:odd:border-r-0">
              <div className="text-xs font-medium text-[var(--muted)]">
                {m.label}
              </div>
              <div className="mt-1 text-xl font-semibold tracking-tight">
                {m.value}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
