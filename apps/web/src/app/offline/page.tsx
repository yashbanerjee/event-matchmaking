import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Offline · Event Matchmaking',
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-center shadow-[var(--shadow)]">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
          Offline
        </p>
        <h1 className="h-display text-3xl">You&apos;re offline</h1>
        <p className="text-sm text-[var(--muted)]">
          Matchmaking and meeting updates need a connection. Reconnect to
          discover partners, send requests, and confirm schedules.
        </p>
        <Link href="/">
          <Button className="w-full">Try again</Button>
        </Link>
      </div>
    </main>
  );
}
