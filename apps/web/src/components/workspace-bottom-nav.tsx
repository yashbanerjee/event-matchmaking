'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  ClipboardList,
  Home,
  Inbox,
  QrCode,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
  badge?: number;
  icon: 'home' | 'forms' | 'requests' | 'meetings' | 'qr';
};

const ICONS = {
  home: Home,
  forms: ClipboardList,
  requests: Inbox,
  meetings: CalendarDays,
  qr: QrCode,
} as const;

export function WorkspaceBottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname() ?? '';

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_94%,transparent)] px-2 pt-1 backdrop-blur-md sm:hidden"
      style={{
        paddingBottom: 'max(0.35rem, env(safe-area-inset-bottom, 0px))',
      }}
      aria-label="Primary"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5 gap-1">
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
                  'relative flex flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[10px] font-semibold tracking-wide transition-colors',
                  active
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-hover)]'
                    : 'text-[var(--muted)] hover:bg-[var(--card-elevated)] hover:text-[var(--foreground)]',
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span>{item.label}</span>
                {(item.badge ?? 0) > 0 ? (
                  <span className="absolute right-2 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-bold text-[var(--accent-foreground)]">
                    {item.badge}
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
