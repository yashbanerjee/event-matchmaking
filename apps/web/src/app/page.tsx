import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { BRAND, brandLabel } from '@/lib/brand';

const JOURNEY = [
  {
    title: 'Discover',
    body: 'State your objective — buy, sell, partner, invest, find expertise, or explore the floor.',
  },
  {
    title: 'Match',
    body: 'See recommended counterparties with clear explanations built for client ↔ guest fit.',
  },
  {
    title: 'Connect',
    body: 'Send and accept meeting requests with organizer control over who can see and contact whom.',
  },
  {
    title: 'Meet',
    body: 'Confirm when and where — including on-site place — from phone, tablet, or desktop.',
  },
] as const;

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(201,162,39,0.16),transparent_42%),linear-gradient(210deg,rgba(10,10,10,0.08),transparent_40%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 top-16 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,rgba(201,162,39,0.22),transparent_68%)] blur-2xl animate-fade"
      />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6 sm:py-6">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--highlight)]">
            {BRAND.name}
          </p>
          <div className="h-display truncate text-lg font-bold tracking-tight sm:text-xl">
            {BRAND.product}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/login">
            <Button variant="ghost" size="sm" className="sm:h-10 sm:px-4">
              Sign in
            </Button>
          </Link>
          <Link href="/register/event">
            <Button size="sm" className="sm:h-10 sm:px-4">
              Register for event
            </Button>
          </Link>
        </div>
      </header>

      <section className="relative z-10 mx-auto grid min-h-[70vh] w-full max-w-6xl items-center gap-10 px-4 pb-16 pt-4 sm:px-6 sm:pt-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="animate-rise space-y-5 sm:space-y-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--highlight)] sm:text-xs sm:tracking-[0.28em]">
            {BRAND.tagline}
          </p>
          <h1 className="max-w-xl text-4xl leading-[1.05] text-[var(--foreground)] sm:text-5xl md:text-6xl">
            Making moments
            <br />
            that matter —
            <br />
            starting with the right meeting.
          </h1>
          <p className="max-w-lg text-sm leading-relaxed text-[var(--muted)] sm:text-base md:text-lg">
            {brandLabel} helps Ethara event teams discover, match, connect, and
            confirm on-site meetings for clients and guests.
          </p>
          <div className="flex flex-wrap gap-3 pt-1 sm:pt-2">
            <Link href="/register/event">
              <Button size="lg">Register for event</Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline">
                Sign in
              </Button>
            </Link>
          </div>
        </div>

        <div
          className="animate-rise glass-panel relative rounded-[1.5rem] p-5 sm:p-6 md:p-8"
          style={{ animationDelay: '120ms' }}
        >
          <div className="absolute -left-2 -top-3 rounded-full bg-[var(--accent)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent-foreground)] sm:-left-3">
            Journey
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-[var(--muted)]">Event flow</p>
              <p className="mt-1 h-display text-xl sm:text-2xl">
                Discover → Match → Connect → Meet
              </p>
            </div>
            <div className="grid gap-3">
              {JOURNEY.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-[var(--border)] bg-white/80 px-4 py-3"
                >
                  <p className="font-semibold">{item.title}</p>
                  <p className="text-sm text-[var(--muted)]">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
