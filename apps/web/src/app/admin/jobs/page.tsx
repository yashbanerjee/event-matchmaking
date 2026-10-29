'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useAdminQuery } from '@/lib/admin-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';

type Health = {
  status: string;
  checks: Record<string, { status: string; detail?: string }>;
};

export default function JobsPage() {
  const qc = useQueryClient();
  const health = useAdminQuery<Health>(['health-ready'], '/health/ready');
  const jobs = useAdminQuery<{
    items: Array<{
      id: string;
      jobType: string;
      queueName: string;
      status: string;
      attempts: number;
      lastError: string | null;
      createdAt: string;
    }>;
    outbox: Array<{ status: string; _count: number }>;
  }>(['jobs'], '/jobs');

  const retry = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/jobs/${id}/retry`, {
        method: 'POST',
        token: getAccessToken(),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['jobs'] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Background jobs</h1>
        <p className="text-sm text-[var(--muted)]">
          Outbox-backed queues with bounded retries and dead-letter handling.
        </p>
      </div>
      <Card>
        <div className="text-sm text-[var(--muted)] mb-2">Readiness</div>
        <div className="text-xl font-semibold mb-4">{health.data?.status ?? '…'}</div>
        <ul className="space-y-2 text-sm">
          {Object.entries(health.data?.checks ?? {}).map(([name, check]) => (
            <li
              key={name}
              className="flex justify-between border-b border-[var(--border)] py-2"
            >
              <span>{name}</span>
              <Badge
                variant={
                  check.status === 'up' || check.status === 'disabled'
                    ? 'success'
                    : 'warning'
                }
              >
                {check.status}
              </Badge>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="font-medium mb-3">Outbox</h2>
        <div className="flex gap-3 text-sm">
          {jobs.data?.outbox.map((o) => (
            <Badge key={o.status} variant="secondary">
              {o.status}: {o._count}
            </Badge>
          ))}
        </div>
      </Card>
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Type</TH>
              <TH>Queue</TH>
              <TH>Status</TH>
              <TH>Attempts</TH>
              <TH>Error</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {jobs.data?.items.map((j) => (
              <TR key={j.id}>
                <TD>{j.jobType}</TD>
                <TD>{j.queueName}</TD>
                <TD>{j.status}</TD>
                <TD>{j.attempts}</TD>
                <TD className="max-w-xs text-xs text-[var(--muted)]">
                  {j.lastError ?? '—'}
                </TD>
                <TD>
                  {['FAILED', 'DEAD_LETTERED'].includes(j.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={retry.isPending && retry.variables === j.id}
                      onClick={() => retry.mutate(j.id)}
                    >
                      Retry
                    </Button>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
