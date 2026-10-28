'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useAdminQuery } from '@/lib/admin-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useAdminQuery<{
    settings: Array<{ key: string; value: unknown }>;
    flags: Array<{ key: string; enabled: boolean; description: string | null }>;
  }>(['settings'], '/settings');

  const toggle = useMutation({
    mutationFn: (input: { key: string; enabled: boolean }) =>
      apiFetch('/settings/flags', {
        method: 'PUT',
        token: getAccessToken(),
        body: JSON.stringify(input),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">System settings</h1>
        <p className="text-sm text-[var(--muted)]">
          Feature flags and operational policies. Secrets stay in environment config.
        </p>
      </div>
      <Card>
        <h2 className="font-medium mb-3">Feature flags</h2>
        {isLoading && <p>Loading…</p>}
        <Table>
          <THead>
            <TR>
              <TH>Key</TH>
              <TH>Description</TH>
              <TH>Enabled</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {data?.flags.map((f) => (
              <TR key={f.key}>
                <TD className="font-mono text-xs">{f.key}</TD>
                <TD>{f.description ?? '—'}</TD>
                <TD>
                  <Badge variant={f.enabled ? 'success' : 'secondary'}>
                    {f.enabled ? 'on' : 'off'}
                  </Badge>
                </TD>
                <TD>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      toggle.mutate({ key: f.key, enabled: !f.enabled })
                    }
                  >
                    Toggle
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <Card>
        <h2 className="font-medium mb-3">Settings</h2>
        <Table>
          <THead>
            <TR>
              <TH>Key</TH>
              <TH>Value</TH>
            </TR>
          </THead>
          <TBody>
            {data?.settings.map((s) => (
              <TR key={s.key}>
                <TD className="font-mono text-xs">{s.key}</TD>
                <TD className="text-xs break-all">{JSON.stringify(s.value)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
