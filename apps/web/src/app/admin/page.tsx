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

  const hero = [
    { label: 'Client', value: data.totalCompanies, tone: 'teal' },
    { label: 'Guests', value: data.totalVendors, tone: 'sky' },
    { label: 'Scheduled', value: data.scheduledMeetings, tone: 'teal' },
    { label: 'Confirmed', value: data.confirmedMeetings, tone: 'sky' },
  ];

  const metrics: Array<{ label: string; value: string | number }> = [
    { label: 'Active users', value: data.activeUsers },
    { label: 'Pending invitations', value: data.pendingInvitations },
    { label: 'Eligible participants', value: data.eligibleParticipants },
    { label: 'Generated matches', value: data.generatedMatches },
    { label: 'Completed meetings', value: data.completedMeetings },
    {
      label: 'Cancellation rate',
      value: `${(data.cancellationRate * 100).toFixed(1)}%`,
    },
    { label: 'No-show rate', value: `${(data.noShowRate * 100).toFixed(1)}%` },
    { label: 'Pending feedback', value: data.pendingFeedback },
    {
      label: 'Average match score',
      value: data.averageMatchScore.toFixed(1),
    },
    { label: 'Job failures', value: data.backgroundJobFailures },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Control center"
        title="Overview"
        description="Live operational metrics from PostgreSQL — invitations through outcomes."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {hero.map((m, i) => (
          <Card
            key={m.label}
            className="relative overflow-hidden border-transparent bg-[linear-gradient(145deg,#0f766e,#0b4f4a)] text-white"
            style={{
              background:
                m.tone === 'sky'
                  ? 'linear-gradient(145deg,#0369a1,#0c4a6e)'
                  : undefined,
              animationDelay: `${i * 60}ms`,
            }}
          >
            <div className="text-sm text-white/75">{m.label}</div>
            <div className="mt-3 text-3xl font-bold tracking-tight">{m.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((m) => (
          <Card key={m.label} className="hover:border-[var(--accent)]/30 transition-colors">
            <div className="text-sm text-[var(--muted)]">{m.label}</div>
            <div className="mt-2 text-2xl font-semibold tracking-tight">{m.value}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
