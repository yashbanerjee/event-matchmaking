'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

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

type SettingsResponse = {
  integration: Array<{
    id: string;
    fields: Array<{ key: string; value: unknown }>;
  }>;
};

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

export default function MatchmakingPage() {
  const [date, setDate] = useState('2026-11-01');
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<MeetingRow | null>(null);
  const [editForm, setEditForm] = useState({
    companyOrgId: '',
    vendorOrgId: '',
    startsAt: '',
    reason: '',
  });

  const settings = useQuery({
    queryKey: ['settings-for-matchmaking'],
    queryFn: () =>
      apiFetch<SettingsResponse>('/settings', { token: getAccessToken() }),
  });

  useEffect(() => {
    const ops = settings.data?.integration.find((g) => g.id === 'ops');
    const field = ops?.fields.find((f) => f.key === 'ops.meetingDurationMinutes');
    const n = Number(field?.value);
    if (Number.isFinite(n) && n >= 5) {
      setDurationMinutes(n);
    }
  }, [settings.data]);

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

  const start = useMutation({
    mutationFn: () =>
      apiFetch<Run>('/matchmaking/runs', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({
          scheduleDate: date,
          startTime: '09:00',
          endTime: '17:00',
          timeZone: 'UTC',
          slotCount: 6,
          meetingDurationMinutes: durationMinutes,
          bufferMinutes: 5,
          maxMeetingsPerParticipant: 6,
          mode: 'VIRTUAL',
        }),
      }),
    onSuccess: (data) => {
      setRun(data);
      setError(null);
    },
    onError: (err) => setError((err as Error).message),
  });

  const publish = useMutation({
    mutationFn: (scheduleId: string) =>
      apiFetch(`/matchmaking/schedules/${scheduleId}/publish`, {
        method: 'POST',
        token: getAccessToken(),
      }),
    onSuccess: async () => {
      if (!run) return;
      const refreshed = await apiFetch<Run>(`/matchmaking/runs/${run.id}`, {
        token: getAccessToken(),
      });
      setRun(refreshed);
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
      const refreshed = await apiFetch<Run>(`/matchmaking/runs/${run.id}`, {
        token: getAccessToken(),
      });
      setRun(refreshed);
      setError(null);
    },
    onError: (err) => setError((err as Error).message),
  });

  const schedule = run?.scheduleVersions[0];
  const meetings = schedule?.meetings ?? [];

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
          publication; dashboards never re-run matching.
        </p>
      </div>

      <Card className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-sm">Schedule date</label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm">Meeting duration (min)</label>
          <Input
            type="number"
            min={5}
            max={240}
            className="w-28"
            value={durationMinutes}
            onChange={(e) =>
              setDurationMinutes(Math.max(5, Number(e.target.value) || 15))
            }
          />
          <p className="mt-1 text-xs text-[var(--muted)]">
            Default from Settings → Ops
          </p>
        </div>
        <Button onClick={() => start.mutate()} disabled={start.isPending}>
          {start.isPending ? 'Running…' : 'Generate schedule'}
        </Button>
        {schedule && schedule.status !== 'PUBLISHED' && (
          <Button
            variant="outline"
            onClick={() => publish.mutate(schedule.id)}
            disabled={publish.isPending || meetings.length === 0}
          >
            Publish schedule
          </Button>
        )}
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
            <h2 className="mb-3 font-medium">Proposed meetings</h2>
            {meetings.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                No meetings yet. Verify companies and vendors are matching-eligible,
                then generate again.
              </p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Company</TH>
                    <TH>Vendor</TH>
                    <TH>Score</TH>
                    <TH>Starts</TH>
                    <TH>Explanation</TH>
                    <TH className="text-right">Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {meetings.map((m) => (
                    <TR key={m.id}>
                      <TD className="font-medium">{m.companyOrg.name}</TD>
                      <TD>{m.vendorOrg.name}</TD>
                      <TD>{m.matchScore?.toFixed(1) ?? '—'}</TD>
                      <TD className="whitespace-nowrap text-xs">
                        {new Date(m.startsAt).toLocaleString()}
                      </TD>
                      <TD className="max-w-md text-xs text-[var(--muted)]">
                        {m.match?.explanation}
                      </TD>
                      <TD className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(m)}
                        >
                          Edit
                        </Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
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
              End time is calculated from meeting duration (
              {edit?.endsAt
                ? `${Math.round((new Date(edit.endsAt).getTime() - new Date(edit.startsAt).getTime()) / 60_000)} min`
                : `${durationMinutes} min`}
              ).
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
