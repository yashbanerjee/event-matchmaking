import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EnvService } from '../../config/env.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EffectiveConfigService } from '../../settings/effective-config.service';
import type {
  AiHealth,
  AiProvider,
  PairMatchScoreInput,
  PairMatchScoreResult,
  ProfileExtractionInput,
  ProfileExtractionResult,
  SemanticSimilarityInput,
} from './ai.provider';
import { NullAiProvider } from './null-ai.provider';
import { OpenAiProvider } from './openai.provider';
import { AnthropicProvider } from './anthropic.provider';
import { JavAiProvider } from './jav.provider';
import {
  applyMatchmakingUserTemplate,
  DEFAULT_MATCHMAKING_CHAT_MODEL,
  DEFAULT_MATCHMAKING_PROMPT,
  DEFAULT_MATCHMAKING_USER_TEMPLATE,
} from './matchmaking-prompt';
import type { PairScoringMethod } from './ai.provider';

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private circuitOpenUntil = new Map<string, number>();

  constructor(
    private readonly env: EnvService,
    private readonly prisma: PrismaService,
    private readonly config: EffectiveConfigService,
  ) {}

  async onModuleInit() {
    await this.ensureIntegratedJavDefaults();
  }

  /** Wire JAV as the default Ethara matchmaking AI if settings are still unset/off. */
  private async ensureIntegratedJavDefaults() {
    const readCurrent = (raw: unknown) => {
      if (raw && typeof raw === 'object' && 'value' in (raw as object)) {
        return (raw as { value: unknown }).value;
      }
      return raw;
    };

    const writeSetting = async (key: string, value: Prisma.InputJsonValue) => {
      const payload = { value } as Prisma.InputJsonValue;
      await this.prisma.systemSetting.upsert({
        where: { key },
        create: { key, value: payload },
        update: { value: payload },
      });
    };

    const ensure = async (key: string, value: Prisma.InputJsonValue) => {
      const payload = { value } as Prisma.InputJsonValue;
      const existing = await this.prisma.systemSetting.findUnique({
        where: { key },
      });
      if (!existing) {
        await this.prisma.systemSetting.create({
          data: { key, value: payload },
        });
        return;
      }
      const current = readCurrent(existing.value);
      const empty =
        current === undefined ||
        current === null ||
        current === '' ||
        current === 'none';
      const legacyModel =
        key === 'ai.javChatModel' &&
        (current === 'gpt-4o-mini' ||
          current === 'openai/gpt-4o-mini' ||
          current === 'jav-match-v1' ||
          current === '~typesafe/jev-latest');
      const legacyMode =
        key === 'ai.matchmakingMode' && current === 'embedding';
      const shouldUpgrade =
        (empty &&
          (key === 'ai.enabled' ||
            key === 'ai.primaryProvider' ||
            key === 'ai.javChatModel' ||
            key === 'ai.matchmakingMode' ||
            key === 'ai.javBaseUrl')) ||
        legacyModel ||
        legacyMode;
      if (shouldUpgrade) {
        await this.prisma.systemSetting.update({
          where: { key },
          data: { value: payload },
        });
      }
    };

    await ensure('ai.enabled', true);
    await ensure('ai.primaryProvider', 'jav');
    await ensure('ai.secondaryProvider', 'none');
    await ensure('ai.javBaseUrl', 'https://openrouter.ai/api/v1');
    await ensure('ai.javChatModel', DEFAULT_MATCHMAKING_CHAT_MODEL);
    await ensure('ai.matchmakingMode', 'llm');
    await ensure('ai.matchmakingBlendWeight', 0.3);
    await ensure('ops.recommendationScoreThreshold', 75);
    await ensure('ai.pairScoringMethod', 'structured_json');
    await ensure('ai.includeOnboardingInProfile', true);
    await ensure('ai.matchmakingPrompt', DEFAULT_MATCHMAKING_PROMPT);
    await ensure(
      'ai.matchmakingUserTemplate',
      DEFAULT_MATCHMAKING_USER_TEMPLATE,
    );

    const solidDefaultsVersion = 2;
    const versionKey = 'ops.aiSolidDefaultsVersion';
    const versionRow = await this.prisma.systemSetting.findUnique({
      where: { key: versionKey },
    });
    const currentVersion = Number(readCurrent(versionRow?.value) ?? 0);
    if (!Number.isFinite(currentVersion) || currentVersion < solidDefaultsVersion) {
      await writeSetting('ops.recommendationScoreThreshold', 75);
      await writeSetting('ai.matchmakingBlendWeight', 0.3);
      await writeSetting('ai.pairScoringMethod', 'structured_json');
      await writeSetting('ai.includeOnboardingInProfile', true);
      await writeSetting('ai.matchmakingMode', 'llm');
      await writeSetting('ai.matchmakingPrompt', DEFAULT_MATCHMAKING_PROMPT);
      await writeSetting(
        'ai.matchmakingUserTemplate',
        DEFAULT_MATCHMAKING_USER_TEMPLATE,
      );
      await writeSetting('ops.tagCategoryThresholds', {
        challenge: 25,
        solution: 0,
        geography: 20,
        commercial: 0,
        stage: 15,
        ticket: 0,
      });
      await writeSetting(versionKey, solidDefaultsVersion);
      this.logger.log(
        `Applied solid AI recommendation defaults (v${solidDefaultsVersion})`,
      );
    }

    await this.prisma.featureFlag.upsert({
      where: { key: 'ai_enabled' },
      create: {
        key: 'ai_enabled',
        enabled: true,
        description: 'Global switch for JAV AI matchmaking / recommendations',
      },
      update: {},
    });

    this.config.invalidate();
    this.logger.log('JAV AI integrated as primary matchmaking provider');
  }

  async isEnabled() {
    return this.config.getBoolean('ai.enabled', this.env.aiEnabled ?? true);
  }

  async health(): Promise<AiHealth[]> {
    if (!(await this.isEnabled())) {
      return [{ provider: 'disabled', healthy: true }];
    }
    const providers = await this.buildProviders();
    const results = await Promise.all(providers.map((p) => p.health()));
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
    if (!(await this.isEnabled())) return null;
    const providers = await this.buildProviders();
    const maxRetries = await this.config.getNumber(
      'ai.maxRetries',
      this.env.raw.AI_MAX_RETRIES,
    );
    for (const provider of providers) {
      if (!provider.extractProfile) continue;
      if (this.isCircuitOpen(provider.name)) continue;
      try {
        return await this.withRetries(
          () => provider.extractProfile!(input),
          maxRetries,
        );
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
    if (!(await this.isEnabled())) return null;
    const providers = await this.buildProviders();
    const maxRetries = await this.config.getNumber(
      'ai.maxRetries',
      this.env.raw.AI_MAX_RETRIES,
    );
    for (const provider of providers) {
      if (!provider.semanticSimilarity) continue;
      if (this.isCircuitOpen(provider.name)) continue;
      try {
        return await this.withRetries(
          () => provider.semanticSimilarity!(input),
          maxRetries,
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

  async pairMatchScore(
    input: PairMatchScoreInput,
  ): Promise<(PairMatchScoreResult & { provider: string }) | null> {
    if (!(await this.isEnabled())) return null;
    const enriched = await this.enrichPairMatchInput(input);
    const providers = await this.buildProviders();
    const maxRetries = await this.config.getNumber(
      'ai.maxRetries',
      this.env.raw.AI_MAX_RETRIES,
    );
    for (const provider of providers) {
      if (!provider.pairMatchScore) continue;
      if (this.isCircuitOpen(provider.name)) continue;
      try {
        const result = await this.withRetries(
          () => provider.pairMatchScore!(enriched),
          maxRetries,
        );
        return { ...result, provider: provider.name };
      } catch (err) {
        this.logger.warn(
          `AI provider ${provider.name} pair score failed: ${(err as Error).message}`,
        );
        this.circuitOpenUntil.set(provider.name, Date.now() + 60_000);
      }
    }
    return null;
  }

  private async enrichPairMatchInput(
    input: PairMatchScoreInput,
  ): Promise<PairMatchScoreInput> {
    const configuredSystem = await this.config.getString(
      'ai.matchmakingPrompt',
      this.env.raw.AI_MATCHMAKING_PROMPT ?? '',
    );
    const systemPrompt =
      input.systemPrompt?.trim() ||
      configuredSystem.trim() ||
      DEFAULT_MATCHMAKING_PROMPT;
    const userTemplate = await this.config.getString(
      'ai.matchmakingUserTemplate',
      this.env.raw.AI_MATCHMAKING_USER_TEMPLATE ?? '',
    );
    const userMessage = applyMatchmakingUserTemplate(userTemplate, {
      investorProfile: input.left,
      innovatorProfile: input.right,
    });
    return {
      ...input,
      systemPrompt,
      userMessage: input.userMessage?.trim() || userMessage,
    };
  }

  /** Accept pasted `export OPENROUTER_API_KEY=sk-or-v1-…` shell lines. */
  private sanitizeApiKey(raw: string): string {
    let text = String(raw ?? '').trim();
    text = text.replace(/^export\s+/i, '');
    text = text.replace(/^OPENROUTER_API_KEY\s*=\s*/i, '');
    text = text.replace(/^JAV_AI_API_KEY\s*=\s*/i, '');
    text = text.replace(/^["']|["']$/g, '').trim();
    return text;
  }

  private isCircuitOpen(name: string) {
    return (this.circuitOpenUntil.get(name) ?? 0) > Date.now();
  }

  private async withRetries<T>(fn: () => Promise<T>, max: number): Promise<T> {
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

  private async buildProviders(): Promise<AiProvider[]> {
    const timeout = await this.config.getNumber(
      'ai.requestTimeoutMs',
      this.env.raw.AI_REQUEST_TIMEOUT_MS,
    );
    const primary = await this.config.getString(
      'ai.primaryProvider',
      this.env.raw.AI_PRIMARY_PROVIDER || 'jav',
    );
    const secondary = await this.config.getString(
      'ai.secondaryProvider',
      this.env.raw.AI_SECONDARY_PROVIDER || 'openai',
    );
    // Credentials and models come from Admin → System Settings only.
    const openaiKey = await this.config.getString('ai.openaiApiKey', '');
    const anthropicKey = await this.config.getString('ai.anthropicApiKey', '');
    const javKey = this.sanitizeApiKey(
      await this.config.getString('ai.openrouterApiKey', ''),
    );
    const javBaseUrl =
      (await this.config.getString('ai.javBaseUrl', '')) ||
      'https://openrouter.ai/api/v1';
    const javChatModel = await this.config.getString(
      'ai.javChatModel',
      this.env.raw.JAV_AI_CHAT_MODEL?.trim() ||
        DEFAULT_MATCHMAKING_CHAT_MODEL,
    );
    const javEmbeddingModel = await this.config.getString(
      'ai.javEmbeddingModel',
      '',
    );
    const javFineTunedModel = await this.config.getString(
      'ai.javFineTunedModel',
      '',
    );
    const javTemperature = await this.config.getNumber(
      'ai.javTemperature',
      0.2,
    );
    const pairScoringRaw = await this.config.getString(
      'ai.pairScoringMethod',
      this.env.raw.AI_PAIR_SCORING_METHOD ?? 'structured_json',
    );
    const pairScoringMethod: PairScoringMethod =
      pairScoringRaw === 'jev_decisions'
        ? 'jev_decisions'
        : 'structured_json';
    const isOpenRouter = /openrouter\.ai/i.test(javBaseUrl);

    const byName = (name: string): AiProvider | null => {
      if (name === 'openai' && openaiKey) {
        return new OpenAiProvider(openaiKey, timeout);
      }
      if (name === 'anthropic' && anthropicKey) {
        return new AnthropicProvider(anthropicKey, timeout);
      }
      if (name === 'jav' && javKey) {
        // Jev (TypeSafe) on OpenRouter — https://openrouter.ai/~typesafe/jev-latest
        return new JavAiProvider({
          apiKey: javKey,
          baseUrl: javBaseUrl,
          timeoutMs: timeout,
          chatModel: javFineTunedModel.trim() || javChatModel,
          embeddingModel: javEmbeddingModel || 'openai/text-embedding-3-small',
          temperature: javTemperature,
          pairScoringMethod,
          extraHeaders: isOpenRouter
            ? {
                'HTTP-Referer': this.env.appUrl || 'https://ethara.com',
                'X-Title': 'Ethara Matchmaking',
              }
            : undefined,
        });
      }
      return null;
    };

    const providers: AiProvider[] = [];
    const seen = new Set<string>();
    const push = (name: string) => {
      if (!name || name === 'none' || seen.has(name)) return;
      const provider = byName(name);
      if (provider) {
        seen.add(name);
        providers.push(provider);
      }
    };

    // Always prefer JAV first — it is the integrated Ethara matchmaking model.
    push('jav');
    push(primary);
    push(secondary);
    // Last-resort fallbacks so matchmaking still gets AI when only one key is set
    push('openai');
    push('anthropic');

    if (providers.length === 0) {
      providers.push(new NullAiProvider());
    }
    return providers;
  }
}
