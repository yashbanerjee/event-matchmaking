'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import { cn } from '@/lib/utils';
import { statusTone } from '@/lib/status';

export type OverviewRequest = {
  id: string;
  status: string;
  message?: string | null;
  proposedStartsAt?: string | null;
  fromOrg: { id: string; name: string };
  toOrg: { id: string; name: string };
  place?: { name: string; location?: string | null } | null;
};

export type OverviewMeeting = {
  id: string;
  status: string;
  startsAt: string;
  endsAt?: string | null;
  counterpartyName: string;
  placeName?: string | null;
};

export type OverviewForm = {
  id: string;
  name: string;
  statusLabel: string;
  statusToneKey: string;
  filledOn?: string | null;
  href: string;
};

function SectionHeader({
  title,
  href,
  count,
  icon,
}: {
  title: string;
  href: string;
  count?: number;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        {icon}
        <h2 className="h-display text-base font-semibold tracking-tight">
          {title}
          {typeof count === 'number' ? (
            <span className="ml-1.5 text-xs font-medium text-[var(--muted)]">
              {count}
            </span>
          ) : null}
        </h2>
      </div>
      <Link href={href} className="shrink-0">
        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs">
          View all
        </Button>
      </Link>
    </div>
  );
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatShortTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function OverviewStatStrip({
  items,
}: {
  items: Array<{ label: string; value: ReactNode; accent?: boolean }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={
            item.accent
              ? 'rounded-xl border border-transparent bg-[linear-gradient(145deg,#26e2c6,#1bc4ab)] px-3 py-2.5 text-[var(--accent-foreground)]'
              : 'rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5'
          }
        >
          <p
            className={
              item.accent
                ? 'text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-foreground)]/75'
                : 'text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]'
            }
          >
            {item.label}
          </p>
          <p className="mt-0.5 text-xl font-bold tracking-tight">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

type WeekDayEvent = {
  id: string;
  title: string;
  time: string;
  sortAt: number;
  tone: 'meeting' | 'request';
  place?: string | null;
  status?: string;
};

export function OverviewWeekCalendar({
  meetings,
  requests,
  meetingsHref,
  myOrgIds = [],
}: {
  meetings: OverviewMeeting[];
  requests: OverviewRequest[];
  meetingsHref: string;
  myOrgIds?: string[];
}) {
  const today = startOfDay(new Date());
  const [weekStart, setWeekStart] = useState(() => {
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay());
    return start;
  });
  const [selectedDay, setSelectedDay] = useState(() => today);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  // Keep selection inside the visible week (prefer today when jumping weeks).
  const activeDay = useMemo(() => {
    if (days.some((d) => sameDay(d, selectedDay))) return selectedDay;
    const todayInWeek = days.find((d) => sameDay(d, today));
    return todayInWeek ?? days[0]!;
  }, [days, selectedDay, today]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, WeekDayEvent[]>();
    for (const day of days) {
      map.set(day.toDateString(), []);
    }
    for (const meeting of meetings) {
      const start = new Date(meeting.startsAt);
      const key = startOfDay(start).toDateString();
      const bucket = map.get(key);
      if (!bucket) continue;
      bucket.push({
        id: `m-${meeting.id}`,
        title: meeting.counterpartyName,
        time: formatShortTime(meeting.startsAt),
        sortAt: start.getTime(),
        tone: 'meeting',
        place: meeting.placeName,
        status: meeting.status,
      });
    }
    const mine = new Set(myOrgIds);
    for (const req of requests) {
      if (!req.proposedStartsAt) continue;
      const start = new Date(req.proposedStartsAt);
      const key = startOfDay(start).toDateString();
      const bucket = map.get(key);
      if (!bucket) continue;
      const counterpart = mine.has(req.fromOrg.id)
        ? req.toOrg.name
        : req.fromOrg.name;
      bucket.push({
        id: `r-${req.id}`,
        title: counterpart,
        time: formatShortTime(req.proposedStartsAt),
        sortAt: start.getTime(),
        tone: 'request',
        place: req.place
          ? req.place.location
            ? `${req.place.name} · ${req.place.location}`
            : req.place.name
          : null,
        status: req.status,
      });
    }
    for (const [, bucket] of map) {
      bucket.sort((a, b) => a.sortAt - b.sortAt);
    }
    return map;
  }, [days, meetings, requests, myOrgIds]);

  const weekTotal = useMemo(() => {
    let n = 0;
    for (const day of days) n += eventsByDay.get(day.toDateString())?.length ?? 0;
    return n;
  }, [days, eventsByDay]);

  const dayEvents = eventsByDay.get(activeDay.toDateString()) ?? [];
  const meetingCount = dayEvents.filter((e) => e.tone === 'meeting').length;
  const requestCount = dayEvents.filter((e) => e.tone === 'request').length;

  const rangeLabel = `${weekStart.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })} – ${addDays(weekStart, 6).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })}`;

  const dayHeading = sameDay(activeDay, today)
    ? 'Today'
    : activeDay.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });

  function jumpToToday() {
    const t = startOfDay(new Date());
    const s = new Date(t);
    s.setDate(t.getDate() - t.getDay());
    setWeekStart(s);
    setSelectedDay(t);
  }

  return (
    <Card className="min-w-0 overflow-hidden p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-hover)]">
            <CalendarDays className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="h-display text-base font-semibold tracking-tight sm:text-lg">
              This week
            </h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {rangeLabel}
              {weekTotal > 0 ? (
                <span className="text-[var(--foreground)]/70">
                  {' '}
                  · {weekTotal} item{weekTotal === 1 ? '' : 's'}
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            aria-label="Previous week"
            className="rounded-full p-2 text-[var(--muted)] transition hover:bg-black/5 hover:text-[var(--foreground)]"
            onClick={() => setWeekStart((d) => addDays(d, -7))}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-full px-3 text-xs"
            onClick={jumpToToday}
          >
            Today
          </Button>
          <button
            type="button"
            aria-label="Next week"
            className="rounded-full p-2 text-[var(--muted)] transition hover:bg-black/5 hover:text-[var(--foreground)]"
            onClick={() => setWeekStart((d) => addDays(d, 7))}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <Link href={meetingsHref} className="ml-1">
            <Button size="sm" variant="ghost" className="h-8 rounded-full px-3 text-xs">
              Full calendar
            </Button>
          </Link>
        </div>
      </div>

      {/* Day selector — counts stay readable; agenda below has full titles */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-7 sm:overflow-visible sm:pb-0">
        {days.map((day) => {
          const isToday = sameDay(day, today);
          const isActive = sameDay(day, activeDay);
          const count = eventsByDay.get(day.toDateString())?.length ?? 0;
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => setSelectedDay(day)}
              className={cn(
                'flex min-w-[3.4rem] flex-1 flex-col items-center gap-1 rounded-2xl border px-2 py-2.5 transition sm:min-w-0',
                isActive
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_8px_20px_rgba(38,226,198,0.18)]'
                  : 'border-[var(--border)] bg-[var(--card-elevated)] hover:border-[var(--accent)]/40 hover:bg-white',
              )}
            >
              <span
                className={cn(
                  'text-[10px] font-semibold uppercase tracking-[0.12em]',
                  isActive ? 'text-[var(--accent-hover)]' : 'text-[var(--muted)]',
                )}
              >
                {day.toLocaleDateString(undefined, { weekday: 'short' })}
              </span>
              <span
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold tabular-nums',
                  isToday &&
                    'bg-[var(--accent)] text-[var(--accent-foreground)] shadow-sm',
                  isActive &&
                    !isToday &&
                    'bg-[var(--foreground)] text-[var(--card)]',
                  !isActive && !isToday && 'text-[var(--foreground)]',
                )}
              >
                {day.getDate()}
              </span>
              {count > 0 ? (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                    isActive
                      ? 'bg-white/80 text-[var(--foreground)]'
                      : 'bg-[var(--accent)]/15 text-[var(--accent-hover)]',
                  )}
                >
                  {count}
                </span>
              ) : (
                <span className="h-[18px] text-[10px] text-[var(--muted)]/60">
                  ·
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl border border-[var(--border)] bg-gradient-to-b from-white to-[var(--card-elevated)] p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="h-display text-sm font-semibold tracking-tight sm:text-base">
              {dayHeading}
            </p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {dayEvents.length === 0
                ? 'Nothing scheduled'
                : [
                    meetingCount
                      ? `${meetingCount} meeting${meetingCount === 1 ? '' : 's'}`
                      : null,
                    requestCount
                      ? `${requestCount} request${requestCount === 1 ? '' : 's'}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] text-[var(--muted)]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[var(--accent)]" /> Meeting
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> Request
            </span>
          </div>
        </div>

        {dayEvents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center">
            <p className="text-sm font-medium text-[var(--foreground)]">
              Free day
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              No meetings or pending requests on this date.
            </p>
          </div>
        ) : (
          <ul className="max-h-[22rem] space-y-2 overflow-y-auto pr-0.5">
            {dayEvents.map((event) => (
              <li
                key={event.id}
                className={cn(
                  'flex gap-3 rounded-xl border bg-white px-3 py-2.5 shadow-[0_4px_14px_rgba(10,10,10,0.03)]',
                  event.tone === 'meeting'
                    ? 'border-[var(--accent)]/35'
                    : 'border-amber-200',
                )}
              >
                <div className="w-[4.25rem] shrink-0 pt-0.5 text-right">
                  <p className="text-sm font-semibold tabular-nums leading-none">
                    {event.time}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                    {event.tone === 'meeting' ? 'Meet' : 'Ask'}
                  </p>
                </div>
                <div
                  className={cn(
                    'w-1 shrink-0 self-stretch rounded-full',
                    event.tone === 'meeting' ? 'bg-[var(--accent)]' : 'bg-amber-500',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold leading-snug">
                    {event.title}
                  </p>
                  {event.place ? (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-[var(--muted)]">
                      <MapPin className="h-3 w-3 shrink-0 text-[var(--accent)]" />
                      {event.place}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {event.tone === 'request'
                        ? 'Proposed time awaiting reply'
                        : 'Confirmed meeting'}
                    </p>
                  )}
                  {event.status ? (
                    <div className="mt-1.5">
                      <Badge variant={statusTone(event.status)}>
                        {event.status.replaceAll('_', ' ')}
                      </Badge>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export function OverviewRequestCards({
  items,
  requestsHref,
  myOrgIds,
}: {
  items: OverviewRequest[];
  requestsHref: string;
  myOrgIds: string[];
}) {
  const mine = new Set(myOrgIds);
  return (
    <Card className="min-w-0 overflow-hidden p-4">
      <SectionHeader
        title="Requests"
        href={requestsHref}
        count={items.length}
      />
      {items.length === 0 ? (
        <EmptyState
          title="No open requests"
          description="Incoming and outgoing meeting requests show here."
        />
      ) : (
        <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)]">
          {items.slice(0, 6).map((req) => {
            const counterpart = mine.has(req.fromOrg.id)
              ? req.toOrg.name
              : req.fromOrg.name;
            const direction = mine.has(req.fromOrg.id) ? 'Out' : 'In';
            return (
              <div
                key={req.id}
                className="flex items-start gap-3 bg-white px-3 py-2.5 hover:bg-[var(--card-elevated)]"
              >
                <span
                  className={cn(
                    'mt-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                    direction === 'In'
                      ? 'bg-[var(--accent-soft)] text-[var(--foreground)]'
                      : 'bg-black/5 text-[var(--muted)]',
                  )}
                >
                  {direction}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold" title={counterpart}>
                      {counterpart}
                    </p>
                    <Badge
                      variant={statusTone(req.status)}
                      className="shrink-0 text-[10px]"
                    >
                      {req.status.replaceAll('_', ' ')}
                    </Badge>
                  </div>
                  {req.message ? (
                    <p className="mt-0.5 line-clamp-1 text-xs text-[var(--muted)]">
                      {req.message}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-[var(--muted)]">
                    {req.proposedStartsAt
                      ? new Date(req.proposedStartsAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })
                      : 'Time not proposed yet'}
                  </p>
                  {req.place ? (
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-[var(--foreground)]">
                      <MapPin className="h-3 w-3 shrink-0 text-[var(--accent)]" />
                      Meeting place:{' '}
                      {req.place.location
                        ? `${req.place.name} · ${req.place.location}`
                        : req.place.name}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export function OverviewMeetingCards({
  items,
  meetingsHref,
}: {
  items: OverviewMeeting[];
  meetingsHref: string;
}) {
  return (
    <Card className="min-w-0 overflow-hidden p-4">
      <SectionHeader
        title="Upcoming"
        href={meetingsHref}
        count={items.length}
      />
      {items.length === 0 ? (
        <EmptyState
          title="No upcoming meetings"
          description="Confirmed sessions appear here with time and place."
        />
      ) : (
        <div className="space-y-2">
          {items.slice(0, 5).map((m) => {
            const day = new Date(m.startsAt);
            return (
              <div
                key={m.id}
                className="flex items-stretch gap-3 overflow-hidden rounded-xl border border-[var(--border)] bg-white"
              >
                <div className="flex w-14 shrink-0 flex-col items-center justify-center bg-[var(--sidebar)] px-1 py-2 text-center text-[var(--sidebar-fg)]">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
                    {day.toLocaleDateString(undefined, { month: 'short' })}
                  </span>
                  <span className="text-lg font-bold leading-none">
                    {day.getDate()}
                  </span>
                </div>
                <div className="min-w-0 flex-1 py-2 pr-3">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className="truncate text-sm font-semibold"
                      title={m.counterpartyName}
                    >
                      {m.counterpartyName}
                    </p>
                    <Badge
                      variant={statusTone(m.status)}
                      className="shrink-0 text-[10px]"
                    >
                      {m.status.replaceAll('_', ' ')}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {formatShortTime(m.startsAt)}
                    {m.endsAt ? ` – ${formatShortTime(m.endsAt)}` : ''}
                  </p>
                  {m.placeName ? (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] font-medium text-[var(--foreground)]">
                      <MapPin className="h-3 w-3 shrink-0 text-[var(--accent)]" />
                      Meeting place: {m.placeName}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export function OverviewFormCards({
  items,
  formsHref,
}: {
  items: OverviewForm[];
  formsHref: string;
}) {
  if (items.length === 0) return null;
  return (
    <Card className="min-w-0 overflow-hidden p-4">
      <SectionHeader title="Forms" href={formsHref} count={items.length} />
      <div className="flex flex-wrap gap-2">
        {items.slice(0, 6).map((form) => (
          <Link
            key={form.id}
            href={form.href}
            className="inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--accent-soft)]/40"
          >
            <span className="truncate font-semibold">{form.name}</span>
            <Badge
              variant={statusTone(form.statusToneKey)}
              className="shrink-0 text-[10px]"
            >
              {form.statusLabel}
            </Badge>
          </Link>
        ))}
      </div>
    </Card>
  );
}
