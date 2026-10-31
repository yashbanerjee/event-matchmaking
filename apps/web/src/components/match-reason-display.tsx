'use client';

export function MatchReasonDisplay({
  aiDescription,
  reasons,
  compact = false,
  maxBullets,
  lineClamp = compact ? 2 : 0,
}: {
  aiDescription?: string | null;
  reasons?: string[] | null;
  compact?: boolean;
  /** Cap bullets shown (overview tables). */
  maxBullets?: number;
  /** 0 = no clamp; 1–3 = tailwind line-clamp-N on each bullet. */
  lineClamp?: 0 | 1 | 2 | 3;
}) {
  const all =
    reasons?.filter(Boolean).map((r) => r.trim()) ??
    (aiDescription?.trim() ? [aiDescription.trim()] : []);
  const bullets =
    maxBullets != null && maxBullets > 0
      ? all.slice(0, maxBullets)
      : all;
  const clampClass =
    lineClamp === 1
      ? 'line-clamp-1'
      : lineClamp === 2
        ? 'line-clamp-2'
        : lineClamp === 3
          ? 'line-clamp-3'
          : '';

  if (bullets.length === 0) {
    return <span className="text-[var(--muted)]">—</span>;
  }

  if (bullets.length === 1) {
    return (
      <p
        className={
          compact
            ? `min-w-0 text-xs leading-snug text-[var(--muted)] ${clampClass}`
            : `text-sm leading-relaxed text-[var(--muted)] ${clampClass}`
        }
      >
        {bullets[0]}
      </p>
    );
  }

  return (
    <ul
      className={
        compact
          ? 'min-w-0 list-disc space-y-0.5 pl-3.5 text-xs leading-snug text-[var(--muted)]'
          : 'min-w-0 list-disc space-y-1 pl-4 text-sm leading-relaxed text-[var(--muted)]'
      }
    >
      {bullets.map((line, i) => (
        <li key={`${i}-${line.slice(0, 24)}`} className={clampClass}>
          {line}
        </li>
      ))}
    </ul>
  );
}
