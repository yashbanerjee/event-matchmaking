import { Module, forwardRef } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { MeetingsModule } from '../meetings/meetings.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [forwardRef(() => MeetingsModule), SettingsModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
