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
  const [weekStart, setWeekStart] = useState(() => {
    const today = startOfDay(new Date());
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay());
    return start;
  });
  const today = startOfDay(new Date());
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Array<{ id: string; title: string; time: string; tone: string }>>();
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
        tone: 'meeting',
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
        tone: 'request',
      });
    }
    for (const [, bucket] of map) {
      bucket.sort((a, b) => a.time.localeCompare(b.time));
    }
    return map;
  }, [days, meetings, requests, myOrgIds]);

  const title = `${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${addDays(weekStart, 6).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  return (
    <Card className="min-w-0 overflow-hidden p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarDays className="h-4 w-4 text-[var(--accent)]" />
          <div className="min-w-0">
            <h2 className="h-display text-base font-semibold tracking-tight">
              This week
            </h2>
            <p className="truncate text-xs text-[var(--muted)]">{title}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous week"
            className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-black/5"
            onClick={() => setWeekStart((d) => addDays(d, -7))}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2 text-xs"
            onClick={() => {
              const t = startOfDay(new Date());
              const s = new Date(t);
              s.setDate(t.getDate() - t.getDay());
              setWeekStart(s);
            }}
          >
            Today
          </Button>
          <button
            type="button"
            aria-label="Next week"
            className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-black/5"
            onClick={() => setWeekStart((d) => addDays(d, 7))}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <Link href={meetingsHref}>
            <Button size="sm" variant="ghost" className="h-8 px-2 text-xs">
              Full calendar
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const isToday = sameDay(day, today);
          const events = eventsByDay.get(day.toDateString()) ?? [];
          return (
            <div
              key={day.toISOString()}
              className={cn(
                'min-h-[7.5rem] rounded-xl border p-1.5',
                isToday
                  ? 'border-[var(--accent)]/50 bg-[var(--accent-soft)]/50'
                  : 'border-[var(--border)] bg-[var(--card-elevated)]',
              )}
            >
              <div className="mb-1 flex items-center justify-between gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                  {day.toLocaleDateString(undefined, { weekday: 'short' })}
                </span>
                <span
                  className={cn(
                    'inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold',
                    isToday &&
                      'bg-[var(--accent)] text-[var(--accent-foreground)]',
                  )}
                >
                  {day.getDate()}
                </span>
              </div>
              <div className="space-y-1">
                {events.slice(0, 3).map((event) => (
                  <div
                    key={event.id}
                    className={cn(
                      'rounded-md px-1 py-0.5 text-[10px] leading-tight',
                      event.tone === 'meeting'
                        ? 'bg-[var(--accent)]/20 text-[var(--foreground)]'
                        : 'bg-amber-100 text-amber-950',
                    )}
                    title={`${event.time} ${event.title}`}
                  >
                    <span className="font-semibold opacity-80">{event.time}</span>
                    <p className="truncate">{event.title}</p>
                  </div>
                ))}
                {events.length > 3 ? (
                  <p className="px-0.5 text-[10px] text-[var(--muted)]">
                    +{events.length - 3} more
                  </p>
                ) : null}
                {events.length === 0 ? (
                  <p className="px-0.5 pt-2 text-center text-[10px] text-[var(--muted)]/70">
                    —
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
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
