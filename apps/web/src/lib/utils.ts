import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getApiBase() {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
}

/** Enterprise-style near dates: "Just now", "2h ago", "Yesterday", else local date. */
export function formatNearDate(value: string | Date | null | undefined): {
  label: string;
  title: string;
} {
  if (!value) return { label: '—', title: '' };
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return { label: '—', title: '' };

  const title = date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const now = Date.now();
  const diffMs = now - date.getTime();
  const absMs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (absMs < minute) {
    return { label: diffMs >= 0 ? 'Just now' : 'In a moment', title };
  }
  if (absMs < hour) {
    const mins = Math.max(1, Math.round(absMs / minute));
    return {
      label: diffMs >= 0 ? `${mins}m ago` : `In ${mins}m`,
      title,
    };
  }
  if (absMs < day) {
    const hours = Math.max(1, Math.round(absMs / hour));
    return {
      label: diffMs >= 0 ? `${hours}h ago` : `In ${hours}h`,
      title,
    };
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfDate = new Date(date);
  startOfDate.setHours(0, 0, 0, 0);
  const dayDiff = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / day,
  );
  if (dayDiff === 1) return { label: 'Yesterday', title };
  if (dayDiff === -1) return { label: 'Tomorrow', title };
  if (dayDiff > 1 && dayDiff < 7) {
    return { label: `${dayDiff}d ago`, title };
  }
  if (dayDiff < -1 && dayDiff > -7) {
    return { label: `In ${Math.abs(dayDiff)}d`, title };
  }

  return {
    label: date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }),
    title,
  };
}
