'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';

export type ScheduleSlot = { startsAt: string; endsAt: string };
export type SchedulePlace = {
  id: string;
  name: string;
  code: string;
  location: string | null;
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
  const [step, setStep] = useState<'slot' | 'place'>('slot');

  const today = new Date().toISOString().slice(0, 10);
  const canQuerySlots = Boolean(requestId || (fromOrgId && toOrgId));

  const bookingWindow = useQuery({
    queryKey: ['meeting-booking-window'],
    enabled: open,
    queryFn: () =>
      apiFetch<{
        start: string | null;
        end: string | null;
        durationMinutes: number;
      }>('/meeting-requests/booking-window', { token: getAccessToken() }),
  });

  const minDate =
    bookingWindow.data?.start && bookingWindow.data.start > today
      ? bookingWindow.data.start
      : today;
  const maxDate = bookingWindow.data?.end ?? undefined;

  const slots = useQuery({
    queryKey: ['meeting-slots', requestId, fromOrgId, toOrgId, date],
    enabled: open && Boolean(date) && step === 'slot' && canQuerySlots,
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
    ],
    enabled: open && Boolean(selectedSlot) && step === 'place',
    queryFn: () => {
      const params = new URLSearchParams({
        startsAt: selectedSlot!.startsAt,
        endsAt: selectedSlot!.endsAt,
      });
      if (requestId) params.set('excludeRequestId', requestId);
      return apiFetch<SchedulePlace[]>(
        `/places/available?${params.toString()}`,
        { token: getAccessToken() },
      );
    },
  });

  const reset = () => {
    setDate('');
    setSelectedSlot(null);
    setSelectedPlaceId(null);
    setStep('slot');
  };

  const close = () => {
    reset();
    onClose();
  };

  const selectedPlace =
    (places.data ?? []).find((place) => place.id === selectedPlaceId) ?? null;

  return (
    <Modal
      open={open}
      title={title}
      description={
        description ||
        (counterpartName
          ? `Only times when both you and ${counterpartName} are free are shown, then only free meeting places.`
          : 'Only mutual free times and free meeting places are shown.')
      }
      onClose={close}
      wide
      footer={
        step === 'place' ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setStep('slot');
                setSelectedPlaceId(null);
              }}
            >
              Back to times
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
              Confirm place
            </Button>
          </div>
        ) : null
      }
    >
      {step === 'slot' ? (
        <div className="space-y-4">
          {bookingWindow.data?.start || bookingWindow.data?.end ? (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--card-elevated)] px-3 py-2 text-xs text-[var(--muted)]">
              Booking period
              {bookingWindow.data.start
                ? ` from ${bookingWindow.data.start}`
                : ''}
              {bookingWindow.data.end ? ` through ${bookingWindow.data.end}` : ''}
              .
            </p>
          ) : null}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Date</label>
            <Input
              type="date"
              value={date}
              min={minDate}
              max={maxDate}
              onChange={(e) => {
                setDate(e.target.value);
                setSelectedSlot(null);
              }}
            />
          </div>
          {!canQuerySlots ? (
            <p className="text-sm text-rose-700">
              Missing organizations for mutual availability.
            </p>
          ) : null}
          {date && canQuerySlots && slots.isLoading ? (
            <p className="text-sm text-[var(--muted)]">
              Loading times when both parties are free…
            </p>
          ) : null}
          {date && slots.error ? (
            <p className="text-sm text-rose-700">
              {(slots.error as Error).message}
            </p>
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
                    setSelectedPlaceId(null);
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
                  No mutual free slots on this day (both parties free with a
                  free place).
                </p>
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
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card-elevated)] px-3 py-2 text-sm">
            <p className="text-[var(--muted)]">Selected time</p>
            <p className="font-semibold">
              {selectedSlot
                ? new Date(selectedSlot.startsAt).toLocaleString()
                : '—'}
            </p>
          </div>
          <p className="text-sm text-[var(--muted)]">
            Places already booked or held by another open request are hidden.
            Declined requests free the place again.
          </p>
          {places.isLoading ? (
            <p className="text-sm text-[var(--muted)]">Loading free places…</p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {(places.data ?? []).map((place) => {
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
                      <span className="block font-semibold">{place.name}</span>
                      <span className="mt-0.5 block text-sm text-[var(--muted)]">
                        {place.location || 'Location TBA'}
                      </span>
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                      {place.code}
                    </span>
                  </button>
                );
              })}
              {(places.data ?? []).length === 0 ? (
                <p className="text-sm text-[var(--muted)]">
                  No free places for this slot. Go back and pick another time.
                </p>
              ) : null}
            </div>
          )}
          {selectedPlace ? (
            <p className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)]/50 px-3 py-2 text-sm">
              Meeting place:{' '}
              <span className="font-semibold">{selectedPlace.name}</span>
              {selectedPlace.location
                ? ` · ${selectedPlace.location}`
                : ''}
            </p>
          ) : null}
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        </div>
      )}
    </Modal>
  );
}
