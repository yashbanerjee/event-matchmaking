'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { statusTone } from '@/lib/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { MeetingSchedulePicker } from '@/components/meeting-schedule-picker';

type OrgBrief = { id: string; name: string; type: string };

type MeetingRequest = {
  id: string;
  status: string;
  message: string | null;
  proposedStartsAt: string | null;
  proposedEndsAt: string | null;
  proposedByOrgId: string | null;
  fromOrgId: string;
  toOrgId: string;
  fromOrg: OrgBrief;
  toOrg: OrgBrief;
  place: { id: string; name: string; location: string | null } | null;
  meeting: { id: string; status: string } | null;
};

function formatPlace(place: MeetingRequest['place']) {
  if (!place) return null;
  return place.location ? `${place.name} · ${place.location}` : place.name;
}

function hasSchedule(req: MeetingRequest) {
  return Boolean(req.proposedStartsAt && req.proposedEndsAt && req.place);
}

export function MeetingRequestsPanel({
  myOrgIds,
  isAdmin = false,
}: {
  myOrgIds: string[];
  isAdmin?: boolean;
}) {
  const qc = useQueryClient();
  const [scheduleFor, setScheduleFor] = useState<MeetingRequest | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const requests = useQuery({
    queryKey: ['meeting-requests'],
    queryFn: () =>
      apiFetch<{ items: MeetingRequest[] }>('/meeting-requests', {
        token: getAccessToken(),
      }),
  });

  const accept = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/meeting-requests/${id}/accept`, {
        method: 'POST',
        token: getAccessToken(),
        body: '{}',
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['meeting-requests'] }),
  });

  const decline = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/meeting-requests/${id}/decline`, {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({ reason: 'Declined' }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['meeting-requests'] }),
  });

  const confirm = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/meeting-requests/${id}/confirm`, {
        method: 'POST',
        token: getAccessToken(),
        body: '{}',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['meeting-requests'] });
      void qc.invalidateQueries({ queryKey: ['portal-meetings'] });
      void qc.invalidateQueries({ queryKey: ['vendor-meetings'] });
    },
  });

  const propose = useMutation({
    mutationFn: (input: { startsAt: string; placeId: string }) => {
      if (!scheduleFor) throw new Error('Missing schedule');
      return apiFetch(`/meeting-requests/${scheduleFor.id}/propose`, {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({
          startsAt: input.startsAt,
          placeId: input.placeId,
        }),
      });
    },
    onSuccess: () => {
      setScheduleFor(null);
      setScheduleError(null);
      void qc.invalidateQueries({ queryKey: ['meeting-requests'] });
    },
    onError: (err) => setScheduleError((err as Error).message),
  });

  const items = requests.data?.items ?? [];
  const canAct = useMemo(() => new Set(myOrgIds), [myOrgIds]);

  const renderActions = (
    req: MeetingRequest,
    layout: 'mobile' | 'desktop',
  ) => {
    const isRecipient = isAdmin || canAct.has(req.toOrgId);
    const isParty =
      isAdmin || canAct.has(req.fromOrgId) || canAct.has(req.toOrgId);
    const proposer = req.proposedByOrgId;
    const isOpponentConfirmer =
      isAdmin ||
      (proposer
        ? (proposer === req.fromOrgId && canAct.has(req.toOrgId)) ||
          (proposer === req.toOrgId && canAct.has(req.fromOrgId))
        : canAct.has(req.toOrgId));
    const mobile = layout === 'mobile';
    const full = mobile ? 'flex-1' : undefined;
    const busy =
      (accept.isPending && accept.variables === req.id) ||
      (decline.isPending && decline.variables === req.id) ||
      (confirm.isPending && confirm.variables === req.id);

    const declineBtn = (
      <Button
        size="sm"
        variant="outline"
        className={full}
        loading={decline.isPending && decline.variables === req.id}
        disabled={busy}
        onClick={() => decline.mutate(req.id)}
      >
        Decline
      </Button>
    );

    if (req.status === 'PENDING' && isRecipient) {
      return (
        <>
          <Button
            size="sm"
            className={full}
            loading={accept.isPending && accept.variables === req.id}
            disabled={busy}
            onClick={() => accept.mutate(req.id)}
          >
            Accept
          </Button>
          {declineBtn}
        </>
      );
    }

    const awaitingConfirm =
      req.status === 'AWAITING_CONFIRMATION' ||
      (req.status === 'INTEREST_ACCEPTED' && hasSchedule(req));

    if (awaitingConfirm && isOpponentConfirmer) {
      return (
        <>
          <Button
            size="sm"
            className={full}
            loading={confirm.isPending && confirm.variables === req.id}
            disabled={busy}
            onClick={() => confirm.mutate(req.id)}
          >
            Accept
          </Button>
          {declineBtn}
        </>
      );
    }

    if (req.status === 'INTEREST_ACCEPTED' && !hasSchedule(req) && isParty) {
      return (
        <>
          <Button
            size="sm"
            className={full}
            onClick={() => {
              setScheduleError(null);
              setScheduleFor(req);
            }}
          >
            Pick time & place
          </Button>
          {isRecipient || isAdmin ? declineBtn : null}
        </>
      );
    }

    // Proposer (or either party) can still decline while waiting.
    if (
      ['PENDING', 'INTEREST_ACCEPTED', 'AWAITING_CONFIRMATION'].includes(
        req.status,
      ) &&
      isParty
    ) {
      return declineBtn;
    }

    return null;
  };

  return (
    <>
      <Card className="overflow-hidden">
        <div className="mb-4 min-w-0">
          <h2 className="h-display text-lg font-semibold tracking-tight">
            Meeting requests
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
            Accept or decline incoming requests. Confirming locks the meeting
            place and time.
          </p>
        </div>

        {requests.isLoading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : items.length === 0 ? (
          <EmptyState
            title="No requests yet"
            description="Send a request from recommendations with a free time and place, or wait for one from a counterpart."
          />
        ) : (
          <>
            <div className="grid gap-3 sm:hidden">
              {items.map((req) => {
                const counterpart = canAct.has(req.fromOrgId)
                  ? req.toOrg.name
                  : req.fromOrg.name;
                const direction = canAct.has(req.fromOrgId)
                  ? 'Outgoing'
                  : 'Incoming';
                const placeLabel = formatPlace(req.place);
                const actions = renderActions(req, 'mobile');

                return (
                  <div
                    key={req.id}
                    className="rounded-2xl border border-[var(--border)] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbfd_100%)] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                          {direction}
                        </p>
                        <p
                          className="mt-1 truncate font-semibold"
                          title={counterpart}
                        >
                          {counterpart}
                        </p>
                        {req.message ? (
                          <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">
                            {req.message}
                          </p>
                        ) : null}
                      </div>
                      <Badge
                        variant={statusTone(req.status)}
                        className="shrink-0"
                      >
                        {req.status.replaceAll('_', ' ')}
                      </Badge>
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-[var(--muted)]">
                      <p>
                        {req.proposedStartsAt
                          ? new Date(req.proposedStartsAt).toLocaleString()
                          : 'Time not proposed yet'}
                      </p>
                      {placeLabel ? (
                        <p className="flex items-start gap-1.5 font-medium text-[var(--foreground)]">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                          <span>Meeting place: {placeLabel}</span>
                        </p>
                      ) : (
                        <p>Meeting place not selected yet</p>
                      )}
                    </div>
                    {actions ? (
                      <div className="mt-3 flex flex-wrap gap-2">{actions}</div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="hidden sm:block">
              <Table>
                <THead>
                  <TR>
                    <TH>From</TH>
                    <TH>To</TH>
                    <TH>Status</TH>
                    <TH>When</TH>
                    <TH>Meeting place</TH>
                    <TH className="text-right">Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {items.map((req) => {
                    const placeLabel = formatPlace(req.place);

                    return (
                      <TR key={req.id}>
                        <TD className="font-medium">{req.fromOrg.name}</TD>
                        <TD>{req.toOrg.name}</TD>
                        <TD>
                          <Badge variant={statusTone(req.status)}>
                            {req.status.replaceAll('_', ' ')}
                          </Badge>
                        </TD>
                        <TD className="text-sm">
                          {req.proposedStartsAt
                            ? new Date(req.proposedStartsAt).toLocaleString()
                            : '—'}
                        </TD>
                        <TD className="text-sm">
                          {placeLabel ? (
                            <span className="inline-flex items-start gap-1.5">
                              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                              <span>{placeLabel}</span>
                            </span>
                          ) : (
                            '—'
                          )}
                        </TD>
                        <TD className="space-x-2 whitespace-nowrap text-right">
                          {renderActions(req, 'desktop')}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          </>
        )}
      </Card>

      <MeetingSchedulePicker
        open={Boolean(scheduleFor)}
        title="Pick time & meeting place"
        counterpartName={
          scheduleFor
            ? canAct.has(scheduleFor.fromOrgId)
              ? scheduleFor.toOrg.name
              : scheduleFor.fromOrg.name
            : undefined
        }
        requestId={scheduleFor?.id}
        fromOrgId={scheduleFor?.fromOrgId}
        toOrgId={scheduleFor?.toOrgId}
        submitting={propose.isPending}
        error={scheduleError}
        onClose={() => {
          if (propose.isPending) return;
          setScheduleFor(null);
          setScheduleError(null);
        }}
        onConfirm={({ startsAt, placeId }) => {
          propose.mutate({ startsAt, placeId });
        }}
      />
    </>
  );
}
