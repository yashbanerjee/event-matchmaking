'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { Card } from '@/components/ui/card';

type Health = {
  status: string;
  checks: Record<string, { status: string; detail?: string }>;
};

export default function JobsPage() {
  const health = useQuery({
    queryKey: ['health-ready'],
    queryFn: () => apiFetch<Health>('/health/ready'),
    refetchInterval: 10_000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Background jobs & health</h1>
        <p className="text-sm text-[var(--muted)]">
          RabbitMQ outbox publisher and worker consumers process invitation,
          notification, profile, and matchmaking events. AI failure is non-critical.
        </p>
      </div>
      <Card>
        <div className="text-sm text-[var(--muted)] mb-2">Readiness</div>
        <div className="text-xl font-semibold mb-4">{health.data?.status ?? '…'}</div>
        <ul className="space-y-2 text-sm">
          {Object.entries(health.data?.checks ?? {}).map(([name, check]) => (
            <li key={name} className="flex justify-between border-b border-[var(--border)] py-2">
              <span>{name}</span>
              <span>{check.status}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
