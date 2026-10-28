'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiError, apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { TagMappingsPanel } from '@/components/tag-mappings-panel';

type MeetingRow = {
  id: string;
  startsAt: string;
  endsAt: string;
  matchScore: number | null;
  status?: string;
  companyOrgId?: string;
  vendorOrgId?: string;
  companyOrg: { id?: string; name: string };
  vendorOrg: { id?: string; name: string };
  match?: { explanation: string; isManual: boolean };
};

type Run = {
  id: string;
  status: string;
  config?: { meetingDurationMinutes?: number };
  scheduleVersions: Array<{
    id: string;
    status: string;
    meetings: MeetingRow[];
  }>;
  candidates: Array<{
    totalScore: number;
    eligible: boolean;
    explanation: string;
    companyOrgId: string;
    vendorOrgId: string;
    ineligibilityReasons?: string[];
  }>;
};

type OrgOption = { id: string; name: string; code: string };

const PAGE_SIZE = 25;

function toDateTimeLocal(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDateTimeLocal(value: string) {
  const d = new Date(value);
  return d.toISOString();
}

function toHm(value: string) {
  return value.slice(0, 5);
}

function formatSlot(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime())) return '—';
  const date = start.toLocaleDateString();
  const startTime = start.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const endTime = Number.isNaN(end.getTime())
    ? ''
    : end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return endTime ? `${date} · ${startTime}–${endTime}` : `${date} · ${startTime}`;
}

function shortExplanation(text?: string) {
  if (!text) return '—';
  const match = text.match(/Score\s+([\d.]+)/i);
  if (match) return `Score ${match[1]}`;
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
}

export default function MatchmakingPage() {
  const [date, setDate] = useState('2026-11-01');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [excludeEnabled, setExcludeEnabled] = useState(false);
  const [excludeStart, setExcludeStart] = useState('12:00');
  const [excludeEnd, setExcludeEnd] = useState('13:00');
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meetingSearch, setMeetingSearch] = useState('');
  const [meetingPage, setMeetingPage] = useState(1);
  const [edit, setEdit] = useState<MeetingRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    companyOrgId: '',
    vendorOrgId: '',
    startsAt: '',
    reason: '',
  });
  const [pendingRegenerate, setPendingRegenerate] = useState(false);

  const companies = useQuery({
    queryKey: ['orgs-companies-for-matchmaking'],
    enabled: Boolean(edit),
    queryFn: () =>
      apiFetch<{ items: OrgOption[] }>(
        '/organizations?type=COMPANY&pageSize=100',
        { token: getAccessToken() },
      ),
  });

  const vendors = useQuery({
    queryKey: ['orgs-vendors-for-matchmaking'],
    enabled: Boolean(edit),
    queryFn: () =>
      apiFetch<{ items: OrgOption[] }>(
        '/organizations?type=VENDOR&pageSize=100',
        { token: getAccessToken() },
      ),
  });

  const dateStatus = useQuery({
    queryKey: ['matchmaking-date-status', date],
    queryFn: () =>
      apiFetch<{
        scheduleDate: string;
        meetingCount: number;
        canGenerate: boolean;
      }>(`/matchmaking/dates/${date}/status`, { token: getAccessToken() }),
  });

  async function refreshRun(runId: string) {
    const refreshed = await apiFetch<Run>(`/matchmaking/runs/${runId}`, {
      token: getAccessToken(),
    });
    setRun(refreshed);
  }

  function buildRunPayload(forceRegenerate = false) {
    const startHm = toHm(startTime);
    const endHm = toHm(endTime);
    const gapStart = toHm(excludeStart);
    const gapEnd = toHm(excludeEnd);
    if (startHm >= endHm) {
      throw new Error('End time must be after start time');
    }
    if (
      excludeEnabled &&
      (gapStart >= gapEnd || gapStart < startHm || gapEnd > endHm)
    ) {
      throw new Error(
        'Exclude interval must sit inside the schedule start/end window',
      );
    }
    return {
      scheduleDate: date,
      startTime: startHm,
      endTime: endHm,
      timeZone: 'UTC',
      bufferMinutes: 5,
      maxMeetingsPerParticipant: 24,
      mode: 'VIRTUAL',
      forceRegenerate: forceRegenerate || undefined,
      excludeIntervals:
        excludeEnabled && gapStart && gapEnd
          ? [{ startTime: gapStart, endTime: gapEnd }]
          : [],
    };
  }

  const start = useMutation({
    mutationFn: (forceRegenerate?: boolean) =>
      apiFetch<Run>('/matchmaking/runs', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify(buildRunPayload(Boolean(forceRegenerate))),
      }),
    onSuccess: (data) => {
      setRun(data);
      setMeetingSearch('');
      setMeetingPage(1);
      setError(null);
      setPendingRegenerate(false);
      void dateStatus.refetch();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setPendingRegenerate(true);
        setError(err.message);
        return;
      }
      setError((err as Error).message);
    },
  });

  const publish = useMutation({
    mutationFn: (scheduleId: string) =>
      apiFetch(`/matchmaking/schedules/${scheduleId}/publish`, {
        method: 'POST',
        token: getAccessToken(),
      }),
    onSuccess: async () => {
      if (!run) return;
      await refreshRun(run.id);
    },
  });

  const saveMeeting = useMutation({
    mutationFn: () => {
      if (!edit) throw new Error('No meeting selected');
      return apiFetch<MeetingRow>(`/matchmaking/meetings/${edit.id}`, {
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
      if (!run) return;
      await refreshRun(run.id);
      setError(null);
    },
    onError: (err) => setError((err as Error).message),
  });

  const removeMeeting = useMutation({
    mutationFn: (meetingId: string) =>
      apiFetch(`/matchmaking/meetings/${meetingId}`, {
        method: 'DELETE',
        token: getAccessToken(),
        body: JSON.stringify({ reason: 'Removed from proposed schedule' }),
      }),
    onMutate: (meetingId) => setDeletingId(meetingId),
    onSuccess: (_data, meetingId) => {
      setRun((current) => {
        if (!current) return current;
        return {
          ...current,
          scheduleVersions: current.scheduleVersions.map((version, index) =>
            index === 0
              ? {
                  ...version,
                  meetings: version.meetings.filter((m) => m.id !== meetingId),
                }
              : version,
          ),
        };
      });
      setError(null);
    },
    onError: (err) => setError((err as Error).message),
    onSettled: () => setDeletingId(null),
  });

  const schedule = run?.scheduleVersions[0];
  const meetings = schedule?.meetings ?? [];

  const filteredMeetings = useMemo(() => {
    const q = meetingSearch.trim().toLowerCase();
    const sorted = [...meetings].sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
    if (!q) return sorted;
    return sorted.filter(
      (m) =>
        m.companyOrg.name.toLowerCase().includes(q) ||
        m.vendorOrg.name.toLowerCase().includes(q) ||
        (m.match?.explanation ?? '').toLowerCase().includes(q),
    );
  }, [meetings, meetingSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredMeetings.length / PAGE_SIZE));
  const page = Math.min(meetingPage, totalPages);
  const pagedMeetings = filteredMeetings.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const candidateStats = useMemo(() => {
    const all = run?.candidates ?? [];
    const eligible = all.filter((c) => c.eligible).length;
    const reasons = new Map<string, number>();
    for (const c of all) {
      for (const reason of c.ineligibilityReasons ?? []) {
        reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
      }
    }
    const topReasons = [...reasons.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    return { total: all.length, eligible, topReasons };
  }, [run?.candidates]);

  function openEdit(meeting: MeetingRow) {
    setEdit(meeting);
    setEditForm({
      companyOrgId: meeting.companyOrgId ?? meeting.companyOrg.id ?? '',
      vendorOrgId: meeting.vendorOrgId ?? meeting.vendorOrg.id ?? '',
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

  const companyOptions = useMemo(() => {
    const items = [...(companies.data?.items ?? [])];
    if (edit) {
      const id = edit.companyOrgId ?? edit.companyOrg.id;
      if (id && !items.some((o) => o.id === id)) {
        items.unshift({
          id,
          name: edit.companyOrg.name,
          code: '',
        });
      }
    }
    return items;
  }, [companies.data?.items, edit]);

  const vendorOptions = useMemo(() => {
    const items = [...(vendors.data?.items ?? [])];
    if (edit) {
      const id = edit.vendorOrgId ?? edit.vendorOrg.id;
      if (id && !items.some((o) => o.id === id)) {
        items.unshift({
          id,
          name: edit.vendorOrg.name,
          code: '',
        });
      }
    }
    return items;
  }, [vendors.data?.items, edit]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Matchmaking</h1>
        <p className="text-sm text-[var(--muted)]">
          Deterministic scoring with greedy scheduling. Results persist before
          publication; dashboards never re-run matching. Tag links below drive
          company ↔ vendor recommendations.
        </p>
      </div>

      <TagMappingsPanel />

      <Card className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-sm">Schedule date</label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm">Start time</label>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm">End time</label>
            <Input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
          <Button
            onClick={() => start.mutate(false)}
            disabled={start.isPending}
          >
            {start.isPending ? 'Running…' : 'Generate schedule'}
          </Button>
          {(dateStatus.data?.meetingCount ?? 0) > 0 ? (
            <Button
              variant="outline"
              onClick={() => {
                const count = dateStatus.data?.meetingCount ?? 0;
                const ok = window.confirm(
                  `Regenerate for ${date}? This cancels ${count} existing meeting${count === 1 ? '' : 's'} for that date, then creates a new schedule.`,
                );
                if (!ok) return;
                start.mutate(true);
              }}
              disabled={start.isPending}
            >
              Regenerate for date
            </Button>
          ) : null}
          {schedule && schedule.status !== 'PUBLISHED' && (
            <Button
              variant="outline"
              onClick={() => publish.mutate(schedule.id)}
              disabled={publish.isPending || meetings.length === 0}
            >
              Publish (confirm all)
            </Button>
          )}
        </div>
        {(dateStatus.data?.meetingCount ?? 0) > 0 ? (
          <p className="text-sm text-amber-800">
            {dateStatus.data?.meetingCount} active meeting
            {dateStatus.data?.meetingCount === 1 ? '' : 's'} already exist for{' '}
            {date}. Generate is blocked unless you regenerate (cancels existing
            for that date first).
          </p>
        ) : null}
        {pendingRegenerate ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span>{error ?? 'Meetings already exist for this date.'}</span>
            <Button
              size="sm"
              onClick={() => start.mutate(true)}
              disabled={start.isPending}
            >
              Regenerate anyway
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPendingRegenerate(false);
                setError(null);
              }}
            >
              Dismiss
            </Button>
          </div>
        ) : null}

        <div className="rounded-md border border-[var(--border)] p-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={excludeEnabled}
              onChange={(e) => setExcludeEnabled(e.target.checked)}
            />
            Exclude interval (no meetings in this window)
          </label>
          {excludeEnabled ? (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-sm">Exclude from</label>
                <Input
                  type="time"
                  value={excludeStart}
                  onChange={(e) => setExcludeStart(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm">Exclude to</label>
                <Input
                  type="time"
                  value={excludeEnd}
                  onChange={(e) => setExcludeEnd(e.target.value)}
                />
              </div>
              <p className="text-xs text-[var(--muted)]">
                Example: lunch break 12:00–13:00
              </p>
            </div>
          ) : null}
        </div>
        <p className="text-xs text-[var(--muted)]">
          Schedules all verified matching-eligible companies and vendors.
          Meeting length comes from Settings → Operations.
        </p>
      </Card>

      {error && <p className="text-sm text-red-700">{error}</p>}

      {run && (
        <>
          <Card>
            <div className="text-sm text-[var(--muted)]">Run status</div>
            <div className="text-xl font-semibold">{run.status}</div>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {meetings.length} meeting{meetings.length === 1 ? '' : 's'} ·{' '}
              {candidateStats.eligible}/{candidateStats.total} eligible pairs
              {run.config?.meetingDurationMinutes
                ? ` · ${run.config.meetingDurationMinutes} min slots`
                : ''}
            </p>
            {meetings.length === 0 && candidateStats.topReasons.length > 0 ? (
              <p className="mt-2 text-sm text-amber-800">
                No meetings scheduled. Top blockers:{' '}
                {candidateStats.topReasons
                  .map(([reason, count]) => `${reason} (${count})`)
                  .join(', ')}
              </p>
            ) : null}
          </Card>

          <Card>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-medium">Proposed meetings</h2>
              {meetings.length > 0 ? (
                <Input
                  className="max-w-xs"
                  placeholder="Search company or vendor…"
                  value={meetingSearch}
                  onChange={(e) => {
                    setMeetingSearch(e.target.value);
                    setMeetingPage(1);
                  }}
                />
              ) : null}
            </div>

            {meetings.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                No meetings yet. Verify companies and vendors are
                matching-eligible, then generate again.
              </p>
            ) : filteredMeetings.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                No meetings match “{meetingSearch}”.
              </p>
            ) : (
              <>
                <Table>
                  <THead>
                    <TR>
                      <TH>Company</TH>
                      <TH>Vendor</TH>
                      <TH>Score</TH>
                      <TH>Time</TH>
                      <TH>Match</TH>
                      <TH className="text-right">Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {pagedMeetings.map((m) => (
                      <TR key={m.id}>
                        <TD className="font-medium">{m.companyOrg.name}</TD>
                        <TD>{m.vendorOrg.name}</TD>
                        <TD>{m.matchScore?.toFixed(1) ?? '—'}</TD>
                        <TD className="whitespace-nowrap text-xs">
                          {formatSlot(m.startsAt, m.endsAt)}
                        </TD>
                        <TD
                          className="max-w-[14rem] truncate text-xs text-[var(--muted)]"
                          title={m.match?.explanation}
                        >
                          {shortExplanation(m.match?.explanation)}
                        </TD>
                        <TD>
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEdit(m)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={deletingId === m.id}
                              onClick={() => confirmDelete(m)}
                            >
                              {deletingId === m.id ? 'Deleting…' : 'Delete'}
                            </Button>
                          </div>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>

                {totalPages > 1 ? (
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-[var(--muted)]">
                      Showing {(page - 1) * PAGE_SIZE + 1}–
                      {Math.min(page * PAGE_SIZE, filteredMeetings.length)} of{' '}
                      {filteredMeetings.length}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={page <= 1}
                        onClick={() => setMeetingPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={page >= totalPages}
                        onClick={() =>
                          setMeetingPage((p) => Math.min(totalPages, p + 1))
                        }
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </Card>
        </>
      )}

      <Modal
        open={Boolean(edit)}
        title="Edit meeting"
        description="Change company, vendor, or start time before or after publishing."
        onClose={() => setEdit(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMeeting.mutate()}
              disabled={
                saveMeeting.isPending ||
                !editForm.companyOrgId ||
                !editForm.vendorOrgId ||
                !editForm.startsAt
              }
            >
              {saveMeeting.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm">Company</label>
            <select
              className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
              value={editForm.companyOrgId}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, companyOrgId: e.target.value }))
              }
            >
              <option value="">Select company…</option>
              {companyOptions.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm">Vendor</label>
            <select
              className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
              value={editForm.vendorOrgId}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, vendorOrgId: e.target.value }))
              }
            >
              <option value="">Select vendor…</option>
              {vendorOptions.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm">Starts at</label>
            <Input
              type="datetime-local"
              value={editForm.startsAt}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, startsAt: e.target.value }))
              }
            />
            <p className="mt-1 text-xs text-[var(--muted)]">
              End time keeps the meeting duration from Settings
              {edit?.endsAt
                ? ` (${Math.round((new Date(edit.endsAt).getTime() - new Date(edit.startsAt).getTime()) / 60_000)} min)`
                : ''}
              .
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm">Reason (optional)</label>
            <Input
              value={editForm.reason}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, reason: e.target.value }))
              }
              placeholder="Why this change?"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
