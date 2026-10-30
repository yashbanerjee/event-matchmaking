import { Module } from '@nestjs/common';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { MeetingRequestsController } from './meeting-requests.controller';
import { MeetingRequestsService } from './meeting-requests.service';
import { RecommendationsService } from './recommendations.service';
import { MeetingReminderService } from './meeting-reminder.service';
import { QrController } from './qr.controller';
import { QrService } from './qr.service';
import { FiltersModule } from '../filters/filters.module';
import { PlacesModule } from '../places/places.module';

@Module({
  imports: [FiltersModule, PlacesModule],
  controllers: [MeetingsController, MeetingRequestsController, QrController],
  providers: [
    MeetingsService,
    MeetingRequestsService,
    RecommendationsService,
    MeetingReminderService,
    QrService,
  ],
  exports: [
    MeetingsService,
    MeetingRequestsService,
    RecommendationsService,
    QrService,
  ],
})
export class MeetingsModule {}
