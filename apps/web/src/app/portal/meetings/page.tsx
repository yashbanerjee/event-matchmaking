'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { statusTone } from '@/lib/status';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { PageHeader } from '@/components/page-header';
import { PortalShell } from '@/components/portal-shell';
import { EmptyState } from '@/components/empty-state';
import {
  MeetingsCalendar,
  toCalendarEvents,
} from '@/components/meetings-calendar';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import {
  MeetingFeedbackModal,
  meetingHasEnded,
} from '@/components/meeting-feedback-modal';
import { fetchOnboarding } from '@/lib/portal-onboarding';

type Meeting = {
  id: string;
  status: string;
  startsAt: string;
  endsAt?: string | null;
  hasSubmittedFeedback?: boolean;
  companyOrg: { name: string };
  vendorOrg: { name: string };
  location?: string | null;
  place?: { name: string } | null;
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

const PAGE_SIZE = 8;

export default function PortalMeetingsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [feedbackFor, setFeedbackFor] = useState<Meeting | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [router]);

  const me = useQuery({
    queryKey: ['me'],
    enabled: ready,
    queryFn: () =>
      apiFetch<{
        id: string;
        email: string;
        organizationIds: string[];
        roles: string[];
      }>('/auth/me', { token: getAccessToken() }),
  });

  const onboarding = useQuery({
    queryKey: ['portal-onboarding'],
    enabled: ready,
    queryFn: () => fetchOnboarding(),
  });

  const meetings = useQuery({
    queryKey: ['portal-meetings'],
    enabled: ready,
    queryFn: () =>
      apiFetch<{ items: Meeting[] }>('/meetings?pageSize=100', {
        token: getAccessToken(),
      }),
  });

  const requests = useQuery({
    queryKey: ['meeting-requests'],
    enabled: ready,
    queryFn: () =>
      apiFetch<{ items: RequestRow[] }>('/meeting-requests', {
        token: getAccessToken(),
      }),
  });

  const filtered = useMemo(() => {
    const items = meetings.data?.items ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (m) =>
        m.companyOrg.name.toLowerCase().includes(q) ||
        m.vendorOrg.name.toLowerCase().includes(q) ||
        m.status.toLowerCase().includes(q),
    );
  }, [meetings.data?.items, search]);

  const calendarEvents = useMemo(
    () =>
      toCalendarEvents({
        meetings: filtered,
        requests: requests.data?.items,
      }),
    [filtered, requests.data?.items],
  );

  const total = filtered.length;
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const confirm = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/meetings/${id}/confirm`, {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({}),
      }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ['portal-meetings'] }),
  });

  if (!ready) return null;

  const orgId = me.data?.organizationIds[0] ?? '';

  return (
    <PortalShell
      email={me.data?.email}
      pendingForms={onboarding.data?.pendingCount}
    >
      <PageHeader
        eyebrow="Your workspace"
        title="Meetings"
        description="Confirm sessions. After a meeting ends, submit feedback and review the guest."
        actions={
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
              Calendar
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
        }
      />

      <Card className="overflow-hidden">
        <div className="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="h-display text-lg font-semibold tracking-tight">
            {viewMode === 'calendar' ? 'Calendar' : 'Schedule'}
          </h2>
          <Input
            className="w-full max-w-xs shrink-0"
            placeholder="Search client, guest, status…"
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            value={search}
          />
        </div>

        {meetings.isLoading && <p className="text-[var(--muted)]">Loading…</p>}
        {meetings.error && (
          <p className="text-rose-700">{(meetings.error as Error).message}</p>
        )}

        {viewMode === 'calendar' && !meetings.isLoading ? (
          calendarEvents.length === 0 ? (
            <EmptyState
              title="No meetings yet"
              description="Scheduled peer meetings and proposed request times appear here."
            />
          ) : (
            <MeetingsCalendar
              events={calendarEvents}
              onSelectEvent={(event) => {
                if (event.kind !== 'meeting') return;
                const meetingId = event.id.replace(/^meeting:/, '');
                const meeting = filtered.find((row) => row.id === meetingId);
                if (!meeting) return;
                if (
                  meetingHasEnded(meeting) &&
                  orgId &&
                  !meeting.hasSubmittedFeedback
                ) {
                  setFeedbackFor(meeting);
                }
              }}
            />
          )
        ) : null}

        {viewMode === 'list' && !meetings.isLoading && pageItems.length === 0 ? (
          <EmptyState
            title="No meetings yet"
            description="Scheduled peer meetings and published schedules appear here."
          />
        ) : null}

        {viewMode === 'list' && !meetings.isLoading && pageItems.length > 0 ? (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Guest</TH>
                  <TH>Starts</TH>
                  <TH>Location</TH>
                  <TH>Status</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {pageItems.map((m) => {
                  const ended = meetingHasEnded(m);
                  const submitted = Boolean(m.hasSubmittedFeedback);
                  return (
                    <TR key={m.id} className="hover:bg-slate-50/80">
                      <TD className="font-medium">{m.vendorOrg.name}</TD>
                      <TD>{new Date(m.startsAt).toLocaleString()}</TD>
                      <TD>{m.location || m.place?.name || '—'}</TD>
                      <TD>
                        <Badge variant={statusTone(m.status)}>
                          {m.status.replaceAll('_', ' ')}
                        </Badge>
                      </TD>
                      <TD className="space-x-2 text-right">
                        {m.status === 'AWAITING_CONFIRMATION' ? (
                          <Button
                            size="sm"
                            onClick={() => confirm.mutate(m.id)}
                          >
                            Confirm
                          </Button>
                        ) : null}
                        {ended && orgId && !submitted ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setFeedbackFor(m)}
                          >
                            Feedback & review
                          </Button>
                        ) : null}
                        {ended && submitted ? (
                          <Badge variant="success">Feedback sent</Badge>
                        ) : null}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPageChange={setPage}
            />
          </>
        ) : null}
      </Card>

      <MeetingFeedbackModal
        open={Boolean(feedbackFor)}
        meetingId={feedbackFor?.id ?? null}
        organizationId={orgId}
        counterpartName={feedbackFor?.vendorOrg.name ?? 'counterpart'}
        onClose={() => setFeedbackFor(null)}
        onSubmitted={() =>
          void qc.invalidateQueries({ queryKey: ['portal-meetings'] })
        }
      />
    </PortalShell>
  );
}
