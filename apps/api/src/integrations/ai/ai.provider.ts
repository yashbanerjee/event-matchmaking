export interface AiHealth {
  provider: string;
  healthy: boolean;
  latencyMs?: number;
  error?: string;
}

export interface ProfileExtractionInput {
  text: string;
  schemaHint?: Record<string, unknown>;
}

export interface ProfileExtractionResult {
  capabilities: string[];
  categories: string[];
  regions: string[];
  industry?: string;
  raw: unknown;
}

export interface SemanticSimilarityInput {
  left: string;
  right: string;
}

export interface AiProvider {
  readonly name: string;
  health(): Promise<AiHealth>;
  extractProfile?(
    input: ProfileExtractionInput,
  ): Promise<ProfileExtractionResult>;
  semanticSimilarity?(input: SemanticSimilarityInput): Promise<number>;
}
