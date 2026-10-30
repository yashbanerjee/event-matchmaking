import { z } from 'zod';
import type {
  AiHealth,
  AiProvider,
  PairMatchScoreInput,
  PairMatchScoreResult,
  ProfileExtractionInput,
  ProfileExtractionResult,
  SemanticSimilarityInput,
} from './ai.provider';
import { DEFAULT_MATCHMAKING_PROMPT } from './matchmaking-prompt';

const extractionSchema = z.object({
  capabilities: z.array(z.string()).default([]),
  categories: z.array(z.string()).default([]),
  regions: z.array(z.string()).default([]),
  industry: z.string().optional(),
});

const pairScoreSchema = z.object({
  score: z.number().min(0).max(100),
  rationale: z.string().optional(),
});

export type JavProviderConfig = {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  /** Chat / fine-tuned model id used for extract + pair scoring */
  chatModel: string;
  /** Embedding model id for semantic similarity */
  embeddingModel: string;
  temperature: number;
};

/**
 * JAV AI — OpenAI-compatible HTTP provider.
 * Point `baseUrl` at the JAV gateway (e.g. https://api.example.com/v1).
 * Fine-tuned models are selected via `chatModel` from Admin → System Settings.
 */
export class JavAiProvider implements AiProvider {
  readonly name = 'jav';

  private readonly baseUrl: string;

  constructor(private readonly config: JavProviderConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  async health(): Promise<AiHealth> {
    const started = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
      return {
        provider: this.name,
        healthy: res.ok,
        latencyMs: Date.now() - started,
        error: res.ok ? undefined : `HTTP ${res.status}`,
      };
    } catch (err) {
      return {
        provider: this.name,
        healthy: false,
        latencyMs: Date.now() - started,
        error: (err as Error).message,
      };
    }
  }

  async extractProfile(
    input: ProfileExtractionInput,
  ): Promise<ProfileExtractionResult> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      signal: AbortSignal.timeout(this.config.timeoutMs),
      body: JSON.stringify({
        model: this.config.chatModel,
        temperature: this.config.temperature,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Extract business profile fields as JSON with capabilities, categories, regions, industry. Do not invent private data.',
          },
          { role: 'user', content: input.text.slice(0, 8000) },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`JAV extract failed: ${res.status}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? '{}';
    const parsed = extractionSchema.parse(JSON.parse(content));
    return { ...parsed, raw: parsed };
  }

  async semanticSimilarity(input: SemanticSimilarityInput): Promise<number> {
    const embed = async (text: string) => {
      const res = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: this.headers(),
        signal: AbortSignal.timeout(this.config.timeoutMs),
        body: JSON.stringify({
          model: this.config.embeddingModel,
          input: text.slice(0, 8000),
        }),
      });
      if (!res.ok) throw new Error(`JAV embed failed: ${res.status}`);
      const json = (await res.json()) as {
        data: Array<{ embedding: number[] }>;
      };
      return json.data[0]!.embedding;
    };

    const [a, b] = await Promise.all([embed(input.left), embed(input.right)]);
    return cosine(a, b);
  }

  async pairMatchScore(
    input: PairMatchScoreInput,
  ): Promise<PairMatchScoreResult> {
    const system = input.systemPrompt?.trim() || DEFAULT_MATCHMAKING_PROMPT;

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      signal: AbortSignal.timeout(this.config.timeoutMs),
      body: JSON.stringify({
        model: this.config.chatModel,
        temperature: input.temperature ?? this.config.temperature,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: JSON.stringify({
              clientProfile: input.left.slice(0, 6000),
              guestProfile: input.right.slice(0, 6000),
            }),
          },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`JAV pair score failed: ${res.status}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? '{}';
    const parsed = pairScoreSchema.parse(JSON.parse(content));
    return {
      score: Math.max(0, Math.min(1, parsed.score / 100)),
      rationale: parsed.rationale,
    };
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return Math.round((dot / (Math.sqrt(na) * Math.sqrt(nb))) * 10000) / 10000;
}
