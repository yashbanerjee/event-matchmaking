import type {
  AiHealth,
  AiProvider,
  ProfileExtractionInput,
  ProfileExtractionResult,
} from './ai.provider';

export class NullAiProvider implements AiProvider {
  readonly name = 'null';

  async health(): Promise<AiHealth> {
    return { provider: this.name, healthy: true, latencyMs: 0 };
  }

  async extractProfile(
    _input: ProfileExtractionInput,
  ): Promise<ProfileExtractionResult> {
    return {
      capabilities: [],
      categories: [],
      regions: [],
      raw: { note: 'AI disabled or null provider' },
    };
  }
}
