'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useAdminQuery } from '@/lib/admin-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';

type Field = {
  key: string;
  envKey: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'secret';
  secret: boolean;
  options?: string[];
  envDefault: unknown;
  value: unknown;
  hasOverride: boolean;
  configured?: boolean;
};

type IntegrationGroup = {
  id: string;
  title: string;
  fields: Field[];
};

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useAdminQuery<{
    settings: Array<{ key: string; value: unknown }>;
    flags: Array<{ key: string; enabled: boolean; description: string | null }>;
    integration: IntegrationGroup[];
  }>(['settings'], '/settings');

  const [draft, setDraft] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!data?.integration) return;
    const next: Record<string, unknown> = {};
    for (const group of data.integration) {
      for (const field of group.fields) {
        if (field.secret) {
          next[field.key] = '';
        } else if (field.type === 'boolean') {
          next[field.key] =
            field.value === true ||
            field.value === 'true' ||
            field.value === 1;
        } else {
          next[field.key] = field.value ?? '';
        }
      }
    }
    setDraft(next);
  }, [data]);

  const toggle = useMutation({
    mutationFn: (input: { key: string; enabled: boolean }) =>
      apiFetch('/settings/flags', {
        method: 'PUT',
        token: getAccessToken(),
        body: JSON.stringify(input),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  const saveGroup = useMutation({
    mutationFn: (group: IntegrationGroup) => {
      const values = group.fields
        .map((field) => {
          let value = draft[field.key];
          if (field.type === 'number') value = Number(value);
          if (field.type === 'boolean') value = Boolean(value);
          if (field.secret && (!value || String(value).trim() === '')) {
            return null;
          }
          return { key: field.key, value };
        })
        .filter(Boolean) as Array<{ key: string; value: unknown }>;

      return apiFetch('/settings/integrations', {
        method: 'PUT',
        token: getAccessToken(),
        body: JSON.stringify({ values }),
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">System settings</h1>
        <p className="text-sm text-[var(--muted)]">
          Email, storage, AI, and ops are managed here (not via .env). Values are
          stored in the database; secrets are masked on read. Leave a secret blank
          to keep the existing value.
        </p>
      </div>

      {isLoading && <p>Loading…</p>}
      {error && <p className="text-red-700">{(error as Error).message}</p>}

      {data?.integration.map((group) => (
        <Card key={group.id} className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-medium">{group.title}</h2>
              <p className="text-xs text-[var(--muted)]">
                Setting key shown on each row
              </p>
            </div>
            <Button
              onClick={() => saveGroup.mutate(group)}
              disabled={saveGroup.isPending}
            >
              {saveGroup.isPending ? 'Saving…' : 'Save group'}
            </Button>
          </div>
          <div className="space-y-3">
            {group.fields.map((field) => (
              <div
                key={field.key}
                className="grid gap-2 md:grid-cols-[220px_1fr_140px] items-center border-b border-[var(--border)] pb-3"
              >
                <div>
                  <div className="text-sm font-medium">{field.label}</div>
                  <div className="font-mono text-[11px] text-[var(--muted)]">
                    {field.envKey}
                  </div>
                </div>
                <div>
                  {field.type === 'boolean' ? (
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(draft[field.key])}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            [field.key]: e.target.checked,
                          }))
                        }
                      />
                      Enabled
                    </label>
                  ) : field.type === 'select' ? (
                    <select
                      className="h-10 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
                      value={String(draft[field.key] ?? '')}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          [field.key]: e.target.value,
                        }))
                      }
                    >
                      {(field.options ?? []).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      type={field.secret ? 'password' : field.type === 'number' ? 'number' : 'text'}
                      placeholder={
                        field.secret
                          ? field.configured
                            ? '•••• configured — enter new value to replace'
                            : 'Not set'
                          : String(field.envDefault ?? '')
                      }
                      value={String(draft[field.key] ?? '')}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          [field.key]:
                            field.type === 'number'
                              ? e.target.value
                              : e.target.value,
                        }))
                      }
                    />
                  )}
                </div>
                <div className="flex gap-2 justify-end">
                  {field.hasOverride ? (
                    <Badge variant="success">saved</Badge>
                  ) : (
                    <Badge variant="secondary">default</Badge>
                  )}
                  {field.secret && field.configured && (
                    <Badge variant="warning">set</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Card>
        <h2 className="font-medium mb-3">Feature flags</h2>
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
    </div>
  );
}
