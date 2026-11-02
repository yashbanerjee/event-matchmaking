import { Global, Module, forwardRef } from '@nestjs/common';
import { MeetingsModule } from '../meetings/meetings.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { EffectiveConfigService } from './effective-config.service';

@Global()
@Module({
  imports: [forwardRef(() => MeetingsModule)],
  controllers: [SettingsController],
  providers: [SettingsService, EffectiveConfigService],
  exports: [SettingsService, EffectiveConfigService],
})
export class SettingsModule {}
