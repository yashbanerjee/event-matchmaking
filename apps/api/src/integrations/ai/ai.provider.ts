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
  /** Investor (company) profile text */
  left: string;
  /** Innovator (vendor) profile text */
  right: string;
  systemPrompt?: string;
  /** Filled user message (Admin → matchmaking user template). */
  userMessage?: string;
  /** Deterministic tag preference summary injected into the user prompt. */
  preferenceFit?: string;
  temperature?: number;
}

export type PairScoringMethod = 'structured_json' | 'jev_decisions';

export interface PairMatchScoreResult {
  /** Normalized 0–1 compatibility */
  score: number;
  rationale?: string;
  /** Optional bullet reasons from the model (shown to admins and in portal copy). */
  reasons?: string[];
  mismatch?: string;
  agenda?: string;
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
