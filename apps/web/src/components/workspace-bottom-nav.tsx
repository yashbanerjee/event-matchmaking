'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  ClipboardList,
  Home,
  Inbox,
  QrCode,
  Sparkles,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
  badge?: number;
  icon:
    | 'home'
    | 'forms'
    | 'recommendations'
    | 'requests'
    | 'meetings'
    | 'innovators'
    | 'qr';
};

const ICONS = {
  home: Home,
  forms: ClipboardList,
  recommendations: Sparkles,
  requests: Inbox,
  meetings: CalendarDays,
  innovators: Users,
  qr: QrCode,
} as const;

export function WorkspaceBottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname() ?? '';

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_96%,transparent)] px-1.5 pt-1.5 shadow-[0_-8px_24px_rgba(10,10,10,0.06)] backdrop-blur-xl sm:hidden"
      style={{
        paddingBottom: 'max(0.45rem, env(safe-area-inset-bottom, 0px))',
      }}
      aria-label="Primary"
    >
      <ul
        className={cn(
          'mx-auto grid max-w-lg gap-0.5',
          items.length <= 2
            ? 'grid-cols-2'
            : items.length === 4
              ? 'grid-cols-4'
              : items.length >= 6
                ? 'grid-cols-6'
                : 'grid-cols-5',
        )}
      >
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10px] font-semibold tracking-wide transition-colors active:scale-[0.97]',
                  active
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-hover)]'
                    : 'text-[var(--muted)] hover:bg-[var(--card-elevated)] hover:text-[var(--foreground)]',
                )}
              >
                <Icon
                  className={cn('h-5 w-5', active && 'stroke-[2.25]')}
                  aria-hidden
                />
                <span className="truncate">{item.label}</span>
                {(item.badge ?? 0) > 0 ? (
                  <span
                    className={cn(
                      'absolute right-1.5 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white',
                      item.icon === 'recommendations'
                        ? 'bg-red-600'
                        : 'bg-[var(--accent)] text-[var(--accent-foreground)]',
                    )}
                  >
                    {(item.badge ?? 0) > 99 ? '99+' : item.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
