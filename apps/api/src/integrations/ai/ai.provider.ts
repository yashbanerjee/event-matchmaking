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

export interface PairMatchScoreInput {
  left: string;
  right: string;
  systemPrompt?: string;
  temperature?: number;
}

export interface PairMatchScoreResult {
  /** Normalized 0–1 compatibility */
  score: number;
  rationale?: string;
}

export interface AiProvider {
  readonly name: string;
  health(): Promise<AiHealth>;
  extractProfile?(
    input: ProfileExtractionInput,
  ): Promise<ProfileExtractionResult>;
  semanticSimilarity?(input: SemanticSimilarityInput): Promise<number>;
  /** LLM pair scoring used by matchmaking fine-tune prompts */
  pairMatchScore?(input: PairMatchScoreInput): Promise<PairMatchScoreResult>;
}
