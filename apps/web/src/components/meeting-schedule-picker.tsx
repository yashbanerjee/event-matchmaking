'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import { EventDateChips } from '@/components/event-date-chips';
import { Modal } from '@/components/ui/modal';
import {
  normalizeEventSchedule,
  type EventSchedule,
} from '@/lib/event-schedule';
import { cn } from '@/lib/utils';

export type ScheduleSlot = { startsAt: string; endsAt: string };
export type SchedulePlace = {
  id: string;
  name: string;
  code: string;
  location: string | null;
  latitude?: number | null;
  longitude?: number | null;
  mapAddress?: string | null;
  assignedToInvestor?: boolean;
};

export function MeetingSchedulePicker({
  open,
  title,
  description,
  counterpartName,
  requestId,
  fromOrgId,
  toOrgId,
  submitting,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: string;
  counterpartName?: string;
  /** When proposing on an existing request, pass its id for slot filtering. */
  requestId?: string | null;
  /** Both org ids — required for mutual free-slot calculation on new requests. */
  fromOrgId?: string | null;
  toOrgId?: string | null;
  submitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (input: {
    startsAt: string;
    endsAt: string;
    placeId: string;
    place: SchedulePlace;
  }) => void;
}) {
  const [date, setDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<ScheduleSlot | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);

  const canQuerySlots = Boolean(requestId || (fromOrgId && toOrgId));

  const bookingWindow = useQuery({
    queryKey: ['meeting-booking-window'],
    enabled: open,
    queryFn: () =>
      apiFetch<EventSchedule>('/meeting-requests/booking-window', {
        token: getAccessToken(),
      }),
  });
  const schedule = normalizeEventSchedule(bookingWindow.data);

  useEffect(() => {
    if (!open || date) return;
    const today = new Date().toISOString().slice(0, 10);
    setDate(
      schedule.dates.includes(today) ? today : (schedule.dates[0] ?? ''),
    );
  }, [open, date, schedule.dates]);

  const slots = useQuery({
    queryKey: ['meeting-slots', requestId, fromOrgId, toOrgId, date],
    enabled: open && Boolean(date) && canQuerySlots,
    queryFn: () => {
      const params = new URLSearchParams({ date });
      if (requestId) params.set('requestId', requestId);
      if (fromOrgId) params.set('fromOrgId', fromOrgId);
      if (toOrgId) params.set('toOrgId', toOrgId);
      return apiFetch<{
        durationMinutes: number;
        slots: ScheduleSlot[];
        windowStart?: string | null;
        windowEnd?: string | null;
      }>(`/meeting-requests/slots?${params.toString()}`, {
        token: getAccessToken(),
      });
    },
  });

  const places = useQuery({
    queryKey: [
      'places-available',
      selectedSlot?.startsAt,
      selectedSlot?.endsAt,
      requestId,
      fromOrgId,
      toOrgId,
    ],
    enabled: open && Boolean(selectedSlot),
    queryFn: () => {
      const params = new URLSearchParams({
        startsAt: selectedSlot!.startsAt,
        endsAt: selectedSlot!.endsAt,
      });
      if (requestId) params.set('excludeRequestId', requestId);
      if (fromOrgId) params.set('fromOrgId', fromOrgId);
      if (toOrgId) params.set('toOrgId', toOrgId);
      return apiFetch<SchedulePlace[]>(
        `/places/available?${params.toString()}`,
        { token: getAccessToken() },
      );
    },
  });

  useEffect(() => {
    if (!places.data?.length || selectedPlaceId) return;
    const assigned = places.data.find((place) => place.assignedToInvestor);
    if (assigned) setSelectedPlaceId(assigned.id);
    else if (places.data.length === 1) setSelectedPlaceId(places.data[0]!.id);
  }, [places.data, selectedPlaceId]);

  const reset = () => {
    setDate('');
    setSelectedSlot(null);
    setSelectedPlaceId(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const selectedPlace =
    (places.data ?? []).find((place) => place.id === selectedPlaceId) ?? null;
  const freeTables = places.data ?? [];

  return (
    <Modal
      open={open}
      title={title}
      description={
        description ||
        (counterpartName
          ? `Pick a free time with ${counterpartName}, then choose a free table for that slot.`
          : 'Pick a free time, then choose a free table for that slot.')
      }
      onClose={close}
      wide
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <Button variant="outline" disabled={submitting} onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={!selectedSlot || !selectedPlace || submitting}
            loading={submitting}
            onClick={() => {
              if (!selectedSlot || !selectedPlace) return;
              onConfirm({
                startsAt: selectedSlot.startsAt,
                endsAt: selectedSlot.endsAt,
                placeId: selectedPlace.id,
                place: selectedPlace,
              });
            }}
          >
            Confirm time & table
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <p className="rounded-xl border border-[var(--border)] bg-[var(--card-elevated)] px-3 py-2 text-xs text-[var(--muted)]">
          Meetings can only be booked on event days, {schedule.activeStart}–
          {schedule.activeEnd}. Only mutual free times and free tables are
          listed.
        </p>

        <div>
          <label className="mb-1.5 block text-sm font-medium">Event date</label>
          <EventDateChips
            dates={schedule.dates}
            value={date}
            onChange={(next) => {
              setDate(next);
              setSelectedSlot(null);
              setSelectedPlaceId(null);
            }}
          />
        </div>

        {!canQuerySlots ? (
          <p className="text-sm text-rose-700">
            Missing organizations for mutual availability.
          </p>
        ) : null}

        {date && canQuerySlots ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Available times</p>
              <p className="text-xs text-[var(--muted)]">
                {slots.isLoading
                  ? 'Loading…'
                  : `${slots.data?.slots.length ?? 0} open`}
              </p>
            </div>
            {slots.isLoading ? (
              <p className="text-sm text-[var(--muted)]">
                Loading times when both parties are free…
              </p>
            ) : null}
            {slots.error ? (
              <p className="text-sm text-rose-700">
                {(slots.error as Error).message}
              </p>
            ) : null}
            {slots.data ? (
              <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                {slots.data.slots.map((slot) => {
                  const active = selectedSlot?.startsAt === slot.startsAt;
                  return (
                    <button
                      key={slot.startsAt}
                      type="button"
                      className={cn(
                        'rounded-xl border px-3 py-2.5 text-sm font-semibold tabular-nums transition',
                        active
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hover)]'
                          : 'border-[var(--border)] bg-[var(--card-elevated)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]',
                      )}
                      onClick={() => {
                        setSelectedSlot(slot);
                        setSelectedPlaceId(null);
                      }}
                    >
                      {new Date(slot.startsAt).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </button>
                  );
                })}
                {slots.data.slots.length === 0 ? (
                  <div className="col-span-full rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center">
                    <p className="text-sm font-medium">No free times</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Both parties need to be free with an open table. Try
                      another date.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
            {slots.data?.durationMinutes ||
            bookingWindow.data?.durationMinutes ? (
              <p className="text-xs text-[var(--muted)]">
                Each slot is{' '}
                {slots.data?.durationMinutes ??
                  bookingWindow.data?.durationMinutes}{' '}
                minutes.
              </p>
            ) : null}
          </div>
        ) : null}

        {selectedSlot ? (
          <div className="space-y-3 border-t border-[var(--border)] pt-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card-elevated)] px-3 py-2 text-sm">
              <p className="text-[var(--muted)]">Selected time</p>
              <p className="font-semibold">
                {new Date(selectedSlot.startsAt).toLocaleString()}
              </p>
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">
                Free tables for this date & time
              </p>
              <p className="text-xs text-[var(--muted)]">
                {places.isLoading
                  ? 'Loading…'
                  : `${freeTables.length} available`}
              </p>
            </div>

            {freeTables.some((place) => place.assignedToInvestor) ? (
              <p className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3 py-2 text-sm">
                Your reserved table for this slot is shown below.
              </p>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                Only tables that are free at the selected time are listed.
                Booked or held tables stay hidden.
              </p>
            )}

            {places.isLoading ? (
              <p className="text-sm text-[var(--muted)]">Loading free tables…</p>
            ) : places.error ? (
              <p className="text-sm text-rose-700">
                {(places.error as Error).message}
              </p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {freeTables.map((place) => {
                  const selected = selectedPlaceId === place.id;
                  return (
                    <button
                      key={place.id}
                      type="button"
                      className={cn(
                        'flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                        selected
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                          : 'border-[var(--border)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)]/40',
                      )}
                      onClick={() => setSelectedPlaceId(place.id)}
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">
                          {place.name}
                          {place.assignedToInvestor ? ' · Reserved for you' : ''}
                        </span>
                        <span className="mt-0.5 block text-sm text-[var(--muted)]">
                          {place.location ||
                            place.mapAddress ||
                            'Location TBA'}
                        </span>
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                        {place.code}
                      </span>
                    </button>
                  );
                })}
                {freeTables.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center">
                    <p className="text-sm font-medium">No free tables</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Pick another time — every table is booked or held for this
                      slot.
                    </p>
                  </div>
                ) : null}
              </div>
            )}

            {selectedPlace ? (
              <p className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)]/50 px-3 py-2 text-sm">
                Table:{' '}
                <span className="font-semibold">{selectedPlace.name}</span>
                {selectedPlace.location
                  ? ` · ${selectedPlace.location}`
                  : ''}
              </p>
            ) : null}
          </div>
        ) : date ? (
          <p className="text-sm text-[var(--muted)]">
            Select a time to see which tables are free.
          </p>
        ) : null}

        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      </div>
    </Modal>
  );
}
