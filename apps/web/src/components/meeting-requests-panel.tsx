'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { statusTone } from '@/lib/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/empty-state';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

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

type Slot = { startsAt: string; endsAt: string };
type Place = {
  id: string;
  name: string;
  code: string;
  location: string | null;
};

export function MeetingRequestsPanel({
  myOrgIds,
}: {
  myOrgIds: string[];
}) {
  const qc = useQueryClient();
  const [scheduleFor, setScheduleFor] = useState<MeetingRequest | null>(null);
  const [date, setDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [step, setStep] = useState<'slot' | 'place'>('slot');

  const requests = useQuery({
    queryKey: ['meeting-requests'],
    queryFn: () =>
      apiFetch<{ items: MeetingRequest[] }>('/meeting-requests', {
        token: getAccessToken(),
      }),
  });

  const slots = useQuery({
    queryKey: ['meeting-slots', scheduleFor?.id, date],
    enabled: Boolean(scheduleFor && date && step === 'slot'),
    queryFn: () =>
      apiFetch<{ durationMinutes: number; slots: Slot[] }>(
        `/meeting-requests/slots?date=${date}&requestId=${scheduleFor!.id}`,
        { token: getAccessToken() },
      ),
  });

  const places = useQuery({
    queryKey: ['places-available', selectedSlot?.startsAt],
    enabled: Boolean(selectedSlot && step === 'place'),
    queryFn: () =>
      apiFetch<Place[]>(
        `/places/available?startsAt=${encodeURIComponent(selectedSlot!.startsAt)}&endsAt=${encodeURIComponent(selectedSlot!.endsAt)}`,
        { token: getAccessToken() },
      ),
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
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['meeting-requests'] }),
  });

  const propose = useMutation({
    mutationFn: (placeId: string) => {
      if (!scheduleFor || !selectedSlot) throw new Error('Missing schedule');
      return apiFetch(`/meeting-requests/${scheduleFor.id}/propose`, {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({
          startsAt: selectedSlot.startsAt,
          placeId,
        }),
      });
    },
    onSuccess: () => {
      setScheduleFor(null);
      setSelectedSlot(null);
      setDate('');
      setStep('slot');
      void qc.invalidateQueries({ queryKey: ['meeting-requests'] });
    },
  });

  const items = requests.data?.items ?? [];

  const openSchedule = (req: MeetingRequest) => {
    setScheduleFor(req);
    setDate('');
    setSelectedSlot(null);
    setStep('slot');
  };

  const canAct = useMemo(
    () => new Set(myOrgIds),
    [myOrgIds],
  );

  return (
    <>
      <Card>
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Meeting requests</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Accept interest, propose a time and place, then confirm the final
            schedule.
          </p>
        </div>

        {requests.isLoading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : items.length === 0 ? (
          <EmptyState
            title="No requests yet"
            description="Send a request from recommendations, or wait for one from a counterpart."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>From</TH>
                <TH>To</TH>
                <TH>Status</TH>
                <TH>Proposed</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {items.map((req) => {
                const isRecipient = canAct.has(req.toOrgId);
                const isParty =
                  canAct.has(req.fromOrgId) || canAct.has(req.toOrgId);
                const proposer = req.proposedByOrgId;
                const isOpponentConfirmer =
                  proposer &&
                  ((proposer === req.fromOrgId && canAct.has(req.toOrgId)) ||
                    (proposer === req.toOrgId && canAct.has(req.fromOrgId)));

                return (
                  <TR key={req.id}>
                    <TD className="font-medium">{req.fromOrg.name}</TD>
                    <TD>{req.toOrg.name}</TD>
                    <TD>
                      <Badge variant={statusTone(req.status)}>
                        {req.status}
                      </Badge>
                    </TD>
                    <TD className="text-sm">
                      {req.proposedStartsAt
                        ? `${new Date(req.proposedStartsAt).toLocaleString()}${
                            req.place ? ` · ${req.place.name}` : ''
                          }`
                        : '—'}
                    </TD>
                    <TD className="space-x-2 whitespace-nowrap text-right">
                      {req.status === 'PENDING' && isRecipient ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => accept.mutate(req.id)}
                          >
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => decline.mutate(req.id)}
                          >
                            Decline
                          </Button>
                        </>
                      ) : null}
                      {req.status === 'INTEREST_ACCEPTED' && isParty ? (
                        <Button size="sm" onClick={() => openSchedule(req)}>
                          Pick time
                        </Button>
                      ) : null}
                      {req.status === 'AWAITING_CONFIRMATION' &&
                      isOpponentConfirmer ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => confirm.mutate(req.id)}
                          >
                            Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => decline.mutate(req.id)}
                          >
                            Decline
                          </Button>
                        </>
                      ) : null}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <Modal
        open={Boolean(scheduleFor)}
        title={step === 'slot' ? 'Select date & time' : 'Select place'}
        description={
          step === 'slot'
            ? `Slots use the admin meeting duration (${slots.data?.durationMinutes ?? '…'} min).`
            : 'Only places free at this time are listed.'
        }
        onClose={() => {
          setScheduleFor(null);
          setStep('slot');
          setSelectedSlot(null);
        }}
        wide
        footer={
          step === 'place' ? (
            <Button variant="outline" onClick={() => setStep('slot')}>
              Back to slots
            </Button>
          ) : null
        }
      >
        {step === 'slot' ? (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Date</label>
              <Input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setSelectedSlot(null);
                }}
              />
            </div>
            {date && slots.isLoading ? (
              <p className="text-sm text-[var(--muted)]">Loading slots…</p>
            ) : null}
            {date && slots.data ? (
              <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                {slots.data.slots.map((slot) => (
                  <button
                    key={slot.startsAt}
                    type="button"
                    className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
                    onClick={() => {
                      setSelectedSlot(slot);
                      setStep('place');
                    }}
                  >
                    {new Date(slot.startsAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </button>
                ))}
                {slots.data.slots.length === 0 ? (
                  <p className="col-span-full text-sm text-[var(--muted)]">
                    No free slots on this day.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[var(--muted)]">
              Selected:{' '}
              {selectedSlot
                ? new Date(selectedSlot.startsAt).toLocaleString()
                : '—'}
            </p>
            {places.isLoading ? (
              <p className="text-sm text-[var(--muted)]">Loading places…</p>
            ) : (
              <div className="space-y-2">
                {(places.data ?? []).map((place) => (
                  <button
                    key={place.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] px-4 py-3 text-left hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
                    disabled={propose.isPending}
                    onClick={() => propose.mutate(place.id)}
                  >
                    <span>
                      <span className="font-medium">{place.name}</span>
                      {place.location ? (
                        <span className="ml-2 text-sm text-[var(--muted)]">
                          {place.location}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-xs text-[var(--muted)]">
                      {place.code}
                    </span>
                  </button>
                ))}
                {(places.data ?? []).length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">
                    No free places for this slot. Pick another time.
                  </p>
                ) : null}
              </div>
            )}
            {propose.error ? (
              <p className="text-sm text-rose-700">
                {(propose.error as Error).message}
              </p>
            ) : null}
          </div>
        )}
      </Modal>
    </>
  );
}
