'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { PEER_RECOMMENDATIONS_ABSOLUTE_MAX } from '@em/shared';
import { LogOut } from 'lucide-react';
import { clearTokens, getAccessToken } from '@/lib/auth-store';
import { apiFetch } from '@/lib/api';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { WorkspaceBottomNav } from './workspace-bottom-nav';

const NAV_ITEMS = [
  { href: '/portal', label: 'Home', exact: true },
  { href: '/portal/onboarding', label: 'Forms' },
  { href: '/portal/recommendations', label: 'Recommendations' },
  { href: '/portal/requests', label: 'Requests' },
  { href: '/portal/meetings', label: 'Meetings' },
  { href: '/portal/innovators', label: 'Innovators' },
];

function CountPill({
  count,
  tone = 'accent',
}: {
  count: number;
  tone?: 'accent' | 'danger';
}) {
  if (count <= 0) return null;
  if (tone === 'danger') {
    return (
      <span
        className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold tabular-nums leading-none text-white"
        aria-label={`${count} recommendations`}
      >
        {count > 99 ? '99+' : count}
      </span>
    );
  }
  return (
    <Badge
      variant="accent"
      className="shrink-0 border-transparent bg-[var(--accent)] text-[var(--accent-foreground)]"
    >
      {count}
    </Badge>
  );
}

function SidebarNav({
  pathname,
  pendingForms,
  openRequests,
  recommendationCount,
}: {
  pathname: string;
  pendingForms: number;
  openRequests: number;
  recommendationCount: number;
}) {
  const items =
    pendingForms > 0
      ? NAV_ITEMS.filter(
          (item) =>
            item.href === '/portal' || item.href === '/portal/onboarding',
        )
      : NAV_ITEMS.filter((item) => item.href !== '/portal/onboarding');

  return (
    <nav className="sidebar-nav flex flex-col gap-1 pb-4">
      <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--sidebar-muted)]">
        {pendingForms > 0 ? 'Finish setup' : 'Workspace'}
      </p>
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const badge =
          item.href === '/portal/onboarding'
            ? pendingForms
            : item.href === '/portal/recommendations'
              ? recommendationCount
              : item.href === '/portal/requests'
                ? openRequests
                : 0;
        const tone =
          item.href === '/portal/recommendations' ? 'danger' : 'accent';
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
            <CountPill count={badge} tone={tone} />
          </Link>
        );
      })}
    </nav>
  );
}

export function PortalShell({
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
    enabled: pendingForms <= 0,
    queryFn: () =>
      apiFetch<{ items: Array<{ status: string }> }>('/meeting-requests', {
        token: getAccessToken(),
      }),
  });

  const recommendations = useQuery({
    queryKey: ['recommendations'],
    enabled: pendingForms <= 0,
    staleTime: 30_000,
    queryFn: () =>
      apiFetch<{
        items: Array<{
          organizationId: string;
          type: 'COMPANY' | 'VENDOR';
          score: number;
          matchSource?: string;
        }>;
        featured: Array<{
          organizationId: string;
          type: 'COMPANY' | 'VENDOR';
          score: number;
          matchSource?: string;
        }>;
        perspective: 'COMPANY' | 'VENDOR' | null;
      }>(`/recommendations?limit=${PEER_RECOMMENDATIONS_ABSOLUTE_MAX}`, {
        token: getAccessToken(),
      }),
  });

  const openRequests = (requests.data?.items ?? []).filter((r) =>
    ['PENDING', 'INTEREST_ACCEPTED', 'AWAITING_CONFIRMATION'].includes(
      r.status,
    ),
  ).length;

  const recommendationCount = (() => {
    const perspective = recommendations.data?.perspective ?? null;
    const allowed =
      perspective === 'COMPANY'
        ? 'VENDOR'
        : perspective === 'VENDOR'
          ? 'COMPANY'
          : null;
    const qualify = (item: {
      organizationId: string;
      type: 'COMPANY' | 'VENDOR';
      score: number;
      matchSource?: string;
    }) => {
      if (allowed && item.type !== allowed) return false;
      if (item.matchSource === 'admin') return true;
      return Number.isFinite(item.score) && item.score > 0;
    };
    const ids = new Set<string>();
    for (const item of [
      ...(recommendations.data?.featured ?? []),
      ...(recommendations.data?.items ?? []),
    ]) {
      if (qualify(item)) ids.add(item.organizationId);
    }
    return ids.size;
  })();

  const bottomItems =
    pendingForms > 0
      ? [
          { href: '/portal', label: 'Home', exact: true, icon: 'home' as const },
          {
            href: '/portal/onboarding',
            label: 'Forms',
            icon: 'forms' as const,
            badge: pendingForms,
          },
        ]
      : [
          { href: '/portal', label: 'Home', exact: true, icon: 'home' as const },
          {
            href: '/portal/recommendations',
            label: 'Matches',
            icon: 'recommendations' as const,
            badge: recommendationCount,
          },
          {
            href: '/portal/requests',
            label: 'Requests',
            icon: 'requests' as const,
            badge: openRequests,
          },
          { href: '/portal/meetings', label: 'Meetings', icon: 'meetings' as const },
          {
            href: '/portal/innovators',
            label: 'Innovators',
            icon: 'innovators' as const,
          },
        ];

  return (
    <div className="admin-shell workspace-shell has-mobile-tabs">
      <header
        className="glass-panel sticky top-0 z-30 rounded-none border-x-0 border-t-0 sm:hidden"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
              Investor
            </p>
            <div className="h-display truncate text-base font-bold tracking-tight">
              {BRAND.name}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-11 shrink-0 gap-1.5 px-3"
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
      </header>

      <aside
        id="portal-sidebar"
        className="admin-sidebar hidden flex-col gap-6 bg-[var(--sidebar)] px-4 pt-5 text-[var(--sidebar-fg)] sm:flex"
      >
        <div className="min-w-0 shrink-0 px-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--highlight)]">
            Investor panel
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
          recommendationCount={recommendationCount}
        />

        <div className="sidebar-footer mt-auto space-y-3 border-t border-white/10 pt-4">
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

      <main className="page-pad workspace-main min-h-dvh min-w-0 overflow-x-hidden">
        <div className="page-shell w-full max-w-full min-w-0 space-y-5 sm:space-y-6">
          {children}
        </div>
      </main>

      <WorkspaceBottomNav items={bottomItems} />
    </div>
  );
}
