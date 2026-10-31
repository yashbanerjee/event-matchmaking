'use client';

import { cn } from '@/lib/utils';
import { formatEventDate, parseYmdLocal } from '@/lib/event-schedule';

export function EventDateChips({
  dates,
  value,
  onChange,
  allowEmpty,
  className,
}: {
  dates: string[];
  value: string;
  onChange: (ymd: string) => void;
  allowEmpty?: boolean;
  className?: string;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {allowEmpty ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className={cn(
            'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
            !value
              ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--foreground)]'
              : 'border-[var(--border)] bg-[var(--card-elevated)] text-[var(--muted)] hover:border-[var(--accent)]/40',
          )}
        >
          All days
        </button>
      ) : null}
      {dates.map((ymd) => {
        const day = parseYmdLocal(ymd);
        const isToday =
          day.getFullYear() === today.getFullYear() &&
          day.getMonth() === today.getMonth() &&
          day.getDate() === today.getDate();
        const selected = value === ymd;
        return (
          <button
            key={ymd}
            type="button"
            onClick={() => onChange(ymd)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
              selected
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--foreground)]'
                : 'border-[var(--border)] bg-white text-[var(--muted)] hover:border-[var(--accent)]/40 hover:text-[var(--foreground)]',
            )}
          >
            {formatEventDate(ymd)}
            {isToday ? ' · today' : ''}
          </button>
        );
      })}
    </div>
  );
}
