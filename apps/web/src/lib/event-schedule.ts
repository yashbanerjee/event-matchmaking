export const EVENT_TIME_ZONE = 'Asia/Dubai';
export const EVENT_UTC_OFFSET = '+04:00';
export const DEFAULT_EVENT_DATES = ['2026-12-07', '2026-12-08', '2026-12-09'];
export const DEFAULT_EVENT_ACTIVE_START = '09:00';
export const DEFAULT_EVENT_ACTIVE_END = '17:00';

export type EventSchedule = {
  dates: string[];
  start: string | null;
  end: string | null;
  activeStart: string;
  activeEnd: string;
  durationMinutes: number;
};

export function parseEventDates(raw: unknown): string[] {
  const text = raw == null ? '' : String(raw);
  const dates = text
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter((part) => /^\d{4}-\d{2}-\d{2}$/.test(part));
  return [...new Set(dates)].sort();
}

export function isHm(value: string): boolean {
  return /^\d{2}:\d{2}$/.test(value);
}

export function parseYmdLocal(ymd: string): Date {
  const [year, month, day] = ymd.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  return new Date(year, month - 1, day);
}

export function formatEventDate(
  ymd: string,
  style: 'chip' | 'short' | 'long' = 'chip',
) {
  const date = parseYmdLocal(ymd);
  if (Number.isNaN(date.getTime())) return ymd;
  if (style === 'long') {
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
  }
  if (style === 'short') {
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function eventDateTimeToIso(ymd: string, hm: string): string {
  const time = isHm(hm) ? hm : '09:00';
  return new Date(`${ymd}T${time}:00${EVENT_UTC_OFFSET}`).toISOString();
}

function dubaiParts(instant: Date) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: EVENT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: EVENT_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const hour = timeParts.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = timeParts.find((part) => part.type === 'minute')?.value ?? '00';
  return { date, time: `${hour}:${minute}` };
}

export function isoToEventDateTime(iso: string): { date: string; time: string } {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    return { date: '', time: '' };
  }
  return dubaiParts(instant);
}

export function normalizeEventSchedule(
  input?: Partial<EventSchedule> | null,
): EventSchedule {
  const dates = (input?.dates ?? []).filter((date) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date),
  );
  const resolved = dates.length > 0 ? [...new Set(dates)].sort() : DEFAULT_EVENT_DATES;
  const activeStart = isHm(input?.activeStart ?? '')
    ? input!.activeStart!
    : DEFAULT_EVENT_ACTIVE_START;
  const activeEnd = isHm(input?.activeEnd ?? '')
    ? input!.activeEnd!
    : DEFAULT_EVENT_ACTIVE_END;
  return {
    dates: resolved,
    start: input?.start ?? resolved[0] ?? null,
    end: input?.end ?? resolved[resolved.length - 1] ?? null,
    activeStart,
    activeEnd,
    durationMinutes:
      input?.durationMinutes && input.durationMinutes > 0
        ? input.durationMinutes
        : 15,
  };
}

export function hourFromHm(value: string, fallback: number) {
  const [hour] = (isHm(value) ? value : '').split(':').map(Number);
  return Number.isFinite(hour) ? hour : fallback;
}
