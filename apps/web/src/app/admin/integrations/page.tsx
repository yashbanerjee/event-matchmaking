'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useAdminQuery } from '@/lib/admin-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';

export default function IntegrationsPage() {
  const { data, isLoading, refetch } = useAdminQuery<{
    emailProvider: string;
    storageProvider: string;
    aiEnabled: boolean;
    semanticSearchEnabled: boolean;
    ai: Array<{ provider: string; healthy: boolean; latencyMs?: number; error?: string }>;
  }>(['integrations-health'], '/integrations/health');

  const [q, setQ] = useState('CNC manufacturing EU');
  const [search, setSearch] = useState<{
    degraded: boolean;
    hits: Array<{ name: string; score: number; mode: string }>;
  } | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Integration health</h1>
          <p className="text-sm text-[var(--muted)]">
            AI failure is non-critical. Semantic search falls back to structured filters.
          </p>
        </div>
        <Button variant="outline" onClick={() => void refetch()}>
          Refresh
        </Button>
      </div>
      {isLoading && <p>Loading…</p>}
      {data && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <div className="text-sm text-[var(--muted)]">Email</div>
            <div className="text-xl font-semibold mt-2">{data.emailProvider}</div>
          </Card>
          <Card>
            <div className="text-sm text-[var(--muted)]">Storage</div>
            <div className="text-xl font-semibold mt-2">{data.storageProvider}</div>
          </Card>
          <Card>
            <div className="text-sm text-[var(--muted)]">AI</div>
            <div className="text-xl font-semibold mt-2">
              {data.aiEnabled ? 'enabled' : 'disabled'}
            </div>
          </Card>
          <Card>
            <div className="text-sm text-[var(--muted)]">Semantic search</div>
            <div className="text-xl font-semibold mt-2">
              {data.semanticSearchEnabled ? 'enabled' : 'disabled'}
            </div>
          </Card>
        </div>
      )}
      <Card>
        <h2 className="font-medium mb-3">AI providers</h2>
        <Table>
          <THead>
            <TR>
              <TH>Provider</TH>
              <TH>Healthy</TH>
              <TH>Latency</TH>
              <TH>Error</TH>
            </TR>
          </THead>
          <TBody>
            {data?.ai.map((p) => (
              <TR key={p.provider}>
                <TD>{p.provider}</TD>
                <TD>
                  <Badge variant={p.healthy ? 'success' : 'danger'}>
                    {p.healthy ? 'up' : 'down'}
                  </Badge>
                </TD>
                <TD>{p.latencyMs ?? '—'} ms</TD>
                <TD className="text-xs text-[var(--muted)]">{p.error ?? '—'}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-medium">Vendor search</h2>
        <div className="flex gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} />
          <Button
            onClick={async () => {
              const res = await apiFetch<{
                degraded: boolean;
                hits: Array<{ name: string; score: number; mode: string }>;
              }>(`/integrations/search/vendors?q=${encodeURIComponent(q)}`, {
                token: getAccessToken(),
              });
              setSearch(res);
            }}
          >
            Search
          </Button>
        </div>
        {search && (
          <p className="text-sm text-[var(--muted)]">
            Mode: {search.degraded ? 'structured fallback' : 'semantic'} ·{' '}
            {search.hits.length} hits
          </p>
        )}
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Score</TH>
              <TH>Mode</TH>
            </TR>
          </THead>
          <TBody>
            {search?.hits.map((h) => (
              <TR key={`${h.name}-${h.score}`}>
                <TD>{h.name}</TD>
                <TD>{h.score.toFixed(3)}</TD>
                <TD>{h.mode}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
