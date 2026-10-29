import { cn } from '@/lib/utils';

const tones: Record<string, string> = {
  default: 'bg-slate-100 text-slate-700',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  danger: 'bg-rose-50 text-rose-700 border-rose-200',
  info: 'bg-sky-50 text-sky-800 border-sky-200',
  accent: 'bg-[var(--highlight-soft)] text-[var(--foreground)] border-[color-mix(in_srgb,var(--highlight)_35%,white)]',
  secondary: 'bg-slate-50 text-slate-600 border-slate-200',
};

export function Badge({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: keyof typeof tones;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
        tones[variant] ?? tones.default,
        className,
      )}
      {...props}
    />
  );
}
