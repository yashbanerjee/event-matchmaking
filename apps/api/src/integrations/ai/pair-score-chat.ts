import { z } from 'zod';
import type { PairMatchScoreInput, PairMatchScoreResult } from './ai.provider';
import { DEFAULT_MATCHMAKING_PROMPT } from './matchmaking-prompt';

const pairScoreSchema = z.object({
  score: z.number().min(0).max(100),
  rationale: z.string().min(1).max(2000),
  reasons: z.array(z.string().min(1).max(500)).min(1).max(6).optional(),
  mismatch: z.string().max(500).optional(),
  agenda: z.string().max(500).optional(),
});

export type OpenAiCompatibleConfig = {
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  temperature: number;
  timeoutMs: number;
  extraHeaders?: Record<string, string>;
};

/**
 * OpenAI-compatible chat/completions pair scoring (OpenRouter, vLLM, LiteLLM, etc.).
 * Returns a 0–1 score and admin-tunable rationale text from the model JSON.
 */
export async function pairMatchScoreViaChat(
  config: OpenAiCompatibleConfig,
  input: PairMatchScoreInput,
): Promise<PairMatchScoreResult> {
  const base = config.baseUrl.replace(/\/$/, '');
  const system = input.systemPrompt?.trim() || DEFAULT_MATCHMAKING_PROMPT;
  const userContent =
    input.userMessage?.trim() ||
    JSON.stringify({
      investorProfile: input.left.slice(0, 6000),
      innovatorProfile: input.right.slice(0, 6000),
    });

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      ...(config.extraHeaders ?? {}),
    },
    signal: AbortSignal.timeout(config.timeoutMs),
    body: JSON.stringify({
      model: config.chatModel,
      temperature: input.temperature ?? config.temperature,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system.slice(0, 12000) },
        { role: 'user', content: userContent.slice(0, 12000) },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `Chat pair score failed: ${res.status}${detail ? ` ${detail.slice(0, 240)}` : ''}`,
    );
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content ?? '{}';
  const parsed = pairScoreSchema.parse(JSON.parse(content));
  const reasons = parsed.reasons?.map((r) => r.trim()).filter(Boolean);
  const mismatch = parsed.mismatch?.trim();
  const agenda = parsed.agenda?.trim();
  let rationale = parsed.rationale.trim();
  if (mismatch) rationale += ` Risk: ${mismatch}`;
  if (agenda) rationale += ` Agenda: ${agenda}`;
  return {
    score: Math.round((parsed.score / 100) * 10000) / 10000,
    rationale,
    reasons: reasons?.length ? reasons : undefined,
    mismatch: mismatch || undefined,
    agenda: agenda || undefined,
  };
}
