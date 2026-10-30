'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
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

const WEEKDAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOUR_START = 7;
const HOUR_END = 21;
const HOURS = Array.from(
  { length: HOUR_END - HOUR_START },
  (_, i) => HOUR_START + i,
);
const HOUR_PX = 56;

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

function formatWeekTitle(anchor: Date, days = 7) {
  const start = startOfWeek(anchor);
  const end = addDays(start, days - 1);
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
        dot: 'bg-rose-500',
      };
    }
    return {
      bg: 'bg-amber-100',
      border: 'border-amber-300',
      text: 'text-amber-950',
      bar: 'bg-amber-500',
      dot: 'bg-amber-500',
    };
  }
  if (status === 'CONFIRMED' || status === 'COMPLETED') {
    return {
      bg: 'bg-[var(--accent-soft)]',
      border: 'border-[var(--accent)]/45',
      text: 'text-[var(--foreground)]',
      bar: 'bg-[var(--accent)]',
      dot: 'bg-[var(--accent)]',
    };
  }
  if (status === 'CANCELLED' || status === 'NO_SHOW') {
    return {
      bg: 'bg-rose-50',
      border: 'border-rose-200',
      text: 'text-rose-800',
      bar: 'bg-rose-400',
      dot: 'bg-rose-400',
    };
  }
  return {
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    text: 'text-sky-950',
    bar: 'bg-sky-500',
    dot: 'bg-sky-500',
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
  const height = Math.max(((end - start) / total) * 100, 4);
  return { top, height };
}

function nowOffsetPercent(day: Date) {
  const now = new Date();
  if (!sameDay(now, day)) return null;
  const dayStart = new Date(day);
  dayStart.setHours(HOUR_START, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(HOUR_END, 0, 0, 0);
  if (now < dayStart || now > dayEnd) return null;
  return (
    ((now.getTime() - dayStart.getTime()) /
      (dayEnd.getTime() - dayStart.getTime())) *
    100
  );
}

function EventDetails({
  selected,
  onClose,
}: {
  selected: CalendarEvent | null;
  onClose?: () => void;
}) {
  if (!selected) {
    return (
      <p className="hidden text-sm text-[var(--muted)] md:block">
        Select an event on the calendar to see details.
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[0_8px_30px_rgba(10,10,10,0.06)]">
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
        <div className="flex items-center gap-2">
          <Badge variant={statusTone(selected.status)}>
            {selected.status.replaceAll('_', ' ')}
          </Badge>
          {onClose ? (
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              Close
            </Button>
          ) : null}
        </div>
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
        <p className="inline-flex items-start gap-1.5">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
          <span>
            <span className="text-[var(--muted)]">Place: </span>
            {selected.location || '—'}
          </span>
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
  );
}

function DayAgendaList({
  day,
  events,
  selectedId,
  onPick,
}: {
  day: Date;
  events: CalendarEvent[];
  selectedId: string | null;
  onPick: (event: CalendarEvent) => void;
}) {
  const dayEvents = eventsForDay(events, day);
  if (dayEvents.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card-elevated)]/60 px-4 py-8 text-center">
        <p className="text-sm font-medium text-[var(--foreground)]">
          Nothing scheduled
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {formatDayTitle(day)}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        {formatDayTitle(day)}
      </p>
      {dayEvents.map((event) => {
        const colors = eventColor(event);
        return (
          <button
            key={event.id}
            type="button"
            onClick={() => onPick(event)}
            className={cn(
              'flex w-full gap-3 rounded-2xl border bg-white p-3 text-left shadow-[0_6px_18px_rgba(10,10,10,0.04)] transition active:scale-[0.99]',
              colors.border,
              selectedId === event.id && 'ring-2 ring-[var(--ring)]',
            )}
          >
            <div className="w-16 shrink-0 pt-0.5 text-right">
              <p className="text-sm font-semibold tabular-nums">
                {formatTime(event.startsAt)}
              </p>
              {event.endsAt ? (
                <p className="text-[11px] text-[var(--muted)] tabular-nums">
                  {formatTime(event.endsAt)}
                </p>
              ) : null}
            </div>
            <div className={cn('w-1 shrink-0 rounded-full', colors.bar)} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{event.title}</p>
              <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                {event.location ||
                  (event.kind === 'request'
                    ? 'Proposed meeting'
                    : 'Confirmed meeting')}
              </p>
              <div className="mt-2">
                <Badge variant={statusTone(event.status)}>
                  {event.status.replaceAll('_', ' ')}
                </Badge>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function TimeGrid({
  days,
  events,
  selectedId,
  onPick,
  compactMobile,
}: {
  days: Date[];
  events: CalendarEvent[];
  selectedId: string | null;
  onPick: (event: CalendarEvent) => void;
  compactMobile?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = startOfDay(new Date());

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const focusDay = days.find((d) => sameDay(d, today)) ?? days[0];
    if (!focusDay) return;
    const pct = nowOffsetPercent(focusDay);
    if (pct == null) {
      node.scrollTop = Math.max(0, 3 * HOUR_PX);
      return;
    }
    const totalHeight = (HOUR_END - HOUR_START) * HOUR_PX;
    node.scrollTop = Math.max(0, (pct / 100) * totalHeight - node.clientHeight / 3);
  }, [days, today]);

  return (
    <div
      ref={scrollRef}
      className={cn(
        'overflow-auto rounded-2xl border border-[var(--border)] bg-white',
        compactMobile ? 'max-h-[min(70vh,560px)]' : 'max-h-[min(72vh,680px)]',
      )}
    >
      <div
        className="min-w-0"
        style={{
          display: 'grid',
          gridTemplateColumns:
            days.length === 1
              ? '52px minmax(0, 1fr)'
              : `44px repeat(${days.length}, minmax(${compactMobile ? 72 : 96}px, 1fr))`,
          minWidth: days.length > 1 ? undefined : undefined,
        }}
      >
        <div className="sticky top-0 z-20 border-b border-r border-[var(--border)] bg-white" />
        {days.map((day) => {
          const isToday = sameDay(day, today);
          return (
            <div
              key={day.toISOString()}
              className={cn(
                'sticky top-0 z-20 border-b border-r border-[var(--border)] bg-white px-1 py-2 text-center',
                isToday && 'bg-[var(--accent-soft)]/40',
              )}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                {day.toLocaleDateString(undefined, { weekday: 'short' })}
              </p>
              <p
                className={cn(
                  'mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold',
                  isToday &&
                    'bg-[var(--accent)] text-[var(--accent-foreground)] shadow-sm',
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
              className="border-b border-[var(--border)] pr-1.5 text-right text-[10px] text-[var(--muted)]"
              style={{ height: HOUR_PX }}
            >
              <span className="-mt-2 inline-block">
                {new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, {
                  hour: 'numeric',
                })}
              </span>
            </div>
          ))}
        </div>

        {days.map((day) => {
          const dayEvents = eventsForDay(events, day);
          const nowPct = nowOffsetPercent(day);
          return (
            <div
              key={`col-${day.toISOString()}`}
              className="relative border-r border-[var(--border)]"
            >
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="border-b border-[var(--border)]"
                  style={{ height: HOUR_PX }}
                />
              ))}
              {nowPct != null ? (
                <div
                  className="pointer-events-none absolute right-0 left-0 z-20"
                  style={{ top: `${nowPct}%` }}
                >
                  <div className="relative">
                    <span className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-rose-500 shadow" />
                    <div className="h-[2px] bg-rose-500" />
                  </div>
                </div>
              ) : null}
              {dayEvents.map((event) => {
                const { top, height } = positionInDay(event, day);
                const colors = eventColor(event);
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onPick(event)}
                    className={cn(
                      'absolute right-0.5 left-0.5 z-10 overflow-hidden rounded-lg border px-1.5 py-1 text-left shadow-sm transition active:scale-[0.99] hover:brightness-[0.98]',
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
                        'absolute top-0 bottom-0 left-0 w-1 rounded-l-lg',
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
  );
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
  const [isMobile, setIsMobile] = useState(false);
  const today = startOfDay(new Date());

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const apply = () => {
      setIsMobile(mq.matches);
      if (mq.matches) {
        setView((current) => (current === 'week' ? 'day' : current));
      }
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const selected = useMemo(
    () => events.find((event) => event.id === selectedId) ?? null,
    [events, selectedId],
  );

  const title =
    view === 'month'
      ? formatMonthTitle(cursor)
      : view === 'week'
        ? formatWeekTitle(cursor, isMobile ? 3 : 7)
        : formatDayTitle(cursor);

  const monthCells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  }, [cursor]);

  const weekDays = useMemo(() => {
    if (isMobile) {
      // Google-style compact 3-day strip centered on cursor
      return Array.from({ length: 3 }, (_, index) => addDays(cursor, index));
    }
    const start = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [cursor, isMobile]);

  function goToday() {
    setCursor(startOfDay(new Date()));
  }

  function goPrev() {
    if (view === 'month') {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
      return;
    }
    if (view === 'week') {
      setCursor(addDays(cursor, isMobile ? -3 : -7));
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
      setCursor(addDays(cursor, isMobile ? 3 : 7));
      return;
    }
    setCursor(addDays(cursor, 1));
  }

  function pickEvent(event: CalendarEvent) {
    setSelectedId(event.id);
    onSelectEvent?.(event);
  }

  const mobileViews: ViewMode[] = isMobile
    ? ['day', 'week', 'month']
    : ['month', 'week', 'day'];

  return (
    <div className={cn('space-y-3 md:space-y-4', className)}>
      {/* Toolbar — Google Calendar style */}
      <div className="z-10 -mx-1 rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_96%,transparent)] px-2 py-2 shadow-[0_8px_24px_rgba(10,10,10,0.05)] backdrop-blur-md md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="hidden h-9 rounded-full px-3 sm:inline-flex"
            onClick={goToday}
          >
            Today
          </Button>
          <div className="flex items-center rounded-full border border-[var(--border)] bg-white">
            <button
              type="button"
              aria-label="Previous"
              className="rounded-l-full px-2.5 py-2 text-[var(--muted)] hover:bg-black/5"
              onClick={goPrev}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Next"
              className="rounded-r-full px-2.5 py-2 text-[var(--muted)] hover:bg-black/5"
              onClick={goNext}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={goToday}
            className="min-w-0 flex-1 text-left sm:flex-none"
          >
            <h3 className="h-display truncate text-base font-bold tracking-tight md:text-xl">
              {title}
            </h3>
            <p className="text-[10px] font-medium text-[var(--muted)] sm:hidden">
              Tap title area · Today jumps here
            </p>
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-full px-3 sm:hidden"
            onClick={goToday}
          >
            Today
          </Button>
          <div className="ml-auto inline-flex rounded-full border border-[var(--border)] bg-[var(--card-elevated)] p-0.5">
            {mobileViews.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-colors',
                  view === mode
                    ? 'bg-[var(--accent)] text-[var(--accent-foreground)] shadow-sm'
                    : 'text-[var(--muted)] hover:text-[var(--foreground)]',
                )}
              >
                {isMobile && mode === 'week' ? '3 days' : mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-[11px] text-[var(--muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />{' '}
          Meeting
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Request
        </span>
      </div>

      {/* Month view */}
      {view === 'month' ? (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[0_10px_28px_rgba(10,10,10,0.05)]">
            <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--card-elevated)]/80">
              {(isMobile ? WEEKDAYS_SHORT : WEEKDAYS).map((day, index) => (
                <div
                  key={`${day}-${index}`}
                  className="px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)] md:text-[11px]"
                >
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {monthCells.map((day) => {
                const inMonth = day.getMonth() === cursor.getMonth();
                const isToday = sameDay(day, today);
                const isSelected = sameDay(day, cursor);
                const dayEvents = eventsForDay(events, day);
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => {
                      setCursor(day);
                      if (isMobile) {
                        // Keep month + agenda like Google; double-intent via long view switch
                        return;
                      }
                      setView('day');
                    }}
                    onDoubleClick={() => {
                      setCursor(day);
                      setView('day');
                    }}
                    className={cn(
                      'relative border-b border-r border-[var(--border)] text-left transition-colors',
                      isMobile
                        ? 'flex min-h-[3.1rem] flex-col items-center justify-start gap-1 px-0.5 py-1.5'
                        : 'min-h-24 p-1.5 align-top hover:bg-[var(--highlight-soft)]/50 sm:min-h-28',
                      !inMonth && 'bg-[var(--card-elevated)]/60 text-[var(--muted)]',
                      isSelected && isMobile && 'bg-[var(--accent-soft)]/45',
                      isToday && !isMobile && 'bg-[var(--accent-soft)]/35',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex items-center justify-center rounded-full text-xs font-semibold',
                        isMobile ? 'h-7 w-7' : 'h-6 w-6',
                        isToday &&
                          'bg-[var(--accent)] text-[var(--accent-foreground)] shadow-sm',
                        isSelected &&
                          !isToday &&
                          isMobile &&
                          'bg-black/90 text-white',
                      )}
                    >
                      {day.getDate()}
                    </span>

                    {/* Mobile: Google-style dots */}
                    {isMobile ? (
                      <div className="flex max-w-full flex-wrap justify-center gap-0.5">
                        {dayEvents.slice(0, 3).map((event) => (
                          <span
                            key={event.id}
                            className={cn(
                              'h-1.5 w-1.5 rounded-full',
                              eventColor(event).dot,
                            )}
                          />
                        ))}
                        {dayEvents.length > 3 ? (
                          <span className="text-[8px] leading-none text-[var(--muted)]">
                            +
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <>
                        <div className="mb-1 flex items-center justify-between gap-1">
                          {dayEvents.length > 3 ? (
                            <span className="ml-auto text-[10px] text-[var(--muted)]">
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
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mobile agenda under month (Google Calendar pattern) */}
          {isMobile ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <p className="text-sm font-semibold">
                  {sameDay(cursor, today) ? 'Today' : formatDayTitle(cursor)}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-full"
                  onClick={() => setView('day')}
                >
                  Day view
                </Button>
              </div>
              <DayAgendaList
                day={cursor}
                events={events}
                selectedId={selectedId}
                onPick={pickEvent}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Week / Day time grids */}
      {view === 'week' || view === 'day' ? (
        <TimeGrid
          days={view === 'day' ? [cursor] : weekDays}
          events={events}
          selectedId={selectedId}
          onPick={pickEvent}
          compactMobile={isMobile}
        />
      ) : null}

      {/* Details: sheet-like on mobile when selected */}
      {selected || !isMobile ? (
        <EventDetails
          selected={selected}
          onClose={
            isMobile && selected
              ? () => setSelectedId(null)
              : undefined
          }
        />
      ) : null}
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
