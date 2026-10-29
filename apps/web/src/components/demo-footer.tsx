'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';

export function DemoNotice({
  className,
  tone = 'light',
}: {
  className?: string;
  tone?: 'light' | 'dark';
}) {
  return (
    <p
      className={cn(
        'inline-flex min-w-0 max-w-full items-center gap-1.5 text-[10px] leading-tight sm:text-[11px]',
        tone === 'dark' ? 'text-[var(--sidebar-muted)]' : 'text-[var(--muted)]',
        className,
      )}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--highlight)]"
        aria-hidden
      />
      <span className="truncate">
        Demo exclusively for{' '}
        <Link
          href={BRAND.siteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'font-semibold underline-offset-2 hover:underline',
            tone === 'dark'
              ? 'text-[var(--sidebar-fg)] hover:text-[var(--highlight)]'
              : 'text-[var(--foreground)] hover:text-[var(--highlight)]',
          )}
        >
          {BRAND.name}
        </Link>
      </span>
    </p>
  );
}

export function DemoFooter() {
  const pathname = usePathname() || '';
  const inWorkspace =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/portal') ||
    pathname.startsWith('/vendor');

  return (
    <>
      {/* Mobile / tablet: top strip on public pages (workspace shells show it in the header) */}
      {!inWorkspace ? (
        <div className="sticky top-0 z-40 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_94%,transparent)] px-4 py-2 backdrop-blur-md lg:hidden">
          <div className="mx-auto flex justify-center">
            <DemoNotice />
          </div>
        </div>
      ) : null}

      {/* Desktop: fixed bottom bar */}
      <footer
        className={cn(
          'demo-footer fixed inset-x-0 bottom-0 z-40 hidden border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_92%,transparent)] backdrop-blur-md lg:block',
          inWorkspace && 'lg:left-[var(--sidebar-width)]',
        )}
      >
        <div className="mx-auto flex min-h-10 items-center justify-center px-4 pb-[env(safe-area-inset-bottom,0px)]">
          <DemoNotice className="py-2.5 text-xs" />
        </div>
      </footer>
    </>
  );
}
