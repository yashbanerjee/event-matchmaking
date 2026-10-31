import { Module } from '@nestjs/common';
import { MatchmakingController } from './matchmaking.controller';
import { MatchmakingService } from './matchmaking.service';
import { FiltersModule } from '../filters/filters.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { PlacesModule } from '../places/places.module';

@Module({
  imports: [FiltersModule, IntegrationsModule, PlacesModule],
  controllers: [MatchmakingController],
  providers: [MatchmakingService],
  exports: [MatchmakingService],
})
export class MatchmakingModule {}
