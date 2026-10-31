'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import {
  formatEventDate,
  isoToEventDateTime,
  normalizeEventSchedule,
  type EventSchedule,
} from '@/lib/event-schedule';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { EventDateChips } from '@/components/event-date-chips';
import { EmptyState } from '@/components/empty-state';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

type Place = {
  id: string;
  name: string;
  code: string;
  location: string | null;
  isActive: boolean;
};

type OrgOption = { id: string; name: string; code: string };

type Assignment = {
  id: string;
  organizationId: string;
  placeId: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  note: string | null;
  meetingsUpdated?: number;
  organization: { id: string; name: string; code: string };
  place: { id: string; name: string; code: string; location: string | null };
};

function windowLabel(row: Assignment) {
  const start = isoToEventDateTime(row.startsAt);
  const end = isoToEventDateTime(row.endsAt);
  const day = start.date ? formatEventDate(start.date, 'short') : '—';
  if (row.allDay) return `${day} · all day`;
  return `${day} · ${start.time}–${end.time}`;
}

export function InvestorTablePanel({
  organizationId,
  title = 'Investor tables',
  description = 'Allot a table to an investor for a day or a time window. Every meeting with that investor in the window is marked on that table.',
}: {
  organizationId?: string;
  title?: string;
  description?: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    organizationId: organizationId ?? '',
    placeId: '',
    date: '',
    allEventDays: false,
    scope: 'day' as 'day' | 'window',
    startTime: '09:00',
    endTime: '17:00',
    note: '',
  });

  const bookingWindow = useQuery({
    queryKey: ['meeting-booking-window'],
    queryFn: () =>
      apiFetch<EventSchedule>('/meeting-requests/booking-window', {
        token: getAccessToken(),
      }),
  });
  const schedule = normalizeEventSchedule(bookingWindow.data);

  const assignments = useQuery({
    queryKey: ['place-assignments', organizationId ?? 'all'],
    queryFn: () => {
      const params = new URLSearchParams();
      if (organizationId) params.set('organizationId', organizationId);
      return apiFetch<Assignment[]>(
        `/places/assignments${params.toString() ? `?${params}` : ''}`,
        { token: getAccessToken() },
      );
    },
  });

  const places = useQuery({
    queryKey: ['places'],
    queryFn: () => apiFetch<Place[]>('/places', { token: getAccessToken() }),
  });

  const investors = useQuery({
    queryKey: ['orgs-companies-for-meetings'],
    enabled: !organizationId && open,
    queryFn: () =>
      apiFetch<{ items: OrgOption[] }>(
        '/organizations?type=COMPANY&pageSize=100',
        { token: getAccessToken() },
      ),
  });

  const activePlaces = useMemo(
    () => (places.data ?? []).filter((place) => place.isActive),
    [places.data],
  );

  const create = useMutation({
    mutationFn: () => {
      const dates = form.allEventDays
        ? schedule.dates
        : form.date
          ? [form.date]
          : [];
      return apiFetch<{ items: Assignment[] }>('/places/assignments', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({
          organizationId: organizationId || form.organizationId,
          placeId: form.placeId,
          dates,
          allDay: form.scope === 'day',
          startTime: form.scope === 'window' ? form.startTime : undefined,
          endTime: form.scope === 'window' ? form.endTime : undefined,
          note: form.note.trim() || undefined,
        }),
      });
    },
    onSuccess: async (result) => {
      setOpen(false);
      setError(null);
      setForm((current) => ({
        ...current,
        placeId: '',
        note: '',
        allEventDays: false,
      }));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['place-assignments'] }),
        qc.invalidateQueries({ queryKey: ['admin-meetings'] }),
        qc.invalidateQueries({ queryKey: ['org-profile'] }),
      ]);
      const updated = result.items.reduce(
        (sum, row) => sum + (row.meetingsUpdated ?? 0),
        0,
      );
      if (updated > 0) {
        setError(null);
      }
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : (err as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/places/assignments/${id}`, {
        method: 'DELETE',
        token: getAccessToken(),
      }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ['place-assignments'] }),
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : (err as Error).message),
  });

  const rows = assignments.data ?? [];

  return (
    <Card id="table">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
            Tables
          </p>
          <h2 className="h-display text-lg">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
            {description}
          </p>
        </div>
        <Button
          onClick={() => {
            setError(null);
            setForm((current) => ({
              ...current,
              organizationId: organizationId ?? current.organizationId,
              date: current.date || schedule.dates[0] || '',
            }));
            setOpen(true);
          }}
        >
          Allot table
        </Button>
      </div>

      {error && !open ? (
        <p className="mb-3 text-sm text-rose-700">{error}</p>
      ) : null}

      {assignments.isLoading ? (
        <p className="text-sm text-[var(--muted)]">Loading table allotments…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No table allotted yet"
          description="Give this investor a home table for a day or a shorter window. New and existing meetings in that window will use it."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              {!organizationId ? <TH>Investor</TH> : null}
              <TH>Table</TH>
              <TH>When</TH>
              <TH>Note</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id}>
                {!organizationId ? (
                  <TD className="font-medium">{row.organization.name}</TD>
                ) : null}
                <TD>
                  <div className="font-medium">{row.place.name}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {row.place.location || row.place.code}
                  </div>
                </TD>
                <TD>
                  <Badge variant={row.allDay ? 'accent' : 'secondary'}>
                    {windowLabel(row)}
                  </Badge>
                </TD>
                <TD className="text-sm text-[var(--muted)]">
                  {row.note || '—'}
                </TD>
                <TD className="text-right">
                  <Button
                    size="sm"
                    variant="danger"
                    loading={remove.isPending && remove.variables === row.id}
                    onClick={() => {
                      const ok = window.confirm(
                        `Remove ${row.place.name} from ${row.organization.name}? Existing meetings keep their current table.`,
                      );
                      if (ok) remove.mutate(row.id);
                    }}
                  >
                    Remove
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Modal
        open={open}
        title="Allot a table"
        description="Choose the investor, table, and either a full event day or a time window."
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate()}
              loading={create.isPending}
              disabled={
                !(organizationId || form.organizationId) ||
                !form.placeId ||
                (!form.allEventDays && !form.date)
              }
            >
              {create.isPending ? 'Saving…' : 'Allot table'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {!organizationId ? (
            <label className="block text-sm">
              Investor
              <select
                className="mt-1 h-10 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm"
                value={form.organizationId}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    organizationId: e.target.value,
                  }))
                }
              >
                <option value="">Select investor</option>
                {(investors.data?.items ?? []).map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="block text-sm">
            Table / place
            <select
              className="mt-1 h-10 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm"
              value={form.placeId}
              onChange={(e) =>
                setForm((current) => ({ ...current, placeId: e.target.value }))
              }
            >
              <option value="">Select table</option>
              {activePlaces.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                  {place.location ? ` · ${place.location}` : ''}
                </option>
              ))}
            </select>
          </label>

          <div>
            <p className="mb-1.5 text-sm font-medium">Scope</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['day', 'Full day'],
                  ['window', 'Time window'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    form.scope === value
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border)] bg-white text-[var(--muted)]'
                  }`}
                  onClick={() =>
                    setForm((current) => ({ ...current, scope: value }))
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium">Event day</p>
            <EventDateChips
              dates={schedule.dates}
              value={form.allEventDays ? '' : form.date}
              onChange={(date) =>
                setForm((current) => ({
                  ...current,
                  date,
                  allEventDays: false,
                }))
              }
            />
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.allEventDays}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    allEventDays: e.target.checked,
                  }))
                }
              />
              All event days
            </label>
          </div>

          {form.scope === 'window' ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                From
                <Input
                  type="time"
                  className="mt-1"
                  value={form.startTime}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      startTime: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="block text-sm">
                To
                <Input
                  type="time"
                  className="mt-1"
                  value={form.endTime}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      endTime: e.target.value,
                    }))
                  }
                />
              </label>
            </div>
          ) : null}

          <label className="block text-sm">
            Note (optional)
            <Input
              className="mt-1"
              value={form.note}
              onChange={(e) =>
                setForm((current) => ({ ...current, note: e.target.value }))
              }
              placeholder="Blue Zone morning block"
            />
          </label>
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        </div>
      </Modal>
    </Card>
  );
}
