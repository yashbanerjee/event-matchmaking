'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearTokens } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/companies', label: 'Companies' },
  { href: '/admin/vendors', label: 'Vendors' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/invitations', label: 'Invitations' },
  { href: '/admin/workflows', label: 'Onboarding Workflows' },
  { href: '/admin/forms', label: 'Form Builder' },
  { href: '/admin/profiles', label: 'Profiles' },
  { href: '/admin/matchmaking', label: 'Matchmaking' },
  { href: '/admin/schedules', label: 'Schedule Management' },
  { href: '/admin/meetings', label: 'Meetings' },
  { href: '/admin/feedback', label: 'Feedback' },
  { href: '/admin/follow-ups', label: 'Follow-ups' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/notifications', label: 'Notifications' },
  { href: '/admin/jobs', label: 'Background Jobs' },
  { href: '/admin/integrations', label: 'Integration Health' },
  { href: '/admin/audit', label: 'Audit Logs' },
  { href: '/admin/settings', label: 'System Settings' },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="min-h-screen grid grid-cols-[260px_1fr]">
      <aside className="bg-[var(--sidebar)] text-[var(--sidebar-fg)] p-4 flex flex-col gap-6 overflow-y-auto">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Platform
          </div>
          <div className="text-lg font-semibold mt-1">Matchmaking</div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'rounded-md px-3 py-2 text-sm hover:bg-white/10',
                (pathname === item.href ||
                  (item.href !== '/admin' && pathname.startsWith(item.href))) &&
                  'bg-white/15',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto pt-4">
          <Button
            variant="outline"
            className="w-full border-slate-600 text-slate-100"
            onClick={() => {
              clearTokens();
              router.push('/login');
            }}
          >
            Sign out
          </Button>
        </div>
      </aside>
      <main className="p-8 overflow-auto">{children}</main>
    </div>
  );
}
