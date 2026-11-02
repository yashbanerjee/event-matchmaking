import { Module, forwardRef } from '@nestjs/common';
import { MatchmakingController } from './matchmaking.controller';
import { MatchmakingService } from './matchmaking.service';
import { FiltersModule } from '../filters/filters.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { MeetingsModule } from '../meetings/meetings.module';
import { PlacesModule } from '../places/places.module';

@Module({
  imports: [
    FiltersModule,
    IntegrationsModule,
    PlacesModule,
    forwardRef(() => MeetingsModule),
  ],
  controllers: [MatchmakingController],
  providers: [MatchmakingService],
  exports: [MatchmakingService],
})
export class MatchmakingModule {}
