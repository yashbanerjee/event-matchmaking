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
        <div className="flex w-full items-center justify-between gap-4 p-6 lg:px-8 lg:py-5">
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
      <main className="page-pad w-full">
        <div className="w-full pb-2">{children}</div>
      </main>
    </div>
  );
}
