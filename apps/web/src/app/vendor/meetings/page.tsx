'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import {
  MeetingsCalendar,
  toCalendarEvents,
} from '@/components/meetings-calendar';
import { MeetingPlaceLink } from '@/components/meeting-place-link';
import {
  MeetingFeedbackModal,
  meetingHasEnded,
} from '@/components/meeting-feedback-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { badgeToneForStatus } from '@/lib/vendor-forms';

type Meeting = {
  id: string;
  status: string;
  startsAt: string;
  endsAt?: string | null;
  durationMinutes?: number | null;
  mode?: string | null;
  venue?: string | null;
  location?: string | null;
  timeZone?: string | null;
  hasSubmittedFeedback?: boolean;
  companyOrg: { name: string };
  vendorOrg: { name: string };
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

export default function VendorMeetingsPage() {
  const qc = useQueryClient();
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [search, setSearch] = useState('');
  const [feedbackFor, setFeedbackFor] = useState<Meeting | null>(null);

  const me = useQuery({
    queryKey: ['me'],
    queryFn: () =>
      apiFetch<{
        organizationIds: string[];
      }>('/auth/me', { token: getAccessToken() }),
  });

  const meetings = useQuery({
    queryKey: ['vendor-meetings'],
    queryFn: () =>
      apiFetch<{ items: Meeting[]; total: number }>('/meetings?pageSize=100', {
        token: getAccessToken(),
      }),
  });

  const requests = useQuery({
    queryKey: ['meeting-requests'],
    queryFn: () =>
      apiFetch<{ items: RequestRow[] }>('/meeting-requests', {
        token: getAccessToken(),
      }),
  });

  const confirm = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/meetings/${id}/confirm`, {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({}),
      }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ['vendor-meetings'] }),
  });

  const filtered = useMemo(() => {
    const items = meetings.data?.items ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.companyOrg.name.toLowerCase().includes(q) ||
        item.vendorOrg.name.toLowerCase().includes(q) ||
        item.status.toLowerCase().includes(q) ||
        (item.mode ?? '').toLowerCase().includes(q) ||
        (item.venue ?? '').toLowerCase().includes(q) ||
        (item.location ?? '').toLowerCase().includes(q),
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

  const orgId = me.data?.organizationIds[0] ?? '';

  return (
    <>
      <PageHeader
        eyebrow="Meetings"
        title="Your meetings"
        description="Confirm sessions. After a meeting ends, submit feedback and review the client."
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
            <Input
              className="max-w-xs"
              placeholder="Search client, guest, status…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        }
      />

      <Card className="overflow-hidden">
        {meetings.isLoading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : null}

        {viewMode === 'calendar' && !meetings.isLoading ? (
          calendarEvents.length === 0 ? (
            <EmptyState
              title="No meetings yet"
              description="When meetings are scheduled or a time is proposed, they appear on this calendar."
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

        {viewMode === 'list' && !meetings.isLoading && filtered.length === 0 ? (
          <EmptyState
            title="No meetings yet"
            description="When meetings are scheduled, they appear here with full details."
          />
        ) : null}

        {viewMode === 'list' && !meetings.isLoading && filtered.length > 0 ? (
          <Table>
            <THead>
              <TR>
                <TH>Client</TH>
                <TH>Starts</TH>
                <TH>Ends</TH>
                <TH>Duration</TH>
                <TH>Meeting place</TH>
                <TH>Status</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {filtered.map((item) => {
                const ended = meetingHasEnded(item);
                const submitted = Boolean(item.hasSubmittedFeedback);
                return (
                  <TR key={item.id}>
                    <TD className="font-medium">{item.companyOrg.name}</TD>
                    <TD>{new Date(item.startsAt).toLocaleString()}</TD>
                    <TD>
                      {item.endsAt
                        ? new Date(item.endsAt).toLocaleString()
                        : '—'}
                    </TD>
                    <TD>
                      {item.durationMinutes
                        ? `${item.durationMinutes} min`
                        : '—'}
                    </TD>
                    <TD className="min-w-[11rem]">
                      <MeetingPlaceLink
                        place={item.place}
                        fallback={item.location || item.venue}
                        compact
                      />
                    </TD>
                    <TD>
                      <Badge variant={badgeToneForStatus(item.status)}>
                        {item.status.replaceAll('_', ' ')}
                      </Badge>
                    </TD>
                    <TD className="space-x-2 text-right">
                      {item.status === 'AWAITING_CONFIRMATION' ? (
                        <Button
                          size="sm"
                          loading={
                            confirm.isPending && confirm.variables === item.id
                          }
                          onClick={() => confirm.mutate(item.id)}
                        >
                          Confirm
                        </Button>
                      ) : null}
                      {ended && orgId && !submitted ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setFeedbackFor(item)}
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
        ) : null}
      </Card>

      <MeetingFeedbackModal
        open={Boolean(feedbackFor)}
        meetingId={feedbackFor?.id ?? null}
        organizationId={orgId}
        counterpartName={feedbackFor?.companyOrg.name ?? 'counterpart'}
        onClose={() => setFeedbackFor(null)}
        onSubmitted={() =>
          void qc.invalidateQueries({ queryKey: ['vendor-meetings'] })
        }
      />
    </>
  );
}
