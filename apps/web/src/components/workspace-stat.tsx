import { cn } from '@/lib/utils';

export function WorkspaceStat({
  label,
  value,
  tone = 'default',
  className,
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'accent' | 'highlight';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'min-w-0 overflow-hidden rounded-[var(--radius)] border p-4 shadow-[var(--shadow)]',
        tone === 'default' &&
          'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]',
        tone === 'accent' &&
          'border-transparent bg-[linear-gradient(145deg,#26e2c6,#1bc4ab)] text-[var(--accent-foreground)]',
        tone === 'highlight' &&
          'border-transparent bg-[linear-gradient(145deg,#1bc4ab,#0f9f8c)] text-white',
        className,
      )}
    >
      <p
        className={cn(
          'truncate text-sm',
          tone === 'default'
            ? 'text-[var(--muted)]'
            : tone === 'accent'
              ? 'text-[var(--accent-foreground)]/70'
              : 'text-white/75',
        )}
      >
        {label}
      </p>
      <p className="mt-2 truncate text-3xl font-bold tracking-tight">{value}</p>
    </div>
  );
}
