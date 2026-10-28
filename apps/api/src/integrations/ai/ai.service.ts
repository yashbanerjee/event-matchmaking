import { Injectable, Logger } from '@nestjs/common';
import { EnvService } from '../../config/env.service';
import type {
  AiHealth,
  AiProvider,
  ProfileExtractionInput,
  ProfileExtractionResult,
} from './ai.provider';
import { NullAiProvider } from './null-ai.provider';

/**
 * AI is optional. Hard eligibility and scheduling constraints are never overridden.
 * When all providers fail or AI is disabled, callers continue with deterministic logic.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly providers: AiProvider[];

  constructor(private readonly env: EnvService) {
    this.providers = [new NullAiProvider()];
  }

  isEnabled() {
    return this.env.aiEnabled;
  }

  async health(): Promise<AiHealth[]> {
    if (!this.env.aiEnabled) {
      return [{ provider: 'none', healthy: true }];
    }
    return Promise.all(this.providers.map((p) => p.health()));
  }

  async extractProfile(
    input: ProfileExtractionInput,
  ): Promise<ProfileExtractionResult | null> {
    if (!this.env.aiEnabled) {
      return null;
    }
    for (const provider of this.providers) {
      if (!provider.extractProfile) continue;
      try {
        return await provider.extractProfile(input);
      } catch (err) {
        this.logger.warn(
          `AI provider ${provider.name} failed: ${(err as Error).message}`,
        );
      }
    }
    return null;
  }
}
