import { cn } from '@/lib/utils';

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow)]',
        className,
      )}
      {...props}
    />
  );
}
