'use client';

import { ExternalLink, MapPinned, Navigation } from 'lucide-react';
import {
  formatPlaceLabel,
  hasMapPoint,
  mapsNavigateUrl,
  mapsViewUrl,
  type MapPoint,
} from '@/lib/maps';
import { cn } from '@/lib/utils';

export function MeetingPlaceLink({
  place,
  fallback,
  className,
  compact,
}: {
  place?: MapPoint | null;
  fallback?: string | null;
  className?: string;
  compact?: boolean;
}) {
  const label =
    formatPlaceLabel(place) ||
    fallback?.trim() ||
    null;
  const canMap = hasMapPoint(place) || Boolean(fallback?.trim());
  const point: MapPoint = place ?? { name: fallback };
  const navigateHref = canMap ? mapsNavigateUrl(point) : null;
  const viewHref = canMap ? mapsViewUrl(point) : null;

  if (!label) {
    return <span className={cn('text-[var(--muted)]', className)}>—</span>;
  }

  return (
    <div className={cn('min-w-0', className)}>
      <p className="truncate font-medium">{label}</p>
      {place?.mapAddress && place.mapAddress !== place.location ? (
        <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
          {place.mapAddress}
        </p>
      ) : null}
      {navigateHref || viewHref ? (
        <div className={cn('mt-1.5 flex flex-wrap gap-2', compact && 'mt-1')}>
          {viewHref ? (
            <a
              href={viewHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-white px-2 py-0.5 text-[11px] font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
            >
              <MapPinned className="h-3 w-3 text-[var(--accent)]" />
              Map
              <ExternalLink className="h-3 w-3 text-[var(--muted)]" />
            </a>
          ) : null}
          {navigateHref ? (
            <a
              href={navigateHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--foreground)] transition hover:brightness-[0.98]"
            >
              <Navigation className="h-3 w-3 text-[var(--accent-hover)]" />
              Navigate
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
