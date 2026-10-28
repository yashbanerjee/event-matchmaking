'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearTokens } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';

const NAV_GROUPS = [
  {
    label: 'Operate',
    items: [
      { href: '/admin', label: 'Overview' },
      { href: '/admin/companies', label: 'Companies' },
      { href: '/admin/vendors', label: 'Vendors' },
    ],
  },
  {
    label: 'Match & meet',
    items: [
      { href: '/admin/forms', label: 'Forms' },
      { href: '/admin/workflows', label: 'Workflows' },
      { href: '/admin/profiles', label: 'Profiles' },
      { href: '/admin/matchmaking', label: 'Matchmaking' },
      { href: '/admin/schedules', label: 'Schedules' },
      { href: '/admin/meetings', label: 'Meetings' },
      { href: '/admin/feedback', label: 'Feedback' },
      { href: '/admin/follow-ups', label: 'Follow-ups' },
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

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[272px_1fr]">
      <aside className="flex flex-col gap-6 overflow-y-auto bg-[var(--sidebar)] px-4 py-5 text-[var(--sidebar-fg)] lg:sticky lg:top-0 lg:h-screen">
        <div className="px-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--sidebar-muted)]">
            Admin
          </p>
          <div className="mt-1 h-display text-xl font-bold tracking-tight">
            Event Matchmaking
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-5">
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

        <div className="mt-auto space-y-2 border-t border-white/10 pt-4">
          <Link href="/portal">
            <Button variant="ghost" className="w-full justify-start text-[var(--sidebar-fg)] hover:bg-white/10">
              Open participant portal
            </Button>
          </Link>
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

      <main className="min-h-screen p-6 lg:p-8">
        <div className="w-full">{children}</div>
      </main>
    </div>
  );
}
