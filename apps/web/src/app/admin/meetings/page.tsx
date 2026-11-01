'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { statusTone } from '@/lib/status';
import { PageHeader } from '@/components/page-header';
import {
  MeetingsCalendar,
  toCalendarEvents,
} from '@/components/meetings-calendar';
import { MeetingPlaceLink } from '@/components/meeting-place-link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { EventDateChips } from '@/components/event-date-chips';
import {
  eventDateTimeToIso,
  isoToEventDateTime,
  normalizeEventSchedule,
  type EventSchedule,
} from '@/lib/event-schedule';
import { cn } from '@/lib/utils';

type MeetingRow = {
  id: string;
  status: string;
  startsAt: string;
  endsAt?: string | null;
  durationMinutes?: number | null;
  actualStartedAt?: string | null;
  actualEndedAt?: string | null;
  actualDurationMinutes?: number | null;
  matchScore: number | null;
  venue?: string | null;
  location?: string | null;
  invitedByLabel?: string | null;
  companyOrgId: string;
  vendorOrgId: string;
  companyOrg: { id: string; name: string };
  vendorOrg: { id: string; name: string };
  place?: {
    id: string;
    name: string;
    location: string | null;
    latitude?: number | null;
    longitude?: number | null;
    mapAddress?: string | null;
  } | null;
};

/** Prefer recorded on-site duration; fall back to scheduled length. */
function formatMeetingDurationMins(m: MeetingRow): string {
  if (
    typeof m.actualDurationMinutes === 'number' &&
    Number.isFinite(m.actualDurationMinutes)
  ) {
    return `${m.actualDurationMinutes} min`;
  }
  if (m.status === 'IN_PROGRESS' && m.actualStartedAt) {
    const started = new Date(m.actualStartedAt).getTime();
    if (Number.isFinite(started)) {
      const elapsed = Math.max(
        1,
        Math.round((Date.now() - started) / 60_000),
      );
      return `${elapsed} min (live)`;
    }
  }
  if (
    typeof m.durationMinutes === 'number' &&
    Number.isFinite(m.durationMinutes)
  ) {
    return `${m.durationMinutes} min`;
  }
  return '—';
}

type OrgOption = { id: string; name: string; code: string };

function toDateTimeLocal(iso: string) {
  const parts = isoToEventDateTime(iso);
  if (!parts.date || !parts.time) return '';
  return `${parts.date}T${parts.time}`;
}

function fromDateTimeLocal(value: string) {
  const [date, time] = value.split('T');
  if (!date || !time) return new Date(value).toISOString();
  return eventDateTimeToIso(date, time);
}

function localDateKey(iso: string) {
  return isoToEventDateTime(iso).date;
}

function localTimeKey(iso: string) {
  return isoToEventDateTime(iso).time;
}

const MEETING_STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All (except cancelled)' },
  { value: 'PROPOSED', label: 'Proposed' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'AWAITING_CONFIRMATION', label: 'Awaiting confirmation' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'RESCHEDULE_REQUESTED', label: 'Reschedule requested' },
  { value: 'RESCHEDULED', label: 'Rescheduled' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'NO_SHOW', label: 'No show' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const emptyFilters = {
  date: '',
  timeFrom: '',
  timeTo: '',
  companyOrgId: '',
  vendorOrgId: '',
  status: '',
  search: '',
};

type RequestRow = {
  id: string;
  status: string;
  proposedStartsAt: string | null;
  proposedEndsAt: string | null;
  fromOrg: { name: string };
  toOrg: { name: string };
  place?: { name: string; location?: string | null } | null;
  meeting?: { id: string } | null;
};

const ADMIN_MEETINGS_PAGE_SIZE = 2_000;

async function fetchAllAdminMeetings() {
  const token = getAccessToken();
  const items: MeetingRow[] = [];
  let page = 1;
  let total = 0;

  for (;;) {
    const res = await apiFetch<{
      items: MeetingRow[];
      total: number;
    }>(
      `/meetings?page=${page}&pageSize=${ADMIN_MEETINGS_PAGE_SIZE}`,
      { token },
    );
    total = res.total;
    items.push(...res.items);
    if (items.length >= total || res.items.length === 0) {
      break;
    }
    page += 1;
  }

  return { items, total };
}

export default function AdminMeetingsPage() {
  const qc = useQueryClient();
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('list');
  const [filters, setFilters] = useState(emptyFilters);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<MeetingRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    companyOrgId: '',
    vendorOrgId: '',
    startsAt: '',
    reason: '',
  });
  const [createForm, setCreateForm] = useState({
    companyOrgId: '',
    vendorOrgId: '',
    startsAt: '',
    durationMinutes: '15',
    reason: '',
  });

  const meetings = useQuery({
    queryKey: ['admin-meetings'],
    queryFn: fetchAllAdminMeetings,
  });

  const requests = useQuery({
    queryKey: ['admin-meeting-requests'],
    queryFn: () =>
      apiFetch<{ items: RequestRow[] }>('/meeting-requests', {
        token: getAccessToken(),
      }),
  });

  const companies = useQuery({
    queryKey: ['orgs-companies-for-meetings'],
    queryFn: () =>
      apiFetch<{ items: OrgOption[] }>(
        '/organizations?type=COMPANY&pageSize=100',
        { token: getAccessToken() },
      ),
  });
  const vendors = useQuery({
    queryKey: ['orgs-vendors-for-meetings'],
    queryFn: () =>
      apiFetch<{ items: OrgOption[] }>(
        '/organizations?type=VENDOR&pageSize=100',
        { token: getAccessToken() },
      ),
  });

  const bookingWindow = useQuery({
    queryKey: ['meeting-booking-window'],
    queryFn: () =>
      apiFetch<EventSchedule>('/meeting-requests/booking-window', {
        token: getAccessToken(),
      }),
  });
  const eventSchedule = normalizeEventSchedule(bookingWindow.data);
  const [editDate, editTime] = editForm.startsAt.split('T');
  const [createDate, createTime] = createForm.startsAt.split('T');

  const saveMeeting = useMutation({
    mutationFn: () => {
      if (!edit) throw new Error('No meeting selected');
      return apiFetch(`/matchmaking/meetings/${edit.id}`, {
        method: 'PATCH',
        token: getAccessToken(),
        body: JSON.stringify({
          companyOrgId: editForm.companyOrgId,
          vendorOrgId: editForm.vendorOrgId,
          startsAt: fromDateTimeLocal(editForm.startsAt),
          reason: editForm.reason.trim() || undefined,
        }),
      });
    },
    onSuccess: async () => {
      setEdit(null);
      setError(null);
      await qc.invalidateQueries({ queryKey: ['admin-meetings'] });
    },
    onError: (err) => setError((err as Error).message),
  });

  const createMeeting = useMutation({
    mutationFn: () =>
      apiFetch('/matchmaking/meetings', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({
          companyOrgId: createForm.companyOrgId,
          vendorOrgId: createForm.vendorOrgId,
          startsAt: fromDateTimeLocal(createForm.startsAt),
          durationMinutes: Number(createForm.durationMinutes) || 15,
          reason: createForm.reason.trim() || 'Manual meeting',
        }),
      }),
    onSuccess: async () => {
      setCreating(false);
      setCreateForm({
        companyOrgId: '',
        vendorOrgId: '',
        startsAt: '',
        durationMinutes: '15',
        reason: '',
      });
      setError(null);
      await qc.invalidateQueries({ queryKey: ['admin-meetings'] });
    },
    onError: (err) => setError((err as Error).message),
  });

  const removeMeeting = useMutation({
    mutationFn: (meetingId: string) =>
      apiFetch(`/matchmaking/meetings/${meetingId}`, {
        method: 'DELETE',
        token: getAccessToken(),
        body: JSON.stringify({ reason: 'Removed by admin' }),
      }),
    onMutate: (id) => setDeletingId(id),
    onSuccess: async () => {
      setError(null);
      await qc.invalidateQueries({ queryKey: ['admin-meetings'] });
    },
    onError: (err) =>
      setError(
        err instanceof ApiError ? err.message : (err as Error).message,
      ),
    onSettled: () => setDeletingId(null),
  });

  const activeMeetings = useMemo(() => {
    const items = meetings.data?.items ?? [];
    if (filters.status === 'CANCELLED') {
      return items.filter((m) => m.status === 'CANCELLED');
    }
    if (filters.status) {
      return items.filter((m) => m.status === filters.status);
    }
    return items.filter((m) => m.status !== 'CANCELLED');
  }, [meetings.data?.items, filters.status]);

  const companyFilterOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const org of companies.data?.items ?? []) {
      map.set(org.id, org.name);
    }
    for (const m of activeMeetings) {
      map.set(m.companyOrgId ?? m.companyOrg.id, m.companyOrg.name);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [activeMeetings, companies.data?.items]);

  const vendorFilterOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const org of vendors.data?.items ?? []) {
      map.set(org.id, org.name);
    }
    for (const m of activeMeetings) {
      map.set(m.vendorOrgId ?? m.vendorOrg.id, m.vendorOrg.name);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [activeMeetings, vendors.data?.items]);

  const rows = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return activeMeetings.filter((m) => {
      const companyId = m.companyOrgId ?? m.companyOrg.id;
      const vendorId = m.vendorOrgId ?? m.vendorOrg.id;
      const dateKey = localDateKey(m.startsAt);
      const timeKey = localTimeKey(m.startsAt);

      if (filters.companyOrgId && companyId !== filters.companyOrgId) {
        return false;
      }
      if (filters.vendorOrgId && vendorId !== filters.vendorOrgId) {
        return false;
      }
      if (filters.date && dateKey !== filters.date) {
        return false;
      }
      if (filters.timeFrom && timeKey < filters.timeFrom) {
        return false;
      }
      if (filters.timeTo && timeKey > filters.timeTo) {
        return false;
      }
      if (!q) return true;
      return (
        m.companyOrg.name.toLowerCase().includes(q) ||
        m.vendorOrg.name.toLowerCase().includes(q) ||
        m.status.toLowerCase().includes(q)
      );
    });
  }, [activeMeetings, filters]);

  const filtersActive = Boolean(
    filters.date ||
      filters.timeFrom ||
      filters.timeTo ||
      filters.companyOrgId ||
      filters.vendorOrgId ||
      filters.status ||
      filters.search.trim(),
  );

  const calendarEvents = useMemo(
    () =>
      toCalendarEvents({
        meetings: rows,
        requests: requests.data?.items,
      }),
    [rows, requests.data?.items],
  );

  function openEdit(meeting: MeetingRow) {
    setEdit(meeting);
    setEditForm({
      companyOrgId: meeting.companyOrgId ?? meeting.companyOrg.id,
      vendorOrgId: meeting.vendorOrgId ?? meeting.vendorOrg.id,
      startsAt: toDateTimeLocal(meeting.startsAt),
      reason: '',
    });
    setError(null);
  }

  function confirmDelete(meeting: MeetingRow) {
    const ok = window.confirm(
      `Delete meeting between ${meeting.companyOrg.name} and ${meeting.vendorOrg.name}?`,
    );
    if (!ok) return;
    removeMeeting.mutate(meeting.id);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Match & meet"
        title="Meetings"
        description="Scheduled meetings are confirmed automatically. Edit, delete, or add a manual meeting here."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-[var(--border)] bg-white p-1">
              <button
                type="button"
                onClick={() => setViewMode('calendar')}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-semibold sm:text-sm',
                  viewMode === 'calendar'
                    ? 'bg-[var(--accent)] text-[var(--accent-foreground)]'
                    : 'text-[var(--muted)]',
                )}
              >
                Event days
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-semibold sm:text-sm',
                  viewMode === 'list'
                    ? 'bg-[var(--accent)] text-[var(--accent-foreground)]'
                    : 'text-[var(--muted)]',
                )}
              >
                List
              </button>
            </div>
            <Button
              onClick={() => {
                setCreating(true);
                setError(null);
              }}
            >
              Manual meeting
            </Button>
          </div>
        }
      />

      <Card>
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <p className="text-xs text-[var(--muted)]">
              Showing {rows.length} of {activeMeetings.length} meetings
              {meetings.data?.total != null
                ? ` (${meetings.data.total} in database)`
                : ''}
            </p>
            {filtersActive ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setFilters(emptyFilters)}
              >
                Clear filters
              </Button>
            ) : null}
          </div>
          <div>
            <p className="mb-1 text-sm text-[var(--muted)]">Date</p>
            <EventDateChips
              dates={eventSchedule.dates}
              value={filters.date}
              allowEmpty
              onChange={(date) => setFilters((f) => ({ ...f, date }))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1.5 text-sm">
              <span className="text-[var(--muted)]">Status</span>
              <Select
                value={filters.status}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, status: e.target.value }))
                }
              >
                {MEETING_STATUS_FILTERS.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-[var(--muted)]">Investor</span>
              <Select
                value={filters.companyOrgId}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, companyOrgId: e.target.value }))
                }
              >
                <option value="">All investors</option>
                {companyFilterOptions.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-[var(--muted)]">Innovator</span>
              <Select
                value={filters.vendorOrgId}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, vendorOrgId: e.target.value }))
                }
              >
                <option value="">All innovators</option>
                {vendorFilterOptions.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-[var(--muted)]">Search</span>
              <Input
                placeholder="Investor or innovator name…"
                value={filters.search}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, search: e.target.value }))
                }
              />
            </label>
          </div>
        </div>

        {error ? <p className="mb-3 text-sm text-rose-700">{error}</p> : null}
        {meetings.isLoading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : null}
        {meetings.error ? (
          <p className="text-sm text-rose-700">
            {(meetings.error as Error).message}
          </p>
        ) : null}

        {viewMode === 'calendar' && !meetings.isLoading ? (
          <MeetingsCalendar
            events={calendarEvents}
            variant="admin"
            onSelectEvent={(event) => {
              if (event.kind !== 'meeting') return;
              const meetingId = event.id.replace(/^meeting:/, '');
              const meeting = rows.find((row) => row.id === meetingId);
              if (meeting) openEdit(meeting);
            }}
          />
        ) : null}

        {viewMode === 'list' && !meetings.isLoading && rows.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            {activeMeetings.length === 0
              ? 'No meetings yet. Create a manual meeting or wait for peer requests to be confirmed.'
              : 'No meetings match these filters.'}
          </p>
        ) : null}

        {viewMode === 'list' && !meetings.isLoading && rows.length > 0 ? (
          <>
            <div className="grid gap-3 sm:hidden">
              {rows.map((m) => {
                const invitedBy = m.invitedByLabel || 'Admin created meeting';
                const isAdminCreated = invitedBy === 'Admin created meeting';
                return (
                  <div
                    key={m.id}
                    className="min-w-0 rounded-2xl border border-[var(--border)] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbfd_100%)] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[#172B4D]">
                          {m.companyOrg.name}
                        </p>
                        <p className="mt-0.5 truncate text-sm text-[var(--muted)]">
                          ↔ {m.vendorOrg.name}
                        </p>
                      </div>
                      <Badge variant={statusTone(m.status)}>
                        {m.status.replaceAll('_', ' ')}
                      </Badge>
                    </div>
                    <div className="mt-3 space-y-1.5 text-sm">
                      <p>{new Date(m.startsAt).toLocaleString()}</p>
                      <p className="tabular-nums text-[var(--muted)]">
                        Duration {formatMeetingDurationMins(m)}
                      </p>
                      <MeetingPlaceLink
                        place={m.place}
                        fallback={m.location || m.venue}
                        compact
                      />
                      {isAdminCreated ? (
                        <Badge variant="secondary">Admin created meeting</Badge>
                      ) : (
                        <p className="text-xs text-[var(--muted)]">{invitedBy}</p>
                      )}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => openEdit(m)}
                        disabled={['COMPLETED', 'NO_SHOW'].includes(m.status)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        className="flex-1"
                        onClick={() => confirmDelete(m)}
                        loading={deletingId === m.id}
                        disabled={[
                          'COMPLETED',
                          'NO_SHOW',
                          'IN_PROGRESS',
                        ].includes(m.status)}
                      >
                        {deletingId === m.id ? 'Deleting…' : 'Delete'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden sm:block">
              <Table>
                <THead>
                  <TR>
                    <TH>Investor</TH>
                    <TH>Innovator</TH>
                    <TH>Starts</TH>
                    <TH>Duration</TH>
                    <TH>Meeting place</TH>
                    <TH>Invited by</TH>
                    <TH>Status</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {rows.map((m) => {
                    const invitedBy =
                      m.invitedByLabel || 'Admin created meeting';
                    const isAdminCreated =
                      invitedBy === 'Admin created meeting';
                    return (
                      <TR key={m.id}>
                        <TD className="font-medium">{m.companyOrg.name}</TD>
                        <TD>{m.vendorOrg.name}</TD>
                        <TD>{new Date(m.startsAt).toLocaleString()}</TD>
                        <TD className="whitespace-nowrap tabular-nums">
                          {formatMeetingDurationMins(m)}
                        </TD>
                        <TD className="min-w-[11rem]">
                          <MeetingPlaceLink
                            place={m.place}
                            fallback={m.location || m.venue}
                            compact
                          />
                        </TD>
                        <TD>
                          {isAdminCreated ? (
                            <Badge variant="secondary">
                              Admin created meeting
                            </Badge>
                          ) : (
                            <span className="text-sm">{invitedBy}</span>
                          )}
                        </TD>
                        <TD>
                          <Badge variant={statusTone(m.status)}>
                            {m.status.replaceAll('_', ' ')}
                          </Badge>
                        </TD>
                        <TD className="space-x-2 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(m)}
                            disabled={['COMPLETED', 'NO_SHOW'].includes(
                              m.status,
                            )}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => confirmDelete(m)}
                            loading={deletingId === m.id}
                            disabled={[
                              'COMPLETED',
                              'NO_SHOW',
                              'IN_PROGRESS',
                            ].includes(m.status)}
                          >
                            {deletingId === m.id ? 'Deleting…' : 'Delete'}
                          </Button>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          </>
        ) : null}
      </Card>

      <Modal
        open={Boolean(edit)}
        onClose={() => setEdit(null)}
        title="Edit meeting"
      >
        <div className="space-y-3">
          <label className="block text-sm">
            Investor
            <Select
              className="mt-1"
              value={editForm.companyOrgId}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, companyOrgId: e.target.value }))
              }
            >
              <option value="">Select investor</option>
              {(companies.data?.items ?? []).map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-sm">
            Innovator
            <Select
              className="mt-1"
              value={editForm.vendorOrgId}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, vendorOrgId: e.target.value }))
              }
            >
              <option value="">Select innovator</option>
              {(vendors.data?.items ?? []).map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </Select>
          </label>
          <div className="space-y-2">
            <p className="text-sm">Event date</p>
            <EventDateChips
              dates={eventSchedule.dates}
              value={editDate ?? ''}
              onChange={(date) =>
                setEditForm((f) => ({
                  ...f,
                  startsAt: `${date}T${editTime || eventSchedule.activeStart}`,
                }))
              }
            />
            <label className="block text-sm">
              Start time
              <Input
                type="time"
                className="mt-1"
                min={eventSchedule.activeStart}
                max={eventSchedule.activeEnd}
                value={editTime ?? ''}
                onChange={(e) =>
                  setEditForm((f) => ({
                    ...f,
                    startsAt: `${editDate || eventSchedule.dates[0] || ''}T${e.target.value}`,
                  }))
                }
              />
            </label>
            <p className="text-xs text-[var(--muted)]">
              Active hours {eventSchedule.activeStart}–{eventSchedule.activeEnd}.
            </p>
          </div>
          <label className="block text-sm">
            Reason (optional)
            <Input
              className="mt-1"
              value={editForm.reason}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, reason: e.target.value }))
              }
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button
              loading={saveMeeting.isPending} disabled={!editForm.companyOrgId ||
                !editForm.vendorOrgId ||
                !editForm.startsAt}
              onClick={() => saveMeeting.mutate()}
            >
              {saveMeeting.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Manual meeting"
      >
        <div className="space-y-3">
          <label className="block text-sm">
            Investor
            <Select
              className="mt-1"
              value={createForm.companyOrgId}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, companyOrgId: e.target.value }))
              }
            >
              <option value="">Select investor</option>
              {(companies.data?.items ?? []).map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-sm">
            Innovator
            <Select
              className="mt-1"
              value={createForm.vendorOrgId}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, vendorOrgId: e.target.value }))
              }
            >
              <option value="">Select innovator</option>
              {(vendors.data?.items ?? []).map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </Select>
          </label>
          <div className="space-y-2">
            <p className="text-sm">Event date</p>
            <EventDateChips
              dates={eventSchedule.dates}
              value={createDate ?? ''}
              onChange={(date) =>
                setCreateForm((f) => ({
                  ...f,
                  startsAt: `${date}T${createTime || eventSchedule.activeStart}`,
                }))
              }
            />
            <label className="block text-sm">
              Start time
              <Input
                type="time"
                className="mt-1"
                min={eventSchedule.activeStart}
                max={eventSchedule.activeEnd}
                value={createTime ?? ''}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    startsAt: `${createDate || eventSchedule.dates[0] || ''}T${e.target.value}`,
                  }))
                }
              />
            </label>
            <p className="text-xs text-[var(--muted)]">
              Active hours {eventSchedule.activeStart}–{eventSchedule.activeEnd}.
            </p>
          </div>
          <label className="block text-sm">
            Duration (minutes)
            <Input
              type="number"
              min={5}
              className="mt-1"
              value={createForm.durationMinutes}
              onChange={(e) =>
                setCreateForm((f) => ({
                  ...f,
                  durationMinutes: e.target.value,
                }))
              }
            />
          </label>
          <label className="block text-sm">
            Reason
            <Input
              className="mt-1"
              value={createForm.reason}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, reason: e.target.value }))
              }
              placeholder="Why this manual meeting?"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              loading={createMeeting.isPending} disabled={!createForm.companyOrgId ||
                !createForm.vendorOrgId ||
                !createForm.startsAt}
              onClick={() => createMeeting.mutate()}
            >
              {createMeeting.isPending ? 'Creating…' : 'Create confirmed'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
