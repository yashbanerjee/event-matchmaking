'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { Card } from '@/components/ui/card';

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

  if (isLoading) return <p>Loading metrics…</p>;
  if (error) return <p className="text-red-700">{(error as Error).message}</p>;
  if (!data) return null;

  const metrics: Array<{ label: string; value: string | number }> = [
    { label: 'Companies', value: data.totalCompanies },
    { label: 'Vendors', value: data.totalVendors },
    { label: 'Active users', value: data.activeUsers },
    { label: 'Pending invitations', value: data.pendingInvitations },
    { label: 'Eligible participants', value: data.eligibleParticipants },
    { label: 'Generated matches', value: data.generatedMatches },
    { label: 'Scheduled meetings', value: data.scheduledMeetings },
    { label: 'Confirmed meetings', value: data.confirmedMeetings },
    { label: 'Completed meetings', value: data.completedMeetings },
    {
      label: 'Cancellation rate',
      value: `${(data.cancellationRate * 100).toFixed(1)}%`,
    },
    { label: 'No-show rate', value: `${(data.noShowRate * 100).toFixed(1)}%` },
    { label: 'Pending feedback', value: data.pendingFeedback },
    { label: 'Follow-ups required', value: data.followUpsRequired },
    {
      label: 'Average match score',
      value: data.averageMatchScore.toFixed(1),
    },
    { label: 'Job failures', value: data.backgroundJobFailures },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">Overview</h1>
      <p className="text-sm text-[var(--muted)] mb-6">
        Live metrics from PostgreSQL. Definitions are documented in the API
        dashboard service.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => (
          <Card key={m.label}>
            <div className="text-sm text-[var(--muted)]">{m.label}</div>
            <div className="text-2xl font-semibold mt-2">{m.value}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
