'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clearTokens } from '@/lib/auth-store';
import { Button } from './ui/button';

export function PortalShell({
  email,
  children,
}: {
  email?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
              Participant portal
            </p>
            <div className="h-display text-lg font-bold">Event Matchmaking</div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {email ? (
              <span className="hidden text-sm text-[var(--muted)] sm:inline">
                {email}
              </span>
            ) : null}
            <Link href="/admin">
              <Button variant="ghost" size="sm">
                Admin
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                clearTokens();
                router.push('/login');
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="page-shell mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
