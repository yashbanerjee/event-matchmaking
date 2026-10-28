import { z } from 'zod';
import type {
  AiHealth,
  AiProvider,
  ProfileExtractionInput,
  ProfileExtractionResult,
  SemanticSimilarityInput,
} from './ai.provider';

const extractionSchema = z.object({
  capabilities: z.array(z.string()).default([]),
  categories: z.array(z.string()).default([]),
  regions: z.array(z.string()).default([]),
  industry: z.string().optional(),
});

export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';

  constructor(
    private readonly apiKey: string,
    private readonly timeoutMs: number,
  ) {}

  async health(): Promise<AiHealth> {
    const started = Date.now();
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(this.timeoutMs),
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
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        model: 'gpt-4o-mini',
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
      throw new Error(`OpenAI extract failed: ${res.status}`);
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
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: text.slice(0, 8000),
        }),
      });
      if (!res.ok) throw new Error(`OpenAI embed failed: ${res.status}`);
      const json = (await res.json()) as {
        data: Array<{ embedding: number[] }>;
      };
      return json.data[0]!.embedding;
    };

    const [a, b] = await Promise.all([embed(input.left), embed(input.right)]);
    return cosine(a, b);
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
