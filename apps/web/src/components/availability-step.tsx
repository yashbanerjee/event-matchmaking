'use client';

import { useMemo } from 'react';
import { Select } from '@/components/ui/select';
import { EVENT_TIME_ZONE } from '@/lib/event-schedule';
import { cn } from '@/lib/utils';

export type EventDateOption = { value: string; label: string };

export type DayWindow = { start: string; end: string };

function hmToMinutes(hm: string) {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

function minutesToHm(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Fixed event-hour slot options (15-minute steps). */
export function buildTimeOptions(activeStart: string, activeEnd: string) {
  const start = hmToMinutes(activeStart);
  const end = hmToMinutes(activeEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    return [];
  }
  const options: string[] = [];
  for (let t = start; t <= end; t += 15) {
    options.push(minutesToHm(t));
  }
  return options;
}

export function AvailabilityStep({
  eventDates,
  activeStart,
  activeEnd,
  timeZone = EVENT_TIME_ZONE,
  selectedDates,
  windows,
  onToggleDate,
  onChangeWindow,
  disabled = false,
}: {
  eventDates: EventDateOption[];
  activeStart: string;
  activeEnd: string;
  timeZone?: string;
  selectedDates: string[];
  windows: Record<string, DayWindow>;
  onToggleDate: (date: string) => void;
  onChangeWindow: (date: string, next: DayWindow) => void;
  disabled?: boolean;
}) {
  const timeOptions = useMemo(
    () => buildTimeOptions(activeStart, activeEnd),
    [activeStart, activeEnd],
  );

  if (!eventDates.length) {
    return (
      <p className="text-sm text-[var(--danger)]">
        Event dates are not configured yet. Ask an admin to set them in
        Settings.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[var(--highlight)]/20 bg-[var(--highlight-soft)]/50 px-4 py-3 text-sm leading-relaxed">
        Event hours are fixed at{' '}
        <span className="font-semibold">
          {activeStart}–{activeEnd}
        </span>{' '}
        ({timeZone}). Pick the days you can meet, then choose your window inside
        those hours for each day.
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">
          Event days you can take meetings{' '}
          <span className="text-[var(--danger)]">*</span>
        </p>
        <div className="space-y-2">
          {eventDates.map((day) => {
            const checked = selectedDates.includes(day.value);
            return (
              <label
                key={day.value}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors',
                  checked
                    ? 'border-[var(--accent)]/40 bg-[var(--accent-soft)]/50'
                    : 'border-[var(--border)] bg-white hover:border-[var(--accent)]/30',
                  disabled && 'pointer-events-none opacity-60',
                )}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[var(--border)]"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onToggleDate(day.value)}
                />
                <span className="font-medium">{day.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {selectedDates.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold">Your time on each day</p>
          {selectedDates.map((date) => {
            const meta = eventDates.find((d) => d.value === date);
            const window = windows[date] ?? {
              start: activeStart,
              end: activeEnd,
            };
            const endOptions = timeOptions.filter((t) => t > window.start);
            return (
              <div
                key={date}
                className="rounded-2xl border border-[var(--border)] bg-[var(--card-elevated)]/70 p-3 sm:p-4"
              >
                <p className="mb-3 text-sm font-medium">
                  {meta?.label ?? date}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    <span className="mb-1.5 block font-medium">
                      Available from
                    </span>
                    <Select
                      value={window.start}
                      disabled={disabled}
                      onChange={(e) => {
                        const start = e.target.value;
                        const end =
                          window.end > start
                            ? window.end
                            : (endOptions[0] ?? activeEnd);
                        onChangeWindow(date, { start, end });
                      }}
                    >
                      {timeOptions
                        .filter((t) => t < activeEnd)
                        .map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                    </Select>
                  </label>
                  <label className="text-sm">
                    <span className="mb-1.5 block font-medium">
                      Available until
                    </span>
                    <Select
                      value={window.end}
                      disabled={disabled}
                      onChange={(e) =>
                        onChangeWindow(date, {
                          start: window.start,
                          end: e.target.value,
                        })
                      }
                    >
                      {endOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                  </label>
                </div>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Must stay between {activeStart} and {activeEnd}.
                </p>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
