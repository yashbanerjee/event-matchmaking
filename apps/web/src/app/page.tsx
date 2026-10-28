import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(15,118,110,0.18),transparent_42%),linear-gradient(210deg,rgba(3,105,161,0.16),transparent_40%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 top-16 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,rgba(15,118,110,0.28),transparent_68%)] blur-2xl animate-fade"
      />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="h-display text-xl font-bold tracking-tight">
          Event Matchmaking
        </div>
        <div className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="ghost">Sign in</Button>
          </Link>
          <Link href="/register">
            <Button>Accept invitation</Button>
          </Link>
        </div>
      </header>

      <section className="relative z-10 mx-auto grid min-h-[78vh] max-w-6xl items-center gap-10 px-6 pb-16 pt-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="animate-rise space-y-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--accent)]">
            Event Matchmaking
          </p>
          <h1 className="max-w-xl text-5xl leading-[1.05] text-[var(--foreground)] md:text-6xl">
            Company & vendor meetings, orchestrated with clarity.
          </h1>
          <p className="max-w-lg text-base leading-relaxed text-[var(--muted)] md:text-lg">
            Invite organizations, run explainable matchmaking, publish schedules,
            and capture confidential outcomes — one polished workspace for
            operators and participants.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/login">
              <Button size="lg">Sign in to workspace</Button>
            </Link>
            <Link href="/register">
              <Button size="lg" variant="outline">
                Join with invitation
              </Button>
            </Link>
          </div>
        </div>

        <div className="animate-rise glass-panel relative rounded-[1.5rem] p-6 md:p-8" style={{ animationDelay: '120ms' }}>
          <div className="absolute -left-3 -top-3 rounded-full bg-[var(--accent)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
            Live ops
          </div>
          <div className="space-y-5">
            <div>
              <p className="text-sm text-[var(--muted)]">Today&apos;s flow</p>
              <p className="mt-1 h-display text-2xl">Match → Schedule → Confirm</p>
            </div>
            <div className="grid gap-3">
              {[
                ['Admin control', 'Invites, forms, scoring, publish'],
                ['Vendor portal', 'Confirm meetings & confidential feedback'],
                ['Audit-ready', 'Jobs, notifications, and settings'],
              ].map(([title, body]) => (
                <div
                  key={title}
                  className="rounded-2xl border border-[var(--border)] bg-white/80 px-4 py-3"
                >
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-[var(--muted)]">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
