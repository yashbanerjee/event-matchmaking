'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { clearTokens } from '@/lib/auth-store';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';

const NAV_GROUPS = [
  {
    label: 'Operate',
    items: [
      { href: '/admin', label: 'Overview' },
      { href: '/admin/companies', label: 'Investor' },
      { href: '/admin/vendors', label: 'Innovators' },
    ],
  },
  {
    label: 'Match & meet',
    items: [
      { href: '/admin/forms', label: 'Forms' },
      { href: '/admin/filters', label: 'Filters' },
      { href: '/admin/matchmaking', label: 'Matchmaking' },
      { href: '/admin/recommendations', label: 'Recommendations' },
      { href: '/admin/meetings', label: 'Meetings' },
      { href: '/admin/places', label: 'Places' },
      { href: '/admin/feedback', label: 'Feedback' },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/admin/reports', label: 'Reports' },
      { href: '/admin/notifications', label: 'Notifications' },
      { href: '/admin/jobs', label: 'Jobs' },
      { href: '/admin/integrations', label: 'Integrations' },
      { href: '/admin/audit', label: 'Audit' },
      { href: '/admin/settings', label: 'Settings' },
    ],
  },
];

function SidebarNav({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="sidebar-nav flex flex-col gap-5 pb-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="space-y-1">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--sidebar-muted)]">
            {group.label}
          </p>
          {group.items.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== '/admin' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  'block rounded-xl px-3 py-2 text-sm transition-colors hover:bg-white/8',
                  active &&
                    'bg-[var(--sidebar-active)] font-semibold text-white shadow-sm ring-1 ring-white/10',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

const PREFETCH_HREFS = [
  ...NAV_GROUPS.flatMap((group) => group.items.map((item) => item.href)),
  '/vendor',
  '/portal',
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    PREFETCH_HREFS.forEach((href) => router.prefetch(href));
  }, [router]);

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

  const signOut = () => {
    clearTokens();
    router.push('/login');
  };

  const pageTitle =
    NAV_GROUPS.flatMap((group) => group.items)
      .filter((item) =>
        item.href === '/admin'
          ? pathname === '/admin'
          : pathname === item.href || pathname.startsWith(`${item.href}/`),
      )
      .sort((a, b) => b.href.length - a.href.length)[0]?.label ?? 'Admin';

  return (
    <div className="admin-shell">
      <header
        className="glass-panel sticky top-0 z-30 rounded-none border-x-0 border-t-0 sm:hidden"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-11 shrink-0 px-0"
            aria-expanded={navOpen}
            aria-controls="admin-sidebar"
            aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
            onClick={() => setNavOpen((open) => !open)}
          >
            {navOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
              {BRAND.name}
            </p>
            <div className="h-display truncate text-base font-bold tracking-tight">
              {pageTitle}
            </div>
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
        id="admin-sidebar"
        className={cn(
          'admin-sidebar z-50 flex max-w-full flex-col gap-6 bg-[var(--sidebar)] px-4 pt-5 text-[var(--sidebar-fg)] transition-transform duration-200 ease-out sm:translate-x-0 sm:transition-none',
          navOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0',
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--highlight)]">
              {BRAND.name}
            </p>
            <div className="mt-1 h-display text-xl font-bold tracking-tight">
              {BRAND.product}
            </div>
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

        <SidebarNav pathname={pathname} onNavigate={() => setNavOpen(false)} />

        <div className="sidebar-footer mt-auto space-y-2 border-t border-white/10 pt-4">
          <Link href="/vendor" onClick={() => setNavOpen(false)}>
            <Button
              variant="ghost"
              className="w-full justify-start text-[var(--sidebar-fg)] hover:bg-white/10"
            >
              Open innovator panel
            </Button>
          </Link>
          <Link href="/portal" onClick={() => setNavOpen(false)}>
            <Button
              variant="ghost"
              className="w-full justify-start text-[var(--sidebar-fg)] hover:bg-white/10"
            >
              Open investor portal
            </Button>
          </Link>
          <Button
            variant="outline"
            className="w-full border-white/20 bg-transparent text-[var(--sidebar-fg)] hover:bg-white/10"
            onClick={signOut}
          >
            Sign out
          </Button>
        </div>
      </aside>

      <main className="page-pad min-h-dvh min-w-0 overflow-x-hidden">
        <div className="page-shell w-full max-w-full min-w-0 space-y-5 sm:space-y-6">
          {children}
        </div>
      </main>
    </div>
  );
}
