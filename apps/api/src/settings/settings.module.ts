import { Global, Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { EffectiveConfigService } from './effective-config.service';

@Global()
@Module({
  controllers: [SettingsController],
  providers: [SettingsService, EffectiveConfigService],
  exports: [SettingsService, EffectiveConfigService],
})
export class SettingsModule {}
