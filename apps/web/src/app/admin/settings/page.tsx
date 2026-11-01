'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useAdminQuery } from '@/lib/admin-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import {
  DEFAULT_EVENT_ACTIVE_END,
  DEFAULT_EVENT_ACTIVE_START,
  DEFAULT_EVENT_DATES,
  formatEventDate,
  parseEventDates,
} from '@/lib/event-schedule';

const EVENT_SETTING_KEYS = new Set([
  'ops.eventDates',
  'ops.eventActiveStart',
  'ops.eventActiveEnd',
  'ops.meetingDurationMinutes',
  'ops.meetingWindowStart',
  'ops.meetingWindowEnd',
]);

type Field = {
  key: string;
  envKey: string;
  label: string;
  description?: string;
  type:
    | 'string'
    | 'textarea'
    | 'number'
    | 'boolean'
    | 'select'
    | 'secret'
    | 'date';
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
    investorFormId: '',
    innovatorFormId: '',
    notifyEmails: '',
  });
  const [eventDates, setEventDates] = useState<string[]>(DEFAULT_EVENT_DATES);
  const [newEventDate, setNewEventDate] = useState('');
  const [eventHours, setEventHours] = useState({
    activeStart: DEFAULT_EVENT_ACTIVE_START,
    activeEnd: DEFAULT_EVENT_ACTIVE_END,
    durationMinutes: '15',
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

    const legacyFormId = String(
      settingValue(data.settings, 'registration.formId') ?? '',
    );
    setRegistration({
      enabled: Boolean(settingValue(data.settings, 'registration.enabled')),
      investorFormId: String(
        settingValue(data.settings, 'registration.investorFormId') ??
          legacyFormId,
      ),
      innovatorFormId: String(
        settingValue(data.settings, 'registration.innovatorFormId') ?? '',
      ),
      notifyEmails: String(
        settingValue(data.settings, 'registration.notifyEmails') ?? '',
      ),
    });

    const dates = parseEventDates(
      settingValue(data.settings, 'ops.eventDates') ??
        next['ops.eventDates'] ??
        DEFAULT_EVENT_DATES.join(','),
    );
    setEventDates(dates.length > 0 ? dates : DEFAULT_EVENT_DATES);
    setEventHours({
      activeStart: String(
        settingValue(data.settings, 'ops.eventActiveStart') ??
          next['ops.eventActiveStart'] ??
          DEFAULT_EVENT_ACTIVE_START,
      ),
      activeEnd: String(
        settingValue(data.settings, 'ops.eventActiveEnd') ??
          next['ops.eventActiveEnd'] ??
          DEFAULT_EVENT_ACTIVE_END,
      ),
      durationMinutes: String(
        settingValue(data.settings, 'ops.meetingDurationMinutes') ??
          next['ops.meetingDurationMinutes'] ??
          15,
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
            {
              key: 'registration.investorFormId',
              value: registration.investorFormId,
            },
            {
              key: 'registration.innovatorFormId',
              value: registration.innovatorFormId,
            },
            // Keep legacy key aligned with investor form for older clients.
            {
              key: 'registration.formId',
              value: registration.investorFormId,
            },
            {
              key: 'registration.notifyEmails',
              value: registration.notifyEmails,
            },
          ],
        }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  const saveEventSchedule = useMutation({
    mutationFn: () =>
      apiFetch('/settings/integrations', {
        method: 'PUT',
        token: getAccessToken(),
        body: JSON.stringify({
          values: [
            { key: 'ops.eventDates', value: eventDates.join(',') },
            { key: 'ops.eventActiveStart', value: eventHours.activeStart },
            { key: 'ops.eventActiveEnd', value: eventHours.activeEnd },
            {
              key: 'ops.meetingDurationMinutes',
              value: Number(eventHours.durationMinutes) || 15,
            },
          ],
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings'] });
      void qc.invalidateQueries({ queryKey: ['meeting-booking-window'] });
    },
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
            <h2 className="font-medium">Event dates & hours</h2>
            <p className="text-xs text-[var(--muted)]">
              Meetings can only be booked on these days during active hours
              (Dubai time). Investor, innovator, and admin calendars show only
              these dates.
            </p>
          </div>
          <Button
            onClick={() => saveEventSchedule.mutate()}
            loading={saveEventSchedule.isPending}
            disabled={eventDates.length === 0}
          >
            {saveEventSchedule.isPending ? 'Saving…' : 'Save event schedule'}
          </Button>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Event dates</p>
          <div className="flex flex-wrap gap-2">
            {eventDates.map((ymd) => (
              <span
                key={ymd}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card-elevated)] px-3 py-1.5 text-sm"
              >
                {formatEventDate(ymd)}
                <button
                  type="button"
                  className="text-[var(--muted)] hover:text-rose-700"
                  onClick={() =>
                    setEventDates((dates) => dates.filter((d) => d !== ymd))
                  }
                  aria-label={`Remove ${ymd}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="min-w-[12rem] flex-1 text-sm">
              <span className="mb-1 block text-[var(--muted)]">Add a date</span>
              <Input
                type="date"
                value={newEventDate}
                onChange={(e) => setNewEventDate(e.target.value)}
              />
            </label>
            <Button
              type="button"
              variant="outline"
              disabled={
                !/^\d{4}-\d{2}-\d{2}$/.test(newEventDate) ||
                eventDates.includes(newEventDate)
              }
              onClick={() => {
                setEventDates((dates) =>
                  [...new Set([...dates, newEventDate])].sort(),
                );
                setNewEventDate('');
              }}
            >
              Add date
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block text-[var(--muted)]">Active from</span>
            <Input
              type="time"
              value={eventHours.activeStart}
              onChange={(e) =>
                setEventHours((h) => ({ ...h, activeStart: e.target.value }))
              }
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-[var(--muted)]">Active until</span>
            <Input
              type="time"
              value={eventHours.activeEnd}
              onChange={(e) =>
                setEventHours((h) => ({ ...h, activeEnd: e.target.value }))
              }
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-[var(--muted)]">
              Meeting length (min)
            </span>
            <Input
              type="number"
              min={5}
              max={240}
              value={eventHours.durationMinutes}
              onChange={(e) =>
                setEventHours((h) => ({
                  ...h,
                  durationMinutes: e.target.value,
                }))
              }
            />
          </label>
        </div>

        {saveEventSchedule.isSuccess ? (
          <p className="text-sm text-[var(--success)]">
            Event dates and hours saved. Meetings can only be booked in this
            window.
          </p>
        ) : null}
        {saveEventSchedule.error ? (
          <p className="text-sm text-[var(--danger)]">
            {(saveEventSchedule.error as Error).message}
          </p>
        ) : null}
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-medium">Event registration</h2>
            <p className="text-xs text-[var(--muted)]">
              Shark Tank–style public signup: separate investor and innovator
              pitch forms, email OTP, then instant verified access to each
              dashboard. Meetings only schedule inside each party’s availability.
            </p>
          </div>
          <Button
            onClick={() => saveRegistration.mutate()}
            loading={saveRegistration.isPending}
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

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Investor form
            </label>
            <Select
              value={registration.investorFormId}
              onChange={(e) =>
                setRegistration((r) => ({
                  ...r,
                  investorFormId: e.target.value,
                }))
              }
            >
              <option value="">Select investor form…</option>
              {publishedForms.map((form) => (
                <option key={form.id} value={form.id}>
                  {form.name}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Used when someone registers as an investor.
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Innovator form
            </label>
            <Select
              value={registration.innovatorFormId}
              onChange={(e) =>
                setRegistration((r) => ({
                  ...r,
                  innovatorFormId: e.target.value,
                }))
              }
            >
              <option value="">Select innovator form…</option>
              {publishedForms.map((form) => (
                <option key={form.id} value={form.id}>
                  {form.name}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Used when someone registers as an innovator.
            </p>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">
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

      {data?.integration.map((group) => {
        const fields =
          group.id === 'ops'
            ? group.fields.filter((field) => !EVENT_SETTING_KEYS.has(field.key))
            : group.fields;
        if (fields.length === 0) return null;
        return (
        <Card key={group.id} className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-medium">{group.title}</h2>
              <p className="text-xs text-[var(--muted)]">
                {group.id === 'email'
                  ? 'Messages to innovators use these sender and SMTP details. Large batches wait about 5 seconds between sends.'
                  : group.id === 'ai'
                    ? 'Recommendation score threshold controls which pairs appear as recommendations (0–100). AI matches profile and tags only — never personal contact details.'
                    : 'Setting key shown on each row'}
              </p>
            </div>
            <Button
              onClick={() => saveGroup.mutate(group)}
              loading={
                saveGroup.isPending && saveGroup.variables?.id === group.id
              }
            >
              {saveGroup.isPending && saveGroup.variables?.id === group.id
                ? 'Saving…'
                : 'Save group'}
            </Button>
          </div>
          <div className="space-y-3">
            {fields.map((field) => (
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
                    <Select
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
                    </Select>
                  ) : field.type === 'textarea' ? (
                    <div className="space-y-1">
                      <Textarea
                        className="min-h-[120px]"
                        placeholder={String(field.envDefault ?? '')}
                        value={String(draft[field.key] ?? '')}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            [field.key]: e.target.value,
                          }))
                        }
                      />
                      {field.description ? (
                        <p className="text-xs text-[var(--muted)]">
                          {field.description}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Input
                        type={
                          field.secret
                            ? 'password'
                            : field.type === 'number'
                              ? 'number'
                              : field.type === 'date'
                                ? 'date'
                                : 'text'
                        }
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
                            [field.key]: e.target.value,
                          }))
                        }
                      />
                      {field.description ? (
                        <p className="text-xs text-[var(--muted)]">
                          {field.description}
                        </p>
                      ) : null}
                    </div>
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
                  loading={testMail.isPending} disabled={!testTo.trim()}
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
        );
      })}

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
