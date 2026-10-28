import { cn } from '@/lib/utils';

const styles: Record<string, string> = {
  default: 'bg-slate-900 text-white',
  secondary: 'bg-slate-100 text-slate-800',
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-900',
  danger: 'bg-red-100 text-red-800',
  outline: 'border border-[var(--border)] text-[var(--foreground)]',
};

export function Badge({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: keyof typeof styles;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}
