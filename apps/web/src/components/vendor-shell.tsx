'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { clearTokens, getAccessToken } from '@/lib/auth-store';
import { apiFetch } from '@/lib/api';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';
import { DemoNotice } from './demo-footer';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { WorkspaceBottomNav } from './workspace-bottom-nav';

const NAV_ITEMS = [
  { href: '/vendor', label: 'Home', exact: true },
  { href: '/vendor/forms', label: 'Forms' },
  { href: '/vendor/requests', label: 'Requests' },
  { href: '/vendor/meetings', label: 'Meetings' },
  { href: '/vendor/qr', label: 'QR' },
];

function SidebarNav({
  pathname,
  pendingForms,
  openRequests,
}: {
  pathname: string;
  pendingForms: number;
  openRequests: number;
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
        const badge =
          item.href === '/vendor/forms'
            ? pendingForms
            : item.href === '/vendor/requests'
              ? openRequests
              : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex min-w-0 items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-white/8',
              active &&
                'bg-[var(--sidebar-active)] font-semibold text-white shadow-sm ring-1 ring-white/10',
            )}
          >
            <span className="truncate">{item.label}</span>
            {badge > 0 ? (
              <Badge
                variant="accent"
                className="shrink-0 border-transparent bg-[var(--accent)] text-[var(--accent-foreground)]"
              >
                {badge}
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

  const requests = useQuery({
    queryKey: ['meeting-requests'],
    queryFn: () =>
      apiFetch<{ items: Array<{ status: string }> }>('/meeting-requests', {
        token: getAccessToken(),
      }),
  });

  const openRequests = (requests.data?.items ?? []).filter((r) =>
    ['PENDING', 'INTEREST_ACCEPTED', 'AWAITING_CONFIRMATION'].includes(
      r.status,
    ),
  ).length;

  return (
    <div className="admin-shell workspace-shell has-mobile-tabs">
      <header className="glass-panel sticky top-0 z-30 rounded-none border-x-0 border-t-0 sm:hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
              Guest panel
            </p>
            <div className="h-display truncate text-base font-bold tracking-tight">
              {BRAND.name}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-10 shrink-0 gap-1.5 px-3"
            aria-label="Sign out"
            onClick={() => {
              clearTokens();
              router.push('/login');
            }}
          >
            <LogOut className="h-4 w-4" />
            <span className="text-xs font-semibold">Out</span>
          </Button>
        </div>
        <div className="border-t border-[var(--border)] px-4 py-1.5">
          <DemoNotice />
        </div>
      </header>

      <aside
        id="vendor-sidebar"
        className="admin-sidebar sidebar-pad-bottom hidden flex-col gap-6 overflow-y-auto overflow-x-hidden bg-[var(--sidebar)] px-4 pt-5 text-[var(--sidebar-fg)] sm:sticky sm:top-0 sm:flex sm:h-screen"
      >
        <div className="min-w-0 px-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--highlight)]">
            Guest panel
          </p>
          <div className="mt-1 h-display text-xl font-bold tracking-tight">
            {BRAND.name}
          </div>
          {email ? (
            <p
              className="mt-2 truncate text-xs text-[var(--sidebar-muted)]"
              title={email}
            >
              {email}
            </p>
          ) : null}
        </div>

        <SidebarNav
          pathname={pathname}
          pendingForms={pendingForms}
          openRequests={openRequests}
        />

        <div className="mt-auto space-y-3 border-t border-white/10 pt-4">
          <DemoNotice tone="dark" className="px-1 lg:hidden" />
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
        <div className="page-shell w-full max-w-full min-w-0 space-y-5 sm:space-y-6">
          {children}
        </div>
      </main>

      <WorkspaceBottomNav
        items={[
          { href: '/vendor', label: 'Home', exact: true, icon: 'home' },
          {
            href: '/vendor/forms',
            label: 'Forms',
            icon: 'forms',
            badge: pendingForms,
          },
          {
            href: '/vendor/requests',
            label: 'Requests',
            icon: 'requests',
            badge: openRequests,
          },
          { href: '/vendor/meetings', label: 'Meetings', icon: 'meetings' },
          { href: '/vendor/qr', label: 'QR', icon: 'qr' },
        ]}
      />
    </div>
  );
}
