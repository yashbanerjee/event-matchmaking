import { Module } from '@nestjs/common';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { MeetingRequestsController } from './meeting-requests.controller';
import { MeetingRequestsService } from './meeting-requests.service';
import { RecommendationsService } from './recommendations.service';
import { FiltersModule } from '../filters/filters.module';

@Module({
  imports: [FiltersModule],
  controllers: [MeetingsController, MeetingRequestsController],
  providers: [
    MeetingsService,
    MeetingRequestsService,
    RecommendationsService,
  ],
  exports: [MeetingsService, MeetingRequestsService, RecommendationsService],
})
export class MeetingsModule {}
