import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/decorators';
import { EffectiveConfigService } from './effective-config.service';
import {
  INTEGRATION_SETTING_FIELDS,
  SECRET_SETTING_KEYS,
  maskSecret,
} from './integration-settings.catalog';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly effective: EffectiveConfigService,
  ) {}

  async list() {
    const [settings, flags] = await Promise.all([
      this.prisma.systemSetting.findMany({ orderBy: { key: 'asc' } }),
      this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } }),
    ]);

    const integration = await this.listIntegrationSettings();

    return {
      settings: settings.map((s) => ({
        ...s,
        value: SECRET_SETTING_KEYS.has(s.key)
          ? maskSecret(
              typeof s.value === 'object' &&
                s.value !== null &&
                'value' in (s.value as object)
                ? (s.value as { value: unknown }).value
                : s.value,
            )
          : s.value,
      })),
      flags,
      integration,
    };
  }

  async listIntegrationSettings() {
    const groups = ['email', 'storage', 'ai', 'ops'] as const;
    const result = [];

    for (const group of groups) {
      const fields = INTEGRATION_SETTING_FIELDS.filter((f) => f.group === group);
      const items = [];
      for (const field of fields) {
        const envDefault = this.effective.envFallback(field);
        const effective = await this.effective.getRaw(field.key);
        const stored = await this.prisma.systemSetting.findUnique({
          where: { key: field.key },
        });
        const hasOverride = Boolean(stored);
        const displayValue = field.secret
          ? maskSecret(effective)
          : effective ?? '';
        items.push({
          key: field.key,
          envKey: field.envKey,
          label: field.label,
          description: field.description,
          type: field.type,
          secret: Boolean(field.secret),
          options: field.options,
          envDefault: field.secret ? maskSecret(envDefault) : envDefault,
          value: displayValue,
          hasOverride,
          configured: field.secret
            ? Boolean(effective && String(effective).length > 0)
            : true,
        });
      }
      result.push({
        id: group,
        title:
          group === 'email'
            ? 'Email'
            : group === 'storage'
              ? 'Object storage'
              : group === 'ai'
                ? 'AI providers'
                : 'Operations',
        fields: items,
      });
    }

    return result;
  }

  async upsertSetting(actor: AuthUser, key: string, value: unknown) {
    const field = INTEGRATION_SETTING_FIELDS.find((f) => f.key === key);
    if (field) {
      this.validateField(field.type, value, field.options);
    }

    // Ignore blank secret updates so masked placeholders do not wipe keys
    if (field?.secret && (value === '' || value === null || value === undefined)) {
      const existing = await this.prisma.systemSetting.findUnique({
        where: { key },
      });
      return existing;
    }

    const setting = await this.prisma.systemSetting.upsert({
      where: { key },
      create: {
        key,
        value: { value } as Prisma.InputJsonValue,
      },
      update: {
        value: { value } as Prisma.InputJsonValue,
      },
    });

    this.effective.invalidate();

    await this.audit.record({
      actorId: actor.id,
      action: 'settings.upsert',
      entityType: 'SystemSetting',
      entityId: setting.id,
      outcome: 'SUCCESS',
      after: {
        key,
        value: SECRET_SETTING_KEYS.has(key) ? '[redacted]' : value,
      },
    });

    return {
      ...setting,
      value: SECRET_SETTING_KEYS.has(key) ? maskSecret(value) : { value },
    };
  }

  async upsertMany(
    actor: AuthUser,
    values: Array<{ key: string; value: unknown }>,
  ) {
    const byKey = new Map(values.map((item) => [item.key, item.value]));
    const start = String(byKey.get('ops.meetingWindowStart') ?? '').trim();
    const end = String(byKey.get('ops.meetingWindowEnd') ?? '').trim();
    if (
      /^\d{4}-\d{2}-\d{2}$/.test(start) &&
      /^\d{4}-\d{2}-\d{2}$/.test(end) &&
      start > end
    ) {
      throw new BadRequestException(
        'Meeting period start must be on or before the end date',
      );
    }

    const results = [];
    for (const item of values) {
      results.push(await this.upsertSetting(actor, item.key, item.value));
    }
    return { updated: results.length, items: results };
  }

  async setFlag(actor: AuthUser, key: string, enabled: boolean) {
    const flag = await this.prisma.featureFlag.upsert({
      where: { key },
      create: { key, enabled },
      update: { enabled },
    });

    // Keep ops.semanticSearch / ai.enabled in sync when matching flag keys are toggled
    if (key === 'ai_enabled') {
      await this.upsertSetting(actor, 'ai.enabled', enabled);
    }
    if (key === 'semantic_search') {
      await this.upsertSetting(actor, 'ops.semanticSearch', enabled);
    }

    await this.audit.record({
      actorId: actor.id,
      action: 'feature_flag.set',
      entityType: 'FeatureFlag',
      entityId: flag.id,
      outcome: 'SUCCESS',
      after: { key, enabled },
    });
    return flag;
  }

  private validateField(
    type: string,
    value: unknown,
    options?: string[],
  ) {
    if (type === 'boolean' && typeof value !== 'boolean') {
      if (value !== 'true' && value !== 'false') {
        throw new BadRequestException('Boolean value required');
      }
    }
    if (type === 'number' && !Number.isFinite(Number(value))) {
      throw new BadRequestException('Numeric value required');
    }
    if (type === 'select' && options && !options.includes(String(value))) {
      throw new BadRequestException(`Value must be one of: ${options.join(', ')}`);
    }
    if (type === 'date') {
      const text = value == null ? '' : String(value).trim();
      if (text && !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        throw new BadRequestException('Date must be YYYY-MM-DD');
      }
    }
  }
}
