import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top,#d1fae5,transparent_40%),linear-gradient(180deg,#f8fafc,#eef2ff)]">
      <div className="max-w-xl text-center px-6">
        <p className="text-sm uppercase tracking-[0.25em] text-teal-800 mb-3">
          Event Matchmaking
        </p>
        <h1 className="text-4xl font-semibold tracking-tight mb-4">
          Company & vendor meeting management
        </h1>
        <p className="text-[var(--muted)] mb-8">
          Invite organizations, run explainable matchmaking, publish schedules,
          and capture independent meeting outcomes.
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/login">
            <Button size="lg">Sign in</Button>
          </Link>
          <Link href="/register">
            <Button size="lg" variant="outline">
              Accept invitation
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
