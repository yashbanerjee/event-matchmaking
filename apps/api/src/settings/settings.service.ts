import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/decorators';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const [settings, flags] = await Promise.all([
      this.prisma.systemSetting.findMany({ orderBy: { key: 'asc' } }),
      this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } }),
    ]);
    return { settings, flags };
  }

  async upsertSetting(actor: AuthUser, key: string, value: unknown) {
    const setting = await this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue },
      update: { value: value as Prisma.InputJsonValue },
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'settings.upsert',
      entityType: 'SystemSetting',
      entityId: setting.id,
      outcome: 'SUCCESS',
      after: { key, value },
    });
    return setting;
  }

  async setFlag(actor: AuthUser, key: string, enabled: boolean) {
    const flag = await this.prisma.featureFlag.upsert({
      where: { key },
      create: { key, enabled },
      update: { enabled },
    });
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
}
