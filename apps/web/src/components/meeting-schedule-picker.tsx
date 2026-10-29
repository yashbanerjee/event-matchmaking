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

  const slots = useQuery({
    queryKey: ['meeting-slots', requestId, date],
    enabled: open && Boolean(date) && step === 'slot',
    queryFn: () => {
      const params = new URLSearchParams({ date });
      if (requestId) params.set('requestId', requestId);
      return apiFetch<{ durationMinutes: number; slots: ScheduleSlot[] }>(
        `/meeting-requests/slots?${params.toString()}`,
        { token: getAccessToken() },
      );
    },
  });

  const places = useQuery({
    queryKey: ['places-available', selectedSlot?.startsAt, selectedSlot?.endsAt],
    enabled: open && Boolean(selectedSlot) && step === 'place',
    queryFn: () =>
      apiFetch<SchedulePlace[]>(
        `/places/available?startsAt=${encodeURIComponent(selectedSlot!.startsAt)}&endsAt=${encodeURIComponent(selectedSlot!.endsAt)}`,
        { token: getAccessToken() },
      ),
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
          ? `Choose a free time and meeting place with ${counterpartName}.`
          : 'Choose a free time and an available meeting place.')
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
          <div>
            <label className="mb-1.5 block text-sm font-medium">Date</label>
            <Input
              type="date"
              value={date}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => {
                setDate(e.target.value);
                setSelectedSlot(null);
              }}
            />
          </div>
          {date && slots.isLoading ? (
            <p className="text-sm text-[var(--muted)]">Loading free slots…</p>
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
                  No free slots on this day.
                </p>
              ) : null}
            </div>
          ) : null}
          {slots.data?.durationMinutes ? (
            <p className="text-xs text-[var(--muted)]">
              Each slot is {slots.data.durationMinutes} minutes.
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
            Only places that are free for this slot are shown. Pick one meeting
            place to continue.
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
