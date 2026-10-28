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
  { href: '/admin/invitations', label: 'Invitations' },
  { href: '/admin/forms', label: 'Form Builder' },
  { href: '/admin/matchmaking', label: 'Matchmaking' },
  { href: '/admin/meetings', label: 'Meetings' },
  { href: '/admin/jobs', label: 'Background Jobs' },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr]">
      <aside className="bg-[var(--sidebar)] text-[var(--sidebar-fg)] p-4 flex flex-col gap-6">
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
                pathname === item.href && 'bg-white/15',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto">
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
      <main className="p-8">{children}</main>
    </div>
  );
}
