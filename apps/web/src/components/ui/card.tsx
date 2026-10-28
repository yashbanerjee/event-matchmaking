import { cn } from '@/lib/utils';

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm',
        className,
      )}
      {...props}
    />
  );
}
