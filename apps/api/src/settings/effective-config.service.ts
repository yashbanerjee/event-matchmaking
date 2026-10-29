import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EnvService } from '../config/env.service';
import {
  INTEGRATION_SETTING_FIELDS,
  type SettingFieldDef,
} from './integration-settings.catalog';

export type MeetingBookingWindow = {
  start: string | null;
  end: string | null;
};

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

  /** Inclusive YYYY-MM-DD booking period configured in Admin → Operations. */
  async getMeetingBookingWindow(): Promise<MeetingBookingWindow> {
    const startRaw = (await this.getString('ops.meetingWindowStart', '')).trim();
    const endRaw = (await this.getString('ops.meetingWindowEnd', '')).trim();
    const start = /^\d{4}-\d{2}-\d{2}$/.test(startRaw) ? startRaw : null;
    const end = /^\d{4}-\d{2}-\d{2}$/.test(endRaw) ? endRaw : null;
    return { start, end };
  }

  assertDateInMeetingWindow(
    dateYmd: string,
    window: MeetingBookingWindow,
  ): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
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
  ): void {
    if (Number.isNaN(instant.getTime())) {
      throw new BadRequestException('Invalid start time');
    }
    const ymd = instant.toISOString().slice(0, 10);
    this.assertDateInMeetingWindow(ymd, window);
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
