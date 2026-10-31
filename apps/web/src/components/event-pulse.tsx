'use client';

import { Card } from '@/components/ui/card';
import {
  type ActivityRow,
  type EventPulse,
  formatHour,
  formatOutcome,
  pct,
} from '@/lib/event-pulse';
import { cn } from '@/lib/utils';

function Ring({
  value,
  label,
  caption,
}: {
  value: number;
  label: string;
  caption: string;
}) {
  const clamped = Math.max(0, Math.min(1, value || 0));
  const radius = 42;
  const circ = 2 * Math.PI * radius;
  const dash = circ * clamped;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 108 108" className="h-24 w-24 shrink-0">
        <circle
          cx="54"
          cy="54"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="10"
        />
        <circle
          cx="54"
          cy="54"
          r={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
          transform="rotate(-90 54 54)"
        />
        <text
          x="54"
          y="58"
          textAnchor="middle"
          className="fill-white"
          fontSize="18"
          fontFamily="var(--font-display)"
          fontWeight="700"
        >
          {pct(clamped)}
        </text>
      </svg>
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-white/50">
          {label}
        </p>
        <p className="mt-1 text-sm text-white/75">{caption}</p>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'live' | 'warn' | 'good';
}) {
  const tones = {
    default: 'text-white',
    live: 'text-[var(--accent)]',
    warn: 'text-amber-300',
    good: 'text-emerald-300',
  };
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 font-[family-name:var(--font-display)] text-3xl tracking-tight',
          tones[tone],
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-white/50">{hint}</p> : null}
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: string;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
          {eyebrow}
        </p>
        <h2 className="h-display text-lg tracking-tight">{title}</h2>
      </div>
      {action ? (
        <p className="text-xs text-[var(--muted)]">{action}</p>
      ) : null}
    </div>
  );
}

function UtilizationList({
  rows,
  empty,
}: {
  rows: ActivityRow[];
  empty: string;
}) {
  if (!rows.length) {
    return <p className="text-sm text-[var(--muted)]">{empty}</p>;
  }
  return (
    <div className="space-y-3">
      {rows.slice(0, 8).map((row) => (
        <div key={row.id}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="truncate font-medium">{row.name}</span>
            <span className="shrink-0 text-xs text-[var(--muted)]">
              {row.bookedToday}/{row.capacity} today · {row.bookedTotal} total
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-black/5">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                row.inMeeting
                  ? 'bg-[var(--accent)]'
                  : row.fillRate >= 1
                    ? 'bg-amber-500'
                    : 'bg-[var(--foreground)]',
              )}
              style={{ width: `${Math.min(100, row.fillRate * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EventPulseBoard({ data }: { data: EventPulse }) {
  const today = data.pulse.today;
  const event = data.pulse.event;
  const maxHour = Math.max(4, ...data.hourlyToday.map((h) => h.booked));
  const statusTotal = Math.max(
    1,
    data.statusBreakdown.reduce((sum, row) => sum + row.count, 0),
  );
  const ratingRows = [
    ['Quality', data.ratings.meetingQuality],
    ['Relevance', data.ratings.relevance],
    ['Potential', data.ratings.businessPotential],
    ['Communication', data.ratings.communicationQuality],
    ['Interest', data.ratings.interestLevel],
  ] as const;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[22px] bg-[#0a0a0a] text-white shadow-[var(--shadow)]">
        <div className="relative px-5 py-6 sm:px-7 sm:py-7">
          <div
            className="pointer-events-none absolute inset-0 opacity-80"
            style={{
              background:
                'radial-gradient(700px 280px at 8% -20%, rgba(38,226,198,0.28), transparent 55%), radial-gradient(520px 240px at 100% 0%, rgba(255,255,255,0.06), transparent 50%)',
            }}
          />
          <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
                </span>
                Event pulse · {data.today} · {data.timezone}
              </div>
              <h2 className="mt-2 max-w-xl font-[family-name:var(--font-display)] text-3xl tracking-tight sm:text-4xl">
                The floor, at a glance.
              </h2>
              <p className="mt-2 max-w-lg text-sm text-white/60">
                Investor–innovator meetings, capacity, and outcomes for today
                and the whole event.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-4">
                <Stat
                  label="Planned today"
                  value={today.planned}
                  hint={`${today.remaining} still to run`}
                />
                <Stat
                  label="Live now"
                  value={data.liveMeetings.length}
                  hint={`${data.investorsInMeeting} investors · ${data.innovatorsInMeeting} innovators`}
                  tone="live"
                />
                <Stat
                  label="Completed"
                  value={today.completed}
                  hint={`${event.completed} across the event`}
                  tone="good"
                />
                <Stat
                  label="Missed"
                  value={today.missed}
                  hint={`${pct(today.noShowRate)} of today’s book`}
                  tone={today.missed ? 'warn' : 'default'}
                />
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
              <Ring
                value={today.successRate || event.successRate}
                label="Meeting success"
                caption="Completed versus missed and cancelled"
              />
              <Ring
                value={today.feedbackCoverage || event.feedbackCoverage}
                label="Feedback in"
                caption={`${data.pendingFeedback} completed meetings still waiting`}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <SectionTitle
            eyebrow="Today"
            title="Meetings by hour"
            action="08:00–20:00 Dubai"
          />
          <div className="flex h-40 items-end gap-1.5 sm:gap-2">
            {data.hourlyToday.map((slot) => (
              <div
                key={slot.hour}
                className="flex min-w-0 flex-1 flex-col items-center gap-2"
              >
                <div className="flex h-28 w-full items-end rounded-lg bg-black/[0.04]">
                  <div
                    className="w-full rounded-lg bg-[linear-gradient(180deg,#26e2c6_0%,#0a0a0a_140%)]"
                    style={{
                      height: `${Math.max(slot.booked ? 12 : 3, (slot.booked / maxHour) * 100)}%`,
                    }}
                    title={`${formatHour(slot.hour)} · ${slot.booked}`}
                  />
                </div>
                <span className="text-[10px] text-[var(--muted)]">
                  {formatHour(slot.hour)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle eyebrow="Pipeline" title="Status mix" />
          <div className="mb-4 flex h-3 overflow-hidden rounded-full">
            {data.statusBreakdown.map((row) => (
              <div
                key={row.status}
                className={cn(
                  'h-full',
                  row.status === 'COMPLETED' && 'bg-emerald-600',
                  row.status === 'IN_PROGRESS' && 'bg-[var(--accent)]',
                  row.status === 'CONFIRMED' && 'bg-black',
                  row.status === 'NO_SHOW' && 'bg-rose-500',
                  row.status === 'CANCELLED' && 'bg-rose-300',
                  !['COMPLETED', 'IN_PROGRESS', 'CONFIRMED', 'NO_SHOW', 'CANCELLED'].includes(
                    row.status,
                  ) && 'bg-amber-400',
                )}
                style={{ width: `${(row.count / statusTotal) * 100}%` }}
              />
            ))}
          </div>
          <ul className="space-y-2 text-sm">
            {data.statusBreakdown.map((row) => (
              <li key={row.status} className="flex justify-between gap-3">
                <span className="capitalize text-[var(--muted)]">
                  {row.status.replaceAll('_', ' ').toLowerCase()}
                </span>
                <span className="font-semibold">{row.count}</span>
              </li>
            ))}
            {data.statusBreakdown.length === 0 ? (
              <li className="text-[var(--muted)]">No meetings yet.</li>
            ) : null}
          </ul>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle
            eyebrow="Investors"
            title="Meeting capacity"
            action={`${data.investorsAvailable} available`}
          />
          <UtilizationList
            rows={data.investorActivity}
            empty="No investors on the floor yet."
          />
        </Card>
        <Card>
          <SectionTitle
            eyebrow="Innovators"
            title="Meetings received"
            action={`${data.innovatorsAvailable} available`}
          />
          <UtilizationList
            rows={data.innovatorActivity}
            empty="No innovators on the floor yet."
          />
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card>
          <SectionTitle
            eyebrow="Ratings"
            title="After the meeting"
            action={
              data.ratings.sampleSize
                ? `${data.ratings.sampleSize} scores`
                : 'No scores yet'
            }
          />
          <p className="font-[family-name:var(--font-display)] text-4xl tracking-tight">
            {data.ratings.overall ? data.ratings.overall.toFixed(1) : '—'}
            <span className="ml-1 text-base text-[var(--muted)]">/ 5</span>
          </p>
          <div className="mt-4 space-y-3">
            {ratingRows.map(([label, value]) => (
              <div key={label}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-[var(--muted)]">{label}</span>
                  <span>{value ? value.toFixed(1) : '—'}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-black/5">
                  <div
                    className="h-full rounded-full bg-[var(--accent)]"
                    style={{ width: `${(value / 5) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle eyebrow="Outcomes" title="What happened next" />
          {data.outcomes.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              Feedback outcomes will land here after meetings close.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.outcomes.map((row) => (
                <span
                  key={row.outcome}
                  className="rounded-full border border-[var(--border)] bg-[var(--highlight-soft)] px-3 py-1 text-xs font-semibold capitalize"
                >
                  {formatOutcome(row.outcome)} · {row.count}
                </span>
              ))}
            </div>
          )}
          <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-[var(--muted)]">Follow-ups open</dt>
              <dd className="mt-1 text-xl font-semibold">
                {data.followUpsRequired}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Follow-up signals</dt>
              <dd className="mt-1 text-xl font-semibold">
                {data.ratings.followUpSignals}
              </dd>
            </div>
          </dl>
        </Card>

        <Card>
          <SectionTitle eyebrow="Floor" title="Availability now" />
          <div className="grid grid-cols-2 gap-4">
            {[
              ['Investors free', data.investorsAvailable],
              ['Innovators free', data.innovatorsAvailable],
              ['Investors idle', data.idleInvestors],
              ['Innovators idle', data.idleInnovators],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-2xl border border-[var(--border)] bg-[var(--card-elevated)] px-3 py-3"
              >
                <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
                  {label}
                </p>
                <p className="mt-1 font-[family-name:var(--font-display)] text-2xl">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle
          eyebrow="Live"
          title="Meetings on the floor"
          action={
            data.liveMeetings.length
              ? `${data.liveMeetings.length} in progress`
              : 'None live'
          }
        />
        {data.liveMeetings.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            When an investor starts a meeting, it appears here in real time.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {data.liveMeetings.map((meeting) => (
              <div
                key={meeting.id}
                className="rounded-2xl border border-[var(--border)] bg-[var(--highlight-soft)] px-4 py-3"
              >
                <p className="text-sm font-semibold">
                  {meeting.investor}{' '}
                  <span className="text-[var(--muted)]">×</span>{' '}
                  {meeting.innovator}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {meeting.place ?? 'Venue TBC'} ·{' '}
                  {new Date(meeting.startsAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  –
                  {new Date(meeting.endsAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="grid divide-y divide-[var(--border)] sm:grid-cols-2 sm:divide-x xl:grid-cols-4">
          {[
            ['Investors', data.totalCompanies],
            ['Innovators', data.totalVendors],
            ['Eligible profiles', data.eligibleParticipants],
            ['Generated matches', data.generatedMatches],
            ['Avg match score', data.averageMatchScore.toFixed(1)],
            ['Event meetings', event.planned],
            ['Pending invitations', data.pendingInvitations],
            ['Job failures', data.backgroundJobFailures],
          ].map(([label, value]) => (
            <div key={String(label)} className="px-4 py-3">
              <div className="text-xs font-medium text-[var(--muted)]">
                {label}
              </div>
              <div className="mt-1 text-xl font-semibold tracking-tight">
                {value}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
