import Link from 'next/link';
import { BRAND } from '@/lib/brand';

export function DemoFooter({
  tone = 'light',
}: {
  tone?: 'light' | 'dark' | 'sidebar';
}) {
  const styles =
    tone === 'dark' || tone === 'sidebar'
      ? 'border-white/10 text-white/55'
      : 'border-[var(--border)] text-[var(--muted)]';

  return (
    <footer
      className={`mt-auto border-t px-4 py-4 text-center text-xs leading-relaxed sm:px-6 ${styles}`}
    >
      <p>
        {BRAND.demoNote}{' '}
        <Link
          href={BRAND.siteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={
            tone === 'light'
              ? 'font-semibold text-[var(--foreground)] underline-offset-2 hover:underline'
              : 'font-semibold text-white/80 underline-offset-2 hover:underline'
          }
        >
          {BRAND.name}
        </Link>
      </p>
    </footer>
  );
}
