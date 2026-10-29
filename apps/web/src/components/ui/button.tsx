import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--accent)] text-[var(--accent-foreground)] shadow-sm hover:bg-[var(--accent-hover)]',
        outline:
          'border border-[var(--border)] bg-white/70 text-[var(--foreground)] hover:bg-white hover:border-[var(--accent)]/40',
        ghost: 'hover:bg-black/5 text-[var(--foreground)]',
        secondary:
          'bg-[var(--highlight-soft)] text-[var(--highlight)] hover:brightness-95',
        danger: 'bg-[var(--danger)] text-white hover:opacity-90',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-xs rounded-lg',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Shows a spinner and disables the button while an action is in progress. */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      loading = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <Loader2
          className={cn(
            'shrink-0 animate-spin',
            size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4',
          )}
          aria-hidden
        />
      ) : null}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
