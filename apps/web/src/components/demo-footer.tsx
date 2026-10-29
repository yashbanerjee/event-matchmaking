'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';

export function DemoFooter() {
  const pathname = usePathname() || '';
  const offsetSidebar =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/portal') ||
    pathname.startsWith('/vendor');

  return (
    <footer
      className={cn(
        'demo-footer fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_92%,transparent)] backdrop-blur-md',
        offsetSidebar && 'sm:left-[var(--sidebar-width)]',
      )}
    >
      <div className="mx-auto flex min-h-9 items-center justify-center gap-1.5 px-4 pb-[env(safe-area-inset-bottom,0px)] text-[11px] leading-none text-[var(--muted)] sm:min-h-10 sm:text-xs">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--highlight)]"
          aria-hidden
        />
        <p className="truncate py-2.5">
          Demo exclusively for{' '}
          <Link
            href={BRAND.siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[var(--foreground)] underline-offset-2 hover:text-[var(--highlight)] hover:underline"
          >
            {BRAND.name}
          </Link>
        </p>
      </div>
    </footer>
  );
}
