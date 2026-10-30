import { Module } from '@nestjs/common';
import { MatchmakingController } from './matchmaking.controller';
import { MatchmakingService } from './matchmaking.service';
import { FiltersModule } from '../filters/filters.module';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [FiltersModule, IntegrationsModule],
  controllers: [MatchmakingController],
  providers: [MatchmakingService],
  exports: [MatchmakingService],
})
export class MatchmakingModule {}
