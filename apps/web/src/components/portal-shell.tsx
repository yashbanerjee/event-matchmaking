'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearTokens } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';

export function PortalShell({
  email,
  pendingForms = 0,
  children,
}: {
  email?: string;
  pendingForms?: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-white/80 backdrop-blur-md">
        <div className="flex w-full flex-wrap items-center justify-between gap-4 p-6 lg:px-8 lg:py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
              Participant portal
            </p>
            <div className="h-display text-lg font-bold">Event Matchmaking</div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Link
              href="/portal/onboarding"
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium',
                pathname?.startsWith('/portal/onboarding')
                  ? 'bg-[var(--accent-soft)] text-[var(--accent-hover)]'
                  : 'text-[var(--foreground)] hover:bg-[var(--card-elevated)]',
              )}
            >
              Forms
              {pendingForms > 0 ? (
                <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[11px] font-semibold text-white">
                  {pendingForms}
                </span>
              ) : null}
            </Link>
            <Link
              href="/portal"
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium',
                pathname === '/portal'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent-hover)]'
                  : 'text-[var(--foreground)] hover:bg-[var(--card-elevated)]',
              )}
            >
              Meetings
            </Link>
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
      <main className="page-pad w-full min-h-[calc(100dvh-4.5rem)]">
        <div className="w-full">{children}</div>
      </main>
    </div>
  );
}
