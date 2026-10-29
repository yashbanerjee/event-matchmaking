'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { clearTokens } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

const NAV_ITEMS = [
  { href: '/vendor', label: 'Overview', exact: true },
  { href: '/vendor/forms', label: 'Forms' },
  { href: '/vendor/requests', label: 'Requests' },
  { href: '/vendor/meetings', label: 'Meetings' },
];

function SidebarNav({
  pathname,
  pendingForms,
  onNavigate,
}: {
  pathname: string;
  pendingForms: number;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-1 pb-4">
      <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--sidebar-muted)]">
        Workspace
      </p>
      {NAV_ITEMS.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex min-w-0 items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-white/8',
              active &&
                'bg-[var(--sidebar-active)] font-semibold text-white shadow-sm ring-1 ring-white/10',
            )}
          >
            <span className="truncate">{item.label}</span>
            {item.href === '/vendor/forms' && pendingForms > 0 ? (
              <Badge
                variant="accent"
                className="shrink-0 border-transparent bg-[var(--accent)] text-white"
              >
                {pendingForms}
              </Badge>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function VendorShell({
  email,
  pendingForms = 0,
  children,
}: {
  email?: string;
  pendingForms?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [navOpen]);

  return (
    <div className="admin-shell workspace-shell">
      <header className="glass-panel sticky top-0 z-30 flex items-center gap-3 rounded-none border-x-0 border-t-0 px-4 py-3 sm:hidden">
        <Button
          type="button"
          variant="outline"
          className="h-10 w-10 shrink-0 px-0"
          aria-expanded={navOpen}
          aria-controls="vendor-sidebar"
          aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
          onClick={() => setNavOpen((open) => !open)}
        >
          {navOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
            Guest panel
          </p>
          <div className="h-display truncate text-base font-bold tracking-tight">
            Event Matchmaking
          </div>
        </div>
      </header>

      {navOpen ? (
        <button
          type="button"
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-40 bg-black/45 sm:hidden"
          onClick={() => setNavOpen(false)}
        />
      ) : null}

      <aside
        id="vendor-sidebar"
        className={cn(
          'admin-sidebar sidebar-pad-bottom fixed inset-y-0 left-0 z-50 flex max-w-full flex-col gap-6 overflow-y-auto overflow-x-hidden bg-[var(--sidebar)] px-4 pt-5 text-[var(--sidebar-fg)] transition-transform duration-200 ease-out sm:sticky sm:top-0 sm:z-auto sm:h-screen sm:translate-x-0 sm:transition-none',
          navOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0',
        )}
      >
        <div className="flex items-start justify-between gap-3 px-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--sidebar-muted)]">
              Guest panel
            </p>
            <div className="mt-1 h-display text-xl font-bold tracking-tight">
              Event Matchmaking
            </div>
            {email ? (
              <p className="mt-2 truncate text-xs text-[var(--sidebar-muted)]" title={email}>
                {email}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-9 w-9 shrink-0 px-0 text-[var(--sidebar-fg)] hover:bg-white/10 sm:hidden"
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <SidebarNav
          pathname={pathname}
          pendingForms={pendingForms}
          onNavigate={() => setNavOpen(false)}
        />

        <div className="mt-auto space-y-2 border-t border-white/10 pt-4">
          <Button
            variant="outline"
            className="w-full border-white/20 bg-transparent text-[var(--sidebar-fg)] hover:bg-white/10"
            onClick={() => {
              clearTokens();
              router.push('/login');
            }}
          >
            Sign out
          </Button>
        </div>
      </aside>

      <main className="page-pad workspace-main min-h-screen min-w-0 overflow-x-hidden">
        <div className="page-shell w-full max-w-full min-w-0 space-y-6">
          {children}
        </div>
      </main>
    </div>
  );
}
