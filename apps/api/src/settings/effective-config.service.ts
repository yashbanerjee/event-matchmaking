import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EnvService } from '../config/env.service';
import {
  INTEGRATION_SETTING_FIELDS,
  type SettingFieldDef,
} from './integration-settings.catalog';

const EVENT_TIME_ZONE = 'Asia/Dubai';
const DEFAULT_EVENT_DATES = ['2026-12-07', '2026-12-08', '2026-12-09'];
const DEFAULT_ACTIVE_START = '09:00';
const DEFAULT_ACTIVE_END = '17:00';

export type MeetingBookingWindow = {
  start: string | null;
  end: string | null;
  dates: string[];
  activeStart: string;
  activeEnd: string;
};

function parseEventDates(raw: string): string[] {
  const dates = raw
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter((part) => /^\d{4}-\d{2}-\d{2}$/.test(part));
  return [...new Set(dates)].sort();
}

function parseHm(value: string): number {
  if (!/^\d{2}:\d{2}$/.test(value)) return NaN;
  const [hour, minute] = value.split(':').map(Number) as [number, number];
  return hour * 60 + minute;
}

function formatInTimeZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

function minutesInTimeZone(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(
    parts.find((part) => part.type === 'minute')?.value ?? 0,
  );
  return hour * 60 + minute;
}

/**
 * Resolves Admin → System Settings over code/env bootstrap defaults.
 * Email, storage, AI, and ops params are managed in the admin UI (not .env).
 */
@Injectable()
export class EffectiveConfigService {
  private cache: Map<string, unknown> | null = null;
  private cacheAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly env: EnvService,
  ) {}

  invalidate() {
    this.cache = null;
  }

  async getRaw(key: string): Promise<unknown> {
    const map = await this.load();
    return map.get(key);
  }

  async getString(key: string, fallback = ''): Promise<string> {
    const value = await this.getRaw(key);
    if (value === undefined || value === null || value === '') {
      return fallback;
    }
    return String(value);
  }

  async getBoolean(key: string, fallback = false): Promise<boolean> {
    const value = await this.getRaw(key);
    if (value === undefined || value === null || value === '') {
      return fallback;
    }
    if (typeof value === 'boolean') return value;
    return String(value).toLowerCase() === 'true' || String(value) === '1';
  }

  async getNumber(key: string, fallback: number): Promise<number> {
    const value = await this.getRaw(key);
    if (value === undefined || value === null || value === '') {
      return fallback;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  /** Event days and active hours configured in Admin → Event dates. */
  async getMeetingBookingWindow(): Promise<MeetingBookingWindow> {
    const datesRaw = (await this.getString('ops.eventDates', '')).trim();
    const dates = parseEventDates(datesRaw);
    const resolvedDates = dates.length > 0 ? dates : DEFAULT_EVENT_DATES;
    const startRaw = (await this.getString('ops.meetingWindowStart', '')).trim();
    const endRaw = (await this.getString('ops.meetingWindowEnd', '')).trim();
    const start =
      resolvedDates[0] ??
      (/^\d{4}-\d{2}-\d{2}$/.test(startRaw) ? startRaw : null);
    const end =
      resolvedDates[resolvedDates.length - 1] ??
      (/^\d{4}-\d{2}-\d{2}$/.test(endRaw) ? endRaw : null);
    const activeStartRaw = (
      await this.getString('ops.eventActiveStart', DEFAULT_ACTIVE_START)
    ).trim();
    const activeEndRaw = (
      await this.getString('ops.eventActiveEnd', DEFAULT_ACTIVE_END)
    ).trim();
    return {
      start,
      end,
      dates: resolvedDates,
      activeStart: /^\d{2}:\d{2}$/.test(activeStartRaw)
        ? activeStartRaw
        : DEFAULT_ACTIVE_START,
      activeEnd: /^\d{2}:\d{2}$/.test(activeEndRaw)
        ? activeEndRaw
        : DEFAULT_ACTIVE_END,
    };
  }

  assertDateInMeetingWindow(
    dateYmd: string,
    window: MeetingBookingWindow,
  ): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }
    if (window.dates.length > 0 && !window.dates.includes(dateYmd)) {
      throw new BadRequestException(
        `Meetings can only be booked on event dates: ${window.dates.join(', ')}`,
      );
    }
    if (window.start && dateYmd < window.start) {
      throw new BadRequestException(
        `Meetings can only be booked from ${window.start} onward`,
      );
    }
    if (window.end && dateYmd > window.end) {
      throw new BadRequestException(
        `Meetings can only be booked through ${window.end}`,
      );
    }
  }

  assertInstantInMeetingWindow(
    instant: Date,
    window: MeetingBookingWindow,
    durationMinutes = 0,
  ): void {
    if (Number.isNaN(instant.getTime())) {
      throw new BadRequestException('Invalid start time');
    }
    const ymd = formatInTimeZone(instant, EVENT_TIME_ZONE);
    this.assertDateInMeetingWindow(ymd, window);

    const startMin = parseHm(window.activeStart);
    const endMin = parseHm(window.activeEnd);
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) return;

    const minutes = minutesInTimeZone(instant, EVENT_TIME_ZONE);
    if (minutes < startMin) {
      throw new BadRequestException(
        `Meetings can only start from ${window.activeStart} (event time)`,
      );
    }
    const latestStart = Math.max(startMin, endMin - Math.max(0, durationMinutes));
    if (minutes >= endMin || (durationMinutes > 0 && minutes > latestStart)) {
      throw new BadRequestException(
        `Meetings must finish by ${window.activeEnd} (event time)`,
      );
    }
  }

  envFallback(field: SettingFieldDef): unknown {
    const raw = this.env.raw as Record<string, unknown>;
    return raw[field.envKey];
  }

  private async load(): Promise<Map<string, unknown>> {
    const now = Date.now();
    if (this.cache && now - this.cacheAt < 5_000) {
      return this.cache;
    }

    const map = new Map<string, unknown>();
    for (const field of INTEGRATION_SETTING_FIELDS) {
      map.set(field.key, this.envFallback(field));
    }

    const rows = await this.prisma.systemSetting.findMany({
      where: {
        key: { in: INTEGRATION_SETTING_FIELDS.map((f) => f.key) },
      },
    });
    for (const row of rows) {
      const stored = row.value as { value?: unknown } | unknown;
      const value =
        stored &&
        typeof stored === 'object' &&
        stored !== null &&
        'value' in (stored as object)
          ? (stored as { value: unknown }).value
          : stored;
      if (value !== undefined && value !== null && value !== '') {
        map.set(row.key, value);
      }
    }

    this.cache = map;
    this.cacheAt = now;
    return map;
  }
}
