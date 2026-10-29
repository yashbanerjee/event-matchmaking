'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { statusTone } from '@/lib/status';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

type MeetingRow = {
  id: string;
  status: string;
  startsAt: string;
  endsAt?: string | null;
  durationMinutes?: number | null;
  matchScore: number | null;
  venue?: string | null;
  location?: string | null;
  invitedByLabel?: string | null;
  companyOrgId: string;
  vendorOrgId: string;
  companyOrg: { id: string; name: string };
  vendorOrg: { id: string; name: string };
  place?: { id: string; name: string; location: string | null } | null;
};

type OrgOption = { id: string; name: string; code: string };

function toDateTimeLocal(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDateTimeLocal(value: string) {
  return new Date(value).toISOString();
}

function localDateKey(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localTimeKey(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const emptyFilters = {
  date: '',
  timeFrom: '',
  timeTo: '',
  companyOrgId: '',
  vendorOrgId: '',
  search: '',
};

export default function AdminMeetingsPage() {
  const qc = useQueryClient();
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
    queryFn: () =>
      apiFetch<{ items: MeetingRow[] }>('/meetings?pageSize=100', {
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

  const activeMeetings = useMemo(
    () =>
      (meetings.data?.items ?? []).filter((m) => m.status !== 'CANCELLED'),
    [meetings.data?.items],
  );

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
      filters.search.trim(),
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
          <Button
            onClick={() => {
              setCreating(true);
              setError(null);
            }}
          >
            Manual meeting
          </Button>
        }
      />

      <Card>
        <div className="mb-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">Schedule</h2>
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
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">Date</span>
              <Input
                type="date"
                value={filters.date}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, date: e.target.value }))
                }
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">Time from</span>
              <Input
                type="time"
                value={filters.timeFrom}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, timeFrom: e.target.value }))
                }
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">Time to</span>
              <Input
                type="time"
                value={filters.timeTo}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, timeTo: e.target.value }))
                }
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">Company</span>
              <select
                className="h-10 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm"
                value={filters.companyOrgId}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, companyOrgId: e.target.value }))
                }
              >
                <option value="">All companies</option>
                {companyFilterOptions.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">Vendor</span>
              <select
                className="h-10 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm"
                value={filters.vendorOrgId}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, vendorOrgId: e.target.value }))
                }
              >
                <option value="">All vendors</option>
                {vendorFilterOptions.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">Search</span>
              <Input
                placeholder="Status or name…"
                value={filters.search}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, search: e.target.value }))
                }
              />
            </label>
          </div>
          <p className="text-xs text-[var(--muted)]">
            Showing {rows.length} of {activeMeetings.length} meetings
          </p>
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

        {!meetings.isLoading && rows.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            {activeMeetings.length === 0
              ? 'No meetings yet. Create a manual meeting or wait for peer requests to be confirmed.'
              : 'No meetings match these filters.'}
          </p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Company</TH>
                <TH>Vendor</TH>
                <TH>Starts</TH>
                <TH>Location</TH>
                <TH>Invited by</TH>
                <TH>Status</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {rows.map((m) => {
                const location =
                  m.location ||
                  m.place?.name ||
                  m.venue ||
                  '—';
                const invitedBy = m.invitedByLabel || 'Admin created meeting';
                const isAdminCreated =
                  invitedBy === 'Admin created meeting';
                return (
                  <TR key={m.id}>
                    <TD className="font-medium">{m.companyOrg.name}</TD>
                    <TD>{m.vendorOrg.name}</TD>
                    <TD>{new Date(m.startsAt).toLocaleString()}</TD>
                    <TD>{location}</TD>
                    <TD>
                      {isAdminCreated ? (
                        <Badge variant="secondary">Admin created meeting</Badge>
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
                        disabled={['COMPLETED', 'NO_SHOW'].includes(m.status)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => confirmDelete(m)}
                        disabled={
                          deletingId === m.id ||
                          ['COMPLETED', 'NO_SHOW', 'IN_PROGRESS'].includes(
                            m.status,
                          )
                        }
                      >
                        {deletingId === m.id ? 'Deleting…' : 'Delete'}
                      </Button>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <Modal
        open={Boolean(edit)}
        onClose={() => setEdit(null)}
        title="Edit meeting"
      >
        <div className="space-y-3">
          <label className="block text-sm">
            Company
            <select
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm"
              value={editForm.companyOrgId}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, companyOrgId: e.target.value }))
              }
            >
              <option value="">Select company</option>
              {(companies.data?.items ?? []).map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Vendor
            <select
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm"
              value={editForm.vendorOrgId}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, vendorOrgId: e.target.value }))
              }
            >
              <option value="">Select vendor</option>
              {(vendors.data?.items ?? []).map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Starts
            <Input
              type="datetime-local"
              className="mt-1"
              value={editForm.startsAt}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, startsAt: e.target.value }))
              }
            />
          </label>
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
              disabled={
                saveMeeting.isPending ||
                !editForm.companyOrgId ||
                !editForm.vendorOrgId ||
                !editForm.startsAt
              }
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
            Company
            <select
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm"
              value={createForm.companyOrgId}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, companyOrgId: e.target.value }))
              }
            >
              <option value="">Select company</option>
              {(companies.data?.items ?? []).map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Vendor
            <select
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm"
              value={createForm.vendorOrgId}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, vendorOrgId: e.target.value }))
              }
            >
              <option value="">Select vendor</option>
              {(vendors.data?.items ?? []).map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Starts
            <Input
              type="datetime-local"
              className="mt-1"
              value={createForm.startsAt}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, startsAt: e.target.value }))
              }
            />
          </label>
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
              disabled={
                createMeeting.isPending ||
                !createForm.companyOrgId ||
                !createForm.vendorOrgId ||
                !createForm.startsAt
              }
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
