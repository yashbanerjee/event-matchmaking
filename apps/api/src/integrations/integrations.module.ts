import { Global, Module } from '@nestjs/common';
import { EmailService } from './email/email.service';
import { StorageService } from './storage/storage.service';
import { AiService } from './ai/ai.service';
import { SemanticSearchService } from './search/semantic-search.service';
import { IntegrationsController } from './integrations.controller';

@Global()
@Module({
  controllers: [IntegrationsController],
  providers: [EmailService, StorageService, AiService, SemanticSearchService],
  exports: [EmailService, StorageService, AiService, SemanticSearchService],
})
export class IntegrationsModule {}
