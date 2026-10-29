'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

function settingValue(
  settings: Array<{ key: string; value: unknown }> | undefined,
  key: string,
): unknown {
  const row = settings?.find((s) => s.key === key);
  if (!row) return undefined;
  if (
    row.value &&
    typeof row.value === 'object' &&
    'value' in (row.value as object)
  ) {
    return (row.value as { value: unknown }).value;
  }
  return row.value;
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useAdminQuery<{
    settings: Array<{ key: string; value: unknown }>;
    flags: Array<{ key: string; enabled: boolean; description: string | null }>;
    integration: IntegrationGroup[];
  }>(['settings'], '/settings');

  const forms = useQuery({
    queryKey: ['forms-for-registration'],
    queryFn: () =>
      apiFetch<
        Array<{
          id: string;
          name: string;
          versions: Array<{ id: string; version: number; status: string }>;
        }>
      >('/forms', { token: getAccessToken() }),
  });

  const publishedForms = useMemo(
    () =>
      (forms.data ?? []).filter((form) =>
        form.versions.some((v) => v.status === 'PUBLISHED'),
      ),
    [forms.data],
  );

  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [registration, setRegistration] = useState({
    enabled: false,
    formId: '',
    notifyEmails: '',
  });
  const [testTo, setTestTo] = useState('');
  const [testNote, setTestNote] = useState('');
  const [testError, setTestError] = useState('');

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

    setRegistration({
      enabled: Boolean(settingValue(data.settings, 'registration.enabled')),
      formId: String(settingValue(data.settings, 'registration.formId') ?? ''),
      notifyEmails: String(
        settingValue(data.settings, 'registration.notifyEmails') ?? '',
      ),
    });
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

  const testMail = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; provider: string }>('/settings/test-email', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({ to: testTo.trim() }),
      }),
    onSuccess: (res) => {
      setTestNote(`Test email sent via ${res.provider} to ${testTo.trim()}.`);
      setTestError('');
    },
    onError: (caught) => {
      setTestNote('');
      setTestError((caught as Error).message || 'Test email failed.');
    },
  });

  const saveRegistration = useMutation({
    mutationFn: () =>
      apiFetch('/settings/integrations', {
        method: 'PUT',
        token: getAccessToken(),
        body: JSON.stringify({
          values: [
            { key: 'registration.enabled', value: registration.enabled },
            { key: 'registration.formId', value: registration.formId },
            {
              key: 'registration.notifyEmails',
              value: registration.notifyEmails,
            },
          ],
        }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">System settings</h1>
        <p className="text-sm text-[var(--muted)]">
          Email, storage, AI, and ops are managed here (not via .env). Values are
          stored in the database; secrets are masked on read. Leave a secret blank
          to keep the existing value. For SMTP, set provider to smtp, save, then
          send a test email.
        </p>
      </div>

      {isLoading && <p>Loading…</p>}
      {error && <p className="text-red-700">{(error as Error).message}</p>}

      <Card className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-medium">Event registration</h2>
            <p className="text-xs text-[var(--muted)]">
              Public “Register for event” uses a published form, then email OTP
              and password setup. Client/Guest is collected on the form flow.
            </p>
          </div>
          <Button
            onClick={() => saveRegistration.mutate()}
            disabled={saveRegistration.isPending}
          >
            {saveRegistration.isPending ? 'Saving…' : 'Save registration'}
          </Button>
        </div>

        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={registration.enabled}
            onChange={(e) =>
              setRegistration((r) => ({ ...r, enabled: e.target.checked }))
            }
          />
          Enable public registration
        </label>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Registration form
          </label>
          <select
            className="h-10 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm"
            value={registration.formId}
            onChange={(e) =>
              setRegistration((r) => ({ ...r, formId: e.target.value }))
            }
          >
            <option value="">Select a published form…</option>
            {publishedForms.map((form) => (
              <option key={form.id} value={form.id}>
                {form.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Latest published version is used. The Client/Guest role field is
            added automatically.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Notify admins (emails)
          </label>
          <Input
            value={registration.notifyEmails}
            onChange={(e) =>
              setRegistration((r) => ({
                ...r,
                notifyEmails: e.target.value,
              }))
            }
            placeholder="admin@example.com, ops@example.com"
          />
          <p className="mt-1 text-xs text-[var(--muted)]">
            Comma-separated. Leave blank to notify all active admin users.
          </p>
        </div>

        {saveRegistration.isSuccess ? (
          <p className="text-sm text-[var(--success)]">Registration settings saved.</p>
        ) : null}
        {saveRegistration.error ? (
          <p className="text-sm text-[var(--danger)]">
            {(saveRegistration.error as Error).message}
          </p>
        ) : null}
      </Card>

      {data?.integration.map((group) => (
        <Card key={group.id} className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-medium">{group.title}</h2>
              <p className="text-xs text-[var(--muted)]">
                {group.id === 'email'
                  ? 'Messages to guests use these sender and SMTP details. Large batches wait about 5 seconds between sends.'
                  : 'Setting key shown on each row'}
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
          {group.id === 'email' ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card-elevated)] p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold">Send a test email</h3>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Uses the saved settings. Save the email group first if you
                  changed host, port, or password.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <label className="mb-1 block text-sm font-medium">
                    Send test to
                  </label>
                  <Input
                    type="email"
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                    placeholder="name@example.com"
                    autoComplete="off"
                  />
                </div>
                <Button
                  type="button"
                  disabled={testMail.isPending || !testTo.trim()}
                  onClick={() => testMail.mutate()}
                >
                  {testMail.isPending ? 'Sending…' : 'Send test'}
                </Button>
              </div>
              {testNote ? (
                <p className="text-sm text-[var(--success)]">{testNote}</p>
              ) : null}
              {testError ? (
                <p className="text-sm text-[var(--danger)]">{testError}</p>
              ) : null}
            </div>
          ) : null}
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
