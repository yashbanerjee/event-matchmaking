'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { statusTone } from '@/lib/status';

export type CalendarEventKind = 'meeting' | 'request';

export type CalendarEvent = {
  id: string;
  kind: CalendarEventKind;
  title: string;
  subtitle?: string | null;
  startsAt: string;
  endsAt?: string | null;
  status: string;
  location?: string | null;
  meta?: Record<string, string | null | undefined>;
};

type ViewMode = 'month' | 'week' | 'day';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOUR_START = 7;
const HOUR_END = 21;
const HOURS = Array.from(
  { length: HOUR_END - HOUR_START },
  (_, i) => HOUR_START + i,
);

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date: Date) {
  const next = startOfDay(date);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatMonthTitle(date: Date) {
  return date.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

function formatWeekTitle(anchor: Date) {
  const start = startOfWeek(anchor);
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${start.toLocaleDateString(undefined, { month: 'long' })} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function formatDayTitle(date: Date) {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function eventEnd(event: CalendarEvent) {
  if (event.endsAt) {
    const end = new Date(event.endsAt);
    if (!Number.isNaN(end.getTime())) return end;
  }
  const start = new Date(event.startsAt);
  start.setMinutes(start.getMinutes() + 30);
  return start;
}

function eventColor(event: CalendarEvent) {
  const status = event.status.toUpperCase();
  if (event.kind === 'request') {
    if (status === 'DECLINED' || status === 'CANCELLED') {
      return {
        bg: 'bg-rose-100',
        border: 'border-rose-300',
        text: 'text-rose-900',
        bar: 'bg-rose-500',
      };
    }
    return {
      bg: 'bg-amber-100',
      border: 'border-amber-300',
      text: 'text-amber-950',
      bar: 'bg-amber-500',
    };
  }
  if (status === 'CONFIRMED' || status === 'COMPLETED') {
    return {
      bg: 'bg-[var(--accent-soft)]',
      border: 'border-[var(--accent)]/40',
      text: 'text-[var(--foreground)]',
      bar: 'bg-[var(--accent)]',
    };
  }
  if (status === 'CANCELLED' || status === 'NO_SHOW') {
    return {
      bg: 'bg-rose-50',
      border: 'border-rose-200',
      text: 'text-rose-800',
      bar: 'bg-rose-400',
    };
  }
  return {
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    text: 'text-sky-950',
    bar: 'bg-sky-500',
  };
}

function eventsForDay(events: CalendarEvent[], day: Date) {
  const from = startOfDay(day).getTime();
  const to = endOfDay(day).getTime();
  return events
    .filter((event) => {
      const start = new Date(event.startsAt).getTime();
      if (Number.isNaN(start)) return false;
      const end = eventEnd(event).getTime();
      return start <= to && end >= from;
    })
    .sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
}

function positionInDay(event: CalendarEvent, day: Date) {
  const dayStart = new Date(day);
  dayStart.setHours(HOUR_START, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(HOUR_END, 0, 0, 0);
  const total = dayEnd.getTime() - dayStart.getTime();
  const start = Math.max(new Date(event.startsAt).getTime(), dayStart.getTime());
  const end = Math.min(eventEnd(event).getTime(), dayEnd.getTime());
  const top = ((start - dayStart.getTime()) / total) * 100;
  const height = Math.max(((end - start) / total) * 100, 3.5);
  return { top, height };
}

export function MeetingsCalendar({
  events,
  onSelectEvent,
  className,
}: {
  events: CalendarEvent[];
  onSelectEvent?: (event: CalendarEvent) => void;
  className?: string;
}) {
  const [view, setView] = useState<ViewMode>('month');
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const today = startOfDay(new Date());

  const selected = useMemo(
    () => events.find((event) => event.id === selectedId) ?? null,
    [events, selectedId],
  );

  const title =
    view === 'month'
      ? formatMonthTitle(cursor)
      : view === 'week'
        ? formatWeekTitle(cursor)
        : formatDayTitle(cursor);

  const monthCells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  }, [cursor]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [cursor]);

  function goToday() {
    setCursor(startOfDay(new Date()));
  }

  function goPrev() {
    if (view === 'month') {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
      return;
    }
    if (view === 'week') {
      setCursor(addDays(cursor, -7));
      return;
    }
    setCursor(addDays(cursor, -1));
  }

  function goNext() {
    if (view === 'month') {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
      return;
    }
    if (view === 'week') {
      setCursor(addDays(cursor, 7));
      return;
    }
    setCursor(addDays(cursor, 1));
  }

  function pickEvent(event: CalendarEvent) {
    setSelectedId(event.id);
    onSelectEvent?.(event);
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <div className="flex items-center rounded-xl border border-[var(--border)] bg-white">
            <button
              type="button"
              aria-label="Previous"
              className="rounded-l-xl px-2.5 py-1.5 text-[var(--muted)] hover:bg-black/5"
              onClick={goPrev}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Next"
              className="rounded-r-xl px-2.5 py-1.5 text-[var(--muted)] hover:bg-black/5"
              onClick={goNext}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <h3 className="h-display text-lg font-semibold tracking-tight sm:text-xl">
            {title}
          </h3>
        </div>

        <div className="inline-flex rounded-xl border border-[var(--border)] bg-[var(--card-elevated)] p-1">
          {(['month', 'week', 'day'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors sm:text-sm',
                view === mode
                  ? 'bg-[var(--accent)] text-[var(--accent-foreground)] shadow-sm'
                  : 'text-[var(--muted)] hover:text-[var(--foreground)]',
              )}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-[var(--muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--accent)]" /> Meeting
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" /> Request /
          proposed
        </span>
      </div>

      {view === 'month' ? (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
          <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--card-elevated)]">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]"
              >
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthCells.map((day) => {
              const inMonth = day.getMonth() === cursor.getMonth();
              const isToday = sameDay(day, today);
              const dayEvents = eventsForDay(events, day);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => {
                    setCursor(day);
                    setView('day');
                  }}
                  className={cn(
                    'min-h-24 border-b border-r border-[var(--border)] p-1.5 text-left align-top transition-colors hover:bg-[var(--highlight-soft)]/50 sm:min-h-28',
                    !inMonth && 'bg-[var(--card-elevated)]/70 text-[var(--muted)]',
                    isToday && 'bg-[var(--accent-soft)]/35',
                  )}
                >
                  <div className="mb-1 flex items-center justify-between gap-1">
                    <span
                      className={cn(
                        'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                        isToday &&
                          'bg-[var(--accent)] text-[var(--accent-foreground)]',
                      )}
                    >
                      {day.getDate()}
                    </span>
                    {dayEvents.length > 3 ? (
                      <span className="text-[10px] text-[var(--muted)]">
                        +{dayEvents.length - 3}
                      </span>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map((event) => {
                      const colors = eventColor(event);
                      return (
                        <div
                          key={event.id}
                          role="presentation"
                          onClick={(e) => {
                            e.stopPropagation();
                            pickEvent(event);
                          }}
                          className={cn(
                            'truncate rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-tight sm:text-[11px]',
                            colors.bg,
                            colors.border,
                            colors.text,
                          )}
                          title={`${formatTime(event.startsAt)} ${event.title}`}
                        >
                          <span className="opacity-80">
                            {formatTime(event.startsAt)}
                          </span>{' '}
                          {event.title}
                        </div>
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {view === 'week' || view === 'day' ? (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
          <div
            className="min-w-[720px]"
            style={{
              display: 'grid',
              gridTemplateColumns:
                view === 'day' ? '64px 1fr' : `64px repeat(7, minmax(0, 1fr))`,
            }}
          >
            <div className="border-b border-r border-[var(--border)] bg-[var(--card-elevated)]" />
            {(view === 'day' ? [cursor] : weekDays).map((day) => {
              const isToday = sameDay(day, today);
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'border-b border-r border-[var(--border)] bg-[var(--card-elevated)] px-2 py-2 text-center',
                    isToday && 'bg-[var(--accent-soft)]/50',
                  )}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                    {day.toLocaleDateString(undefined, { weekday: 'short' })}
                  </p>
                  <p
                    className={cn(
                      'mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold',
                      isToday &&
                        'bg-[var(--accent)] text-[var(--accent-foreground)]',
                    )}
                  >
                    {day.getDate()}
                  </p>
                </div>
              );
            })}

            <div className="relative border-r border-[var(--border)]">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="h-14 border-b border-[var(--border)] pr-2 text-right text-[10px] text-[var(--muted)]"
                >
                  <span className="-mt-2 inline-block">
                    {new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, {
                      hour: 'numeric',
                    })}
                  </span>
                </div>
              ))}
            </div>

            {(view === 'day' ? [cursor] : weekDays).map((day) => {
              const dayEvents = eventsForDay(events, day);
              return (
                <div
                  key={`col-${day.toISOString()}`}
                  className="relative border-r border-[var(--border)]"
                >
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="h-14 border-b border-[var(--border)]"
                    />
                  ))}
                  {dayEvents.map((event) => {
                    const { top, height } = positionInDay(event, day);
                    const colors = eventColor(event);
                    return (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => pickEvent(event)}
                        className={cn(
                          'absolute right-1 left-1 z-10 overflow-hidden rounded-lg border px-1.5 py-1 text-left shadow-sm transition hover:brightness-95',
                          colors.bg,
                          colors.border,
                          colors.text,
                          selectedId === event.id &&
                            'ring-2 ring-[var(--ring)] ring-offset-1',
                        )}
                        style={{
                          top: `${top}%`,
                          height: `${height}%`,
                          minHeight: 28,
                        }}
                        title={event.title}
                      >
                        <div
                          className={cn(
                            'absolute top-0 bottom-0 left-0 w-1',
                            colors.bar,
                          )}
                        />
                        <p className="truncate pl-1.5 text-[11px] font-semibold leading-tight">
                          {event.title}
                        </p>
                        <p className="truncate pl-1.5 text-[10px] opacity-80">
                          {formatTime(event.startsAt)}
                          {event.endsAt ? ` – ${formatTime(event.endsAt)}` : ''}
                        </p>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {selected ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-elevated)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                {selected.kind === 'meeting' ? 'Meeting' : 'Meeting request'}
              </p>
              <h4 className="mt-1 h-display text-lg font-semibold tracking-tight">
                {selected.title}
              </h4>
              {selected.subtitle ? (
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {selected.subtitle}
                </p>
              ) : null}
            </div>
            <Badge variant={statusTone(selected.status)}>
              {selected.status.replaceAll('_', ' ')}
            </Badge>
          </div>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <p>
              <span className="text-[var(--muted)]">When: </span>
              {new Date(selected.startsAt).toLocaleString()}
              {selected.endsAt
                ? ` – ${new Date(selected.endsAt).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}`
                : ''}
            </p>
            <p>
              <span className="text-[var(--muted)]">Meeting place: </span>
              {selected.location || '—'}
            </p>
            {selected.meta
              ? Object.entries(selected.meta)
                  .filter(([, value]) => Boolean(value))
                  .map(([label, value]) => (
                    <p key={label}>
                      <span className="text-[var(--muted)]">{label}: </span>
                      {value}
                    </p>
                  ))
              : null}
          </div>
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          Select an event on the calendar to see details.
        </p>
      )}
    </div>
  );
}

/** Map meetings + proposed requests into calendar events. */
export function toCalendarEvents(input: {
  meetings?: Array<{
    id: string;
    status: string;
    startsAt: string;
    endsAt?: string | null;
    companyOrg: { name: string };
    vendorOrg: { name: string };
    location?: string | null;
    venue?: string | null;
    place?: { name: string } | null;
    invitedByLabel?: string | null;
  }>;
  requests?: Array<{
    id: string;
    status: string;
    proposedStartsAt: string | null;
    proposedEndsAt: string | null;
    fromOrg: { name: string };
    toOrg: { name: string };
    place?: { name: string; location?: string | null } | null;
    meeting?: { id: string } | null;
  }>;
}): CalendarEvent[] {
  const meetingEvents: CalendarEvent[] = (input.meetings ?? [])
    .filter((m) => m.status !== 'CANCELLED')
    .map((m) => ({
      id: `meeting:${m.id}`,
      kind: 'meeting' as const,
      title: `${m.companyOrg.name} ↔ ${m.vendorOrg.name}`,
      subtitle: m.invitedByLabel || null,
      startsAt: m.startsAt,
      endsAt: m.endsAt ?? null,
      status: m.status,
      location: m.location || m.place?.name || m.venue || null,
      meta: {
        Client: m.companyOrg.name,
        Guest: m.vendorOrg.name,
        ...(m.location || m.place?.name || m.venue
          ? {
              'Meeting place':
                m.location || m.place?.name || m.venue || '',
            }
          : {}),
      },
    }));

  const requestEvents: CalendarEvent[] = (input.requests ?? [])
    .filter(
      (r) =>
        r.proposedStartsAt &&
        !r.meeting &&
        !['DECLINED', 'CANCELLED', 'SCHEDULED'].includes(r.status),
    )
    .map((r) => ({
      id: `request:${r.id}`,
      kind: 'request' as const,
      title: `${r.fromOrg.name} → ${r.toOrg.name}`,
      subtitle: 'Proposed time awaiting confirmation',
      startsAt: r.proposedStartsAt!,
      endsAt: r.proposedEndsAt,
      status: r.status,
      location: r.place
        ? r.place.location
          ? `${r.place.name} · ${r.place.location}`
          : r.place.name
        : null,
      meta: {
        From: r.fromOrg.name,
        To: r.toOrg.name,
        ...(r.place
          ? {
              'Meeting place': r.place.location
                ? `${r.place.name} · ${r.place.location}`
                : r.place.name,
            }
          : {}),
      },
    }));

  return [...meetingEvents, ...requestEvents].sort(
    (a, b) =>
      new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
}
