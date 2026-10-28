import { z } from 'zod';
import type {
  AiHealth,
  AiProvider,
  ProfileExtractionInput,
  ProfileExtractionResult,
} from './ai.provider';

const extractionSchema = z.object({
  capabilities: z.array(z.string()).default([]),
  categories: z.array(z.string()).default([]),
  regions: z.array(z.string()).default([]),
  industry: z.string().optional(),
});

export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';

  constructor(
    private readonly apiKey: string,
    private readonly timeoutMs: number,
  ) {}

  async health(): Promise<AiHealth> {
    const started = Date.now();
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify({
          model: 'claude-3-5-haiku-latest',
          max_tokens: 16,
          messages: [{ role: 'user', content: 'ping' }],
        }),
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
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 512,
        messages: [
          {
            role: 'user',
            content: `Extract JSON with capabilities, categories, regions, industry from:\n${input.text.slice(0, 8000)}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`Anthropic extract failed: ${res.status}`);
    }
    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = json.content?.find((c) => c.type === 'text')?.text ?? '{}';
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = extractionSchema.parse(JSON.parse(match?.[0] ?? '{}'));
    return { ...parsed, raw: parsed };
  }
}
