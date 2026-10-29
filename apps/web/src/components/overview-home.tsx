'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
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
}: {
  title: string;
  href: string;
  count?: number;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="h-display text-lg font-semibold tracking-tight">
          {title}
          {typeof count === 'number' ? (
            <span className="ml-2 text-sm font-medium text-[var(--muted)]">
              ({count})
            </span>
          ) : null}
        </h2>
      </div>
      <Link href={href} className="shrink-0">
        <Button size="sm" variant="outline">
          View all
        </Button>
      </Link>
    </div>
  );
}

export function OverviewStatStrip({
  items,
}: {
  items: Array<{ label: string; value: ReactNode; accent?: boolean }>;
}) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={
            item.accent
              ? 'min-w-[9.5rem] shrink-0 rounded-2xl border border-transparent bg-[linear-gradient(145deg,#26e2c6,#1bc4ab)] px-4 py-3 text-[var(--accent-foreground)] sm:min-w-0'
              : 'min-w-[9.5rem] shrink-0 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 shadow-[var(--shadow)] sm:min-w-0'
          }
        >
          <p
            className={
              item.accent
                ? 'text-xs text-[var(--accent-foreground)]/70'
                : 'text-xs text-[var(--muted)]'
            }
          >
            {item.label}
          </p>
          <p className="mt-1 truncate text-2xl font-bold tracking-tight">
            {item.value}
          </p>
        </div>
      ))}
    </div>
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
    <Card className="min-w-0 overflow-hidden">
      <SectionHeader
        title="Meeting requests"
        href={requestsHref}
        count={items.length}
      />
      {items.length === 0 ? (
        <EmptyState
          title="No open requests"
          description="Request a meeting from recommendations, or wait for an incoming invite."
        />
      ) : (
        <div className="grid gap-3">
          {items.slice(0, 5).map((req) => {
            const counterpart = mine.has(req.fromOrg.id)
              ? req.toOrg.name
              : req.fromOrg.name;
            const direction = mine.has(req.fromOrg.id) ? 'Outgoing' : 'Incoming';
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
                    <p className="mt-1 truncate font-semibold" title={counterpart}>
                      {counterpart}
                    </p>
                    {req.message ? (
                      <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">
                        {req.message}
                      </p>
                    ) : null}
                  </div>
                  <Badge variant={statusTone(req.status)} className="shrink-0">
                    {req.status.replaceAll('_', ' ')}
                  </Badge>
                </div>
                <p className="mt-3 text-xs text-[var(--muted)]">
                  {req.proposedStartsAt
                    ? `${new Date(req.proposedStartsAt).toLocaleString()}${
                        req.place ? ` · ${req.place.name}` : ''
                      }`
                    : 'Time not proposed yet'}
                </p>
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
    <Card className="min-w-0 overflow-hidden">
      <SectionHeader
        title="Upcoming meetings"
        href={meetingsHref}
        count={items.length}
      />
      {items.length === 0 ? (
        <EmptyState
          title="No meetings yet"
          description="Confirmed schedules will show here with time and place."
        />
      ) : (
        <div className="grid gap-3">
          {items.slice(0, 5).map((m) => (
            <div
              key={m.id}
              className="rounded-2xl border border-[var(--border)] bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold" title={m.counterpartyName}>
                    {m.counterpartyName}
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {new Date(m.startsAt).toLocaleString()}
                  </p>
                  {m.placeName ? (
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {m.placeName}
                    </p>
                  ) : null}
                </div>
                <Badge variant={statusTone(m.status)} className="shrink-0">
                  {m.status.replaceAll('_', ' ')}
                </Badge>
              </div>
            </div>
          ))}
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
  return (
    <Card className="min-w-0 overflow-hidden">
      <SectionHeader title="Forms" href={formsHref} count={items.length} />
      {items.length === 0 ? (
        <EmptyState
          title="No forms assigned"
          description="Assigned forms will appear here with status and fill date."
        />
      ) : (
        <div className="grid gap-3">
          {items.slice(0, 5).map((form) => (
            <Link
              key={form.id}
              href={form.href}
              className="block rounded-2xl border border-[var(--border)] bg-white p-4 transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--accent-soft)]/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold" title={form.name}>
                    {form.name}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {form.filledOn
                      ? `Filled ${new Date(form.filledOn).toLocaleString()}`
                      : 'Not submitted yet'}
                  </p>
                </div>
                <Badge
                  variant={statusTone(form.statusToneKey)}
                  className="shrink-0"
                >
                  {form.statusLabel}
                </Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
