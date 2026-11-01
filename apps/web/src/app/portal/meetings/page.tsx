'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { statusTone } from '@/lib/status';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Pagination } from '@/components/ui/pagination';
import { PageHeader } from '@/components/page-header';
import { PortalShell } from '@/components/portal-shell';
import { EmptyState } from '@/components/empty-state';
import {
  MeetingsCalendar,
  toCalendarEvents,
} from '@/components/meetings-calendar';
import { MeetingPlaceLink } from '@/components/meeting-place-link';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import {
  MeetingFeedbackModal,
  meetingHasEnded,
  resolveFeedbackOrganizationId,
} from '@/components/meeting-feedback-modal';
import {
  canEndMeeting,
  canStartMeeting,
  formatMeetingDuration,
  meetingElapsedSeconds,
} from '@/lib/event-pulse';
import { fetchOnboarding } from '@/lib/portal-onboarding';

type Meeting = {
  id: string;
  status: string;
  startsAt: string;
  endsAt?: string | null;
  actualStartedAt?: string | null;
  actualEndedAt?: string | null;
  actualDurationMinutes?: number | null;
  hasSubmittedFeedback?: boolean;
  companyOrgId: string;
  vendorOrgId: string;
  companyOrg: { id?: string; name: string };
  vendorOrg: { id?: string; name: string };
  location?: string | null;
  place?: {
    name: string;
    location?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    mapAddress?: string | null;
  } | null;
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

const DEFAULT_PAGE_SIZE = 10;

function useNowTick(enabled: boolean, intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs]);
  return now;
}

export default function PortalMeetingsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [feedbackFor, setFeedbackFor] = useState<Meeting | null>(null);
  const [pendingStart, setPendingStart] = useState<Meeting | null>(null);
  const [blockerMeeting, setBlockerMeeting] = useState<Meeting | null>(null);
  const [actionError, setActionError] = useState('');

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
    refetchInterval: 15_000,
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
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  const liveMeeting = (meetings.data?.items ?? []).find((m) =>
    canEndMeeting(m.status),
  );
  const now = useNowTick(Boolean(liveMeeting || blockerMeeting));

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

  const startMeeting = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/meetings/${id}/start`, {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      setActionError('');
      setPendingStart(null);
      setBlockerMeeting(null);
      void qc.invalidateQueries({ queryKey: ['portal-meetings'] });
    },
    onError: (caught, meetingId) => {
      if (!(caught instanceof ApiError) || caught.status !== 409) {
        setActionError(
          caught instanceof Error ? caught.message : 'Could not start meeting.',
        );
        return;
      }
      const payload =
        caught.body &&
        typeof caught.body === 'object' &&
        'message' in caught.body
          ? (caught.body as { message?: unknown }).message
          : caught.body;
      const details =
        payload && typeof payload === 'object'
          ? (payload as {
              activeMeetingId?: string;
              activeCounterpart?: string;
              actualStartedAt?: string | null;
            })
          : null;
      const active =
        (meetings.data?.items ?? []).find(
          (m) => m.id === details?.activeMeetingId,
        ) ??
        (details?.activeMeetingId
          ? ({
              id: details.activeMeetingId,
              status: 'IN_PROGRESS',
              startsAt: new Date().toISOString(),
              actualStartedAt: details.actualStartedAt ?? null,
              companyOrgId: me.data?.organizationIds?.[0] ?? '',
              vendorOrgId: '',
              companyOrg: { name: 'Investor' },
              vendorOrg: {
                name: details.activeCounterpart ?? 'previous partner',
              },
            } satisfies Meeting)
          : null);
      const next =
        pendingStart ??
        (meetings.data?.items ?? []).find((m) => m.id === meetingId) ??
        null;
      if (active && next) {
        setPendingStart(next);
        setBlockerMeeting(active);
        setActionError('');
        return;
      }
      setActionError(caught.message);
    },
  });

  const endMeeting = useMutation({
    mutationFn: async (meeting: Meeting) => {
      const result = await apiFetch<Meeting>(`/meetings/${meeting.id}/complete`, {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({}),
      });
      return { meeting, result };
    },
    onSuccess: async ({ meeting, result }) => {
      setActionError('');
      await qc.invalidateQueries({ queryKey: ['portal-meetings'] });
      if (pendingStart && blockerMeeting?.id === meeting.id) {
        const next = pendingStart;
        setBlockerMeeting(null);
        startMeeting.mutate(next.id);
        return;
      }
      setBlockerMeeting(null);
      if (!meeting.hasSubmittedFeedback) {
        setFeedbackFor({
          ...meeting,
          status: 'COMPLETED',
          actualStartedAt: result.actualStartedAt ?? meeting.actualStartedAt,
          actualEndedAt: result.actualEndedAt ?? meeting.actualEndedAt,
          actualDurationMinutes:
            result.actualDurationMinutes ?? meeting.actualDurationMinutes,
        });
      }
    },
    onError: (caught) =>
      setActionError(
        caught instanceof Error ? caught.message : 'Could not stop meeting.',
      ),
  });

  function requestStart(meeting: Meeting) {
    setActionError('');
    const live = (meetings.data?.items ?? []).find(
      (m) => canEndMeeting(m.status) && m.id !== meeting.id,
    );
    if (live) {
      setPendingStart(meeting);
      setBlockerMeeting(live);
      return;
    }
    setPendingStart(null);
    setBlockerMeeting(null);
    startMeeting.mutate(meeting.id);
  }

  if (!ready) return null;

  const orgId = me.data?.organizationIds[0] ?? '';
  const liveElapsed = liveMeeting
    ? formatMeetingDuration(
        meetingElapsedSeconds(liveMeeting.actualStartedAt, null, now),
      )
    : null;
  const blockerElapsed = blockerMeeting
    ? formatMeetingDuration(
        meetingElapsedSeconds(blockerMeeting.actualStartedAt, null, now),
      )
    : null;

  return (
    <PortalShell
      email={me.data?.email}
      pendingForms={onboarding.data?.pendingCount}
    >
      <PageHeader
        eyebrow="Your workspace"
        title="Meetings"
        description="Start and stop each meeting on the floor. We record the real time you spend so the event pulse stays accurate."
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
        }
      />

      {liveMeeting ? (
        <Card className="mb-5 border-[var(--accent)] bg-[var(--highlight-soft)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
                Meeting in progress
              </p>
              <p className="mt-1 text-lg font-semibold tracking-tight">
                {liveMeeting.vendorOrg.name}
              </p>
              <p className="text-sm text-[var(--muted)]">
                Recording time
                {liveElapsed ? ` · ${liveElapsed}` : ''}. Stop when you wrap,
                then leave feedback.
              </p>
            </div>
            <Button
              onClick={() => endMeeting.mutate(liveMeeting)}
              loading={
                endMeeting.isPending &&
                endMeeting.variables?.id === liveMeeting.id
              }
            >
              Stop meeting
            </Button>
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="h-display text-lg font-semibold tracking-tight">
            {viewMode === 'calendar' ? 'Event days' : 'Schedule'}
          </h2>
          <Input
            className="w-full max-w-xs shrink-0"
            placeholder="Search investor, innovator, status…"
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
        {actionError ? <p className="text-rose-700">{actionError}</p> : null}

        {viewMode === 'calendar' && !meetings.isLoading ? (
          <MeetingsCalendar
            events={calendarEvents}
            suppressDetails={Boolean(feedbackFor)}
            renderEventActions={(event) => {
              if (event.kind !== 'meeting') return null;
              const meetingId = event.id.replace(/^meeting:/, '');
              const meeting = filtered.find((row) => row.id === meetingId);
              if (!meeting) return null;
              const ended = meetingHasEnded(meeting);
              const submitted = Boolean(meeting.hasSubmittedFeedback);
              const feedbackOrgId = resolveFeedbackOrganizationId(
                meeting,
                me.data?.organizationIds,
              );
              return (
                <>
                  {canStartMeeting(meeting.status) ? (
                    <Button
                      size="sm"
                      loading={
                        startMeeting.isPending &&
                        startMeeting.variables === meeting.id
                      }
                      onClick={() => requestStart(meeting)}
                    >
                      Start meeting
                    </Button>
                  ) : null}
                  {canEndMeeting(meeting.status) ? (
                    <Button
                      size="sm"
                      loading={
                        endMeeting.isPending &&
                        endMeeting.variables?.id === meeting.id
                      }
                      onClick={() => endMeeting.mutate(meeting)}
                    >
                      Stop meeting
                    </Button>
                  ) : null}
                  {ended &&
                  feedbackOrgId &&
                  !submitted &&
                  !canStartMeeting(meeting.status) &&
                  !canEndMeeting(meeting.status) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setFeedbackFor(meeting)}
                    >
                      Feedback & review
                    </Button>
                  ) : null}
                  {ended && submitted ? (
                    <Badge variant="success">Feedback sent</Badge>
                  ) : null}
                </>
              );
            }}
          />
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
                  <TH>Innovator</TH>
                  <TH>Starts</TH>
                  <TH>Recorded time</TH>
                  <TH>Meeting place</TH>
                  <TH>Status</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {pageItems.map((m) => {
                  const ended = meetingHasEnded(m);
                  const submitted = Boolean(m.hasSubmittedFeedback);
                  const recorded =
                    m.actualDurationMinutes != null
                      ? `${m.actualDurationMinutes} min`
                      : canEndMeeting(m.status) && m.actualStartedAt
                        ? formatMeetingDuration(
                            meetingElapsedSeconds(m.actualStartedAt, null, now),
                          )
                        : '—';
                  return (
                    <TR key={m.id} className="hover:bg-slate-50/80">
                      <TD className="font-medium">{m.vendorOrg.name}</TD>
                      <TD>{new Date(m.startsAt).toLocaleString()}</TD>
                      <TD className="tabular-nums text-sm">{recorded}</TD>
                      <TD className="min-w-[11rem]">
                        <MeetingPlaceLink
                          place={m.place}
                          fallback={m.location}
                          compact
                        />
                      </TD>
                      <TD>
                        <Badge variant={statusTone(m.status)}>
                          {m.status.replaceAll('_', ' ')}
                        </Badge>
                      </TD>
                      <TD className="space-x-2 text-right">
                        {m.status === 'AWAITING_CONFIRMATION' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            loading={
                              confirm.isPending && confirm.variables === m.id
                            }
                            onClick={() => confirm.mutate(m.id)}
                          >
                            Confirm
                          </Button>
                        ) : null}
                        {canStartMeeting(m.status) ? (
                          <Button
                            size="sm"
                            loading={
                              startMeeting.isPending &&
                              startMeeting.variables === m.id
                            }
                            onClick={() => requestStart(m)}
                          >
                            Start meeting
                          </Button>
                        ) : null}
                        {canEndMeeting(m.status) ? (
                          <Button
                            size="sm"
                            loading={
                              endMeeting.isPending &&
                              endMeeting.variables?.id === m.id
                            }
                            onClick={() => endMeeting.mutate(m)}
                          >
                            Stop meeting
                          </Button>
                        ) : null}
                        {ended &&
                        orgId &&
                        !submitted &&
                        !canStartMeeting(m.status) &&
                        !canEndMeeting(m.status) ? (
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
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        ) : null}
      </Card>

      <Modal
        open={Boolean(blockerMeeting)}
        title="Stop your previous meeting"
        description="You already have a meeting in progress. Stop it first, then we can start the next one."
        onClose={() => {
          if (endMeeting.isPending || startMeeting.isPending) return;
          setBlockerMeeting(null);
          setPendingStart(null);
        }}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              disabled={endMeeting.isPending || startMeeting.isPending}
              onClick={() => {
                setBlockerMeeting(null);
                setPendingStart(null);
              }}
            >
              Cancel
            </Button>
            <Button
              loading={
                endMeeting.isPending &&
                endMeeting.variables?.id === blockerMeeting?.id
              }
              onClick={() => {
                if (!blockerMeeting) return;
                endMeeting.mutate(blockerMeeting);
              }}
            >
              {pendingStart
                ? 'Stop previous & start next'
                : 'Stop previous meeting'}
            </Button>
          </div>
        }
      >
        {blockerMeeting ? (
          <div className="space-y-3 text-sm">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-elevated)] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                In progress now
              </p>
              <p className="mt-1 text-base font-semibold">
                {blockerMeeting.vendorOrg.name}
              </p>
              <p className="mt-1 text-[var(--muted)]">
                Elapsed {blockerElapsed ?? '0:00'}
                {blockerMeeting.actualStartedAt
                  ? ` · started ${new Date(blockerMeeting.actualStartedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : ''}
              </p>
            </div>
            {pendingStart ? (
              <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                  Waiting to start
                </p>
                <p className="mt-1 font-medium">{pendingStart.vendorOrg.name}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <MeetingFeedbackModal
        open={Boolean(feedbackFor)}
        meetingId={feedbackFor?.id ?? null}
        organizationId={
          feedbackFor
            ? resolveFeedbackOrganizationId(
                feedbackFor,
                me.data?.organizationIds,
              )
            : orgId
        }
        counterpartName={feedbackFor?.vendorOrg.name ?? 'counterpart'}
        onClose={() => setFeedbackFor(null)}
        onSubmitted={async () => {
          await Promise.all([
            qc.invalidateQueries({ queryKey: ['portal-meetings'] }),
            qc.invalidateQueries({ queryKey: ['feedback'] }),
          ]);
        }}
      />
    </PortalShell>
  );
}
