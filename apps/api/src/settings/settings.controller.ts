import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@em/shared';
import {
  CurrentUser,
  RequirePermissions,
  type AuthUser,
} from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  list() {
    return this.settings.list();
  }

  @Get('integrations')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  integrations() {
    return this.settings.listIntegrationSettings();
  }

  @Put('values')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  upsert(
    @CurrentUser() user: AuthUser,
    @Body() body: { key: string; value: unknown },
  ) {
    return this.settings.upsertSetting(user, body.key, body.value);
  }

  @Put('integrations')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  upsertMany(
    @CurrentUser() user: AuthUser,
    @Body() body: { values: Array<{ key: string; value: unknown }> },
  ) {
    return this.settings.upsertMany(user, body.values ?? []);
  }

  @Put('flags')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  flag(
    @CurrentUser() user: AuthUser,
    @Body() body: { key: string; enabled: boolean },
  ) {
    return this.settings.setFlag(user, body.key, body.enabled);
  }
}
