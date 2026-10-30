import { Module } from '@nestjs/common';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { MeetingRequestsController } from './meeting-requests.controller';
import { MeetingRequestsService } from './meeting-requests.service';
import { RecommendationsService } from './recommendations.service';
import { PeerRecommendationsService } from './peer-recommendations.service';
import { MeetingReminderService } from './meeting-reminder.service';
import { QrController } from './qr.controller';
import { QrService } from './qr.service';
import { PeerRecommendationsController } from './peer-recommendations.controller';
import { FiltersModule } from '../filters/filters.module';
import { PlacesModule } from '../places/places.module';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [FiltersModule, PlacesModule, IntegrationsModule],
  controllers: [
    MeetingsController,
    MeetingRequestsController,
    QrController,
    PeerRecommendationsController,
  ],
  providers: [
    MeetingsService,
    MeetingRequestsService,
    RecommendationsService,
    PeerRecommendationsService,
    MeetingReminderService,
    QrService,
  ],
  exports: [
    MeetingsService,
    MeetingRequestsService,
    RecommendationsService,
    PeerRecommendationsService,
    QrService,
  ],
})
export class MeetingsModule {}
