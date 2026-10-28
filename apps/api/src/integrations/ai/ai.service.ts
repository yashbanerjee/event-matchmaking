import { Injectable, Logger } from '@nestjs/common';
import { EnvService } from '../../config/env.service';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AiHealth,
  AiProvider,
  ProfileExtractionInput,
  ProfileExtractionResult,
  SemanticSimilarityInput,
} from './ai.provider';
import { NullAiProvider } from './null-ai.provider';
import { OpenAiProvider } from './openai.provider';
import { AnthropicProvider } from './anthropic.provider';

/**
 * AI is optional. Hard eligibility and scheduling constraints are never overridden.
 * Provider priority: primary → secondary → null. Failures fall through.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly providers: AiProvider[];
  private circuitOpenUntil = new Map<string, number>();

  constructor(
    private readonly env: EnvService,
    private readonly prisma: PrismaService,
  ) {
    this.providers = this.buildProviders();
  }

  isEnabled() {
    return this.env.aiEnabled;
  }

  async health(): Promise<AiHealth[]> {
    if (!this.env.aiEnabled) {
      return [{ provider: 'disabled', healthy: true }];
    }
    const results = await Promise.all(this.providers.map((p) => p.health()));
    for (const result of results) {
      await this.prisma.integrationHealthEvent.create({
        data: {
          integration: `ai:${result.provider}`,
          status: result.healthy ? 'up' : 'down',
          latencyMs: result.latencyMs,
          errorMessage: result.error,
        },
      });
      if (!result.healthy) {
        this.circuitOpenUntil.set(result.provider, Date.now() + 60_000);
      }
    }
    return results;
  }

  async extractProfile(
    input: ProfileExtractionInput,
  ): Promise<ProfileExtractionResult | null> {
    if (!this.env.aiEnabled) return null;
    for (const provider of this.providers) {
      if (!provider.extractProfile) continue;
      if (this.isCircuitOpen(provider.name)) continue;
      try {
        return await this.withRetries(() => provider.extractProfile!(input));
      } catch (err) {
        this.logger.warn(
          `AI provider ${provider.name} extract failed: ${(err as Error).message}`,
        );
        this.circuitOpenUntil.set(provider.name, Date.now() + 60_000);
      }
    }
    return null;
  }

  async semanticSimilarity(
    input: SemanticSimilarityInput,
  ): Promise<number | null> {
    if (!this.env.aiEnabled) return null;
    for (const provider of this.providers) {
      if (!provider.semanticSimilarity) continue;
      if (this.isCircuitOpen(provider.name)) continue;
      try {
        return await this.withRetries(() =>
          provider.semanticSimilarity!(input),
        );
      } catch (err) {
        this.logger.warn(
          `AI provider ${provider.name} similarity failed: ${(err as Error).message}`,
        );
        this.circuitOpenUntil.set(provider.name, Date.now() + 60_000);
      }
    }
    return null;
  }

  private isCircuitOpen(name: string) {
    const until = this.circuitOpenUntil.get(name) ?? 0;
    return until > Date.now();
  }

  private async withRetries<T>(fn: () => Promise<T>): Promise<T> {
    const max = this.env.raw.AI_MAX_RETRIES;
    let lastError: unknown;
    for (let attempt = 0; attempt <= max; attempt += 1) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (attempt < max) {
          await new Promise((r) => setTimeout(r, 200 * 2 ** attempt));
        }
      }
    }
    throw lastError;
  }

  private buildProviders(): AiProvider[] {
    const raw = this.env.raw;
    const orderedNames = [
      raw.AI_PRIMARY_PROVIDER,
      raw.AI_SECONDARY_PROVIDER,
    ].filter((n) => n && n !== 'none');

    const byName = (name: string): AiProvider | null => {
      if (name === 'openai' && raw.OPENAI_API_KEY) {
        return new OpenAiProvider(raw.OPENAI_API_KEY, raw.AI_REQUEST_TIMEOUT_MS);
      }
      if (name === 'anthropic' && raw.ANTHROPIC_API_KEY) {
        return new AnthropicProvider(
          raw.ANTHROPIC_API_KEY,
          raw.AI_REQUEST_TIMEOUT_MS,
        );
      }
      return null;
    };

    const providers: AiProvider[] = [];
    for (const name of orderedNames) {
      const provider = byName(name);
      if (provider) providers.push(provider);
    }
    if (providers.length === 0) {
      providers.push(new NullAiProvider());
    }
    return providers;
  }
}
