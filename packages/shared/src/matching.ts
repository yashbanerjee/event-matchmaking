import { z } from 'zod';
import { DEFAULT_MATCHING_WEIGHTS } from './enums.js';

export const TAG_CATEGORY_KEYS = [
  'challenge',
  'solution',
  'geography',
  'commercial',
  'stage',
  'ticket',
] as const;

export type TagCategoryKey = (typeof TAG_CATEGORY_KEYS)[number];

export const TAG_CATEGORY_LABELS: Record<TagCategoryKey, string> = {
  challenge: 'Challenges / topics',
  solution: 'Solution types',
  geography: 'Geography',
  commercial: 'Capital / commercial',
  stage: 'Stage',
  ticket: 'Ticket size',
};

export const matchingWeightsSchema = z
  .object({
    challenge: z.number().min(0).max(1),
    solution: z.number().min(0).max(1),
    geography: z.number().min(0).max(1),
    commercial: z.number().min(0).max(1),
    stage: z.number().min(0).max(1),
    ticket: z.number().min(0).max(1),
  })
  .refine(
    (w) =>
      Math.abs(
        w.challenge +
          w.solution +
          w.geography +
          w.commercial +
          w.stage +
          w.ticket -
          1,
      ) < 0.001,
    { message: 'Matching weights must sum to 1.0' },
  );

/** Accept stored rule versions that still use legacy dimension keys. */
export function resolveMatchingWeights(raw: unknown): MatchingWeights {
  const parsed = matchingWeightsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  if (raw && typeof raw === 'object' && 'capability' in raw) {
    return { ...defaultMatchingWeights };
  }
  return { ...defaultMatchingWeights };
}

export type MatchingWeights = z.infer<typeof matchingWeightsSchema>;

export const defaultMatchingWeights: MatchingWeights = {
  ...DEFAULT_MATCHING_WEIGHTS,
};

/**
 * Minimum 0–100 score required per tag category before a pair can become a
 * recommendation. 0 = no minimum for that category.
 */
export const tagCategoryThresholdsSchema = z.object({
  challenge: z.number().min(0).max(100),
  solution: z.number().min(0).max(100),
  geography: z.number().min(0).max(100),
  commercial: z.number().min(0).max(100),
  stage: z.number().min(0).max(100),
  ticket: z.number().min(0).max(100),
});

export type TagCategoryThresholds = z.infer<typeof tagCategoryThresholdsSchema>;

/** Soft tag floors so hard requirements are not left to AI alone. */
export const defaultTagCategoryThresholds: TagCategoryThresholds = {
  challenge: 40,
  solution: 0,
  geography: 25,
  commercial: 0,
  stage: 20,
  ticket: 0,
};

/**
 * Blend rule (preference/tag) score with AI narrative score so vague profile
 * similarity cannot rescue weak challenge / geography / stage fit.
 */
export function blendPreferenceAwareScore(input: {
  ruleScore: number;
  aiScore: number;
  blend: number;
  challenge: number;
  geography: number;
  stage: number;
}): number {
  const blend = Math.max(0, Math.min(1, Number(input.blend) || 0));
  const ruleScore = Number(input.ruleScore) || 0;
  const aiScore = Number(input.aiScore) || 0;
  if (blend <= 0) return Math.round(ruleScore * 100) / 100;

  const preferenceCore =
    (Number(input.challenge) || 0) * 0.5 +
    (Number(input.geography) || 0) * 0.3 +
    (Number(input.stage) || 0) * 0.2;
  // Full AI weight only when stated preferences already look solid.
  const gate = Math.max(0, Math.min(1, preferenceCore / 65));
  const effectiveBlend = blend * gate;
  if (effectiveBlend <= 0) return Math.round(ruleScore * 100) / 100;

  const maxLift =
    preferenceCore >= 50 ? 20 : preferenceCore >= 35 ? 10 : 5;
  const cappedAi = Math.min(aiScore, ruleScore + maxLift);

  return (
    Math.round(
      (ruleScore * (1 - effectiveBlend) + cappedAi * effectiveBlend) * 100,
    ) / 100
  );
}

export function resolveTagCategoryThresholds(
  raw: unknown,
): TagCategoryThresholds {
  if (typeof raw === 'string' && raw.trim()) {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return { ...defaultTagCategoryThresholds };
    }
  }
  const parsed = tagCategoryThresholdsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return { ...defaultTagCategoryThresholds };
}

/** True when every configured (threshold > 0) category meets its minimum. */
export function meetsTagCategoryThresholds(
  breakdown: Partial<Record<TagCategoryKey, unknown>> | null | undefined,
  thresholds: TagCategoryThresholds,
): { ok: boolean; failed: TagCategoryKey[] } {
  const failed: TagCategoryKey[] = [];
  for (const key of TAG_CATEGORY_KEYS) {
    const min = thresholds[key];
    if (!min || min <= 0) continue;
    const value = Number(breakdown?.[key] ?? 0);
    if (!Number.isFinite(value) || value < min) failed.push(key);
  }
  return { ok: failed.length === 0, failed };
}

/**
 * Absolute ceiling for recommendations per org (admin settings cannot exceed this).
 * Role defaults live in ops.investorRecommendationLimit / ops.innovatorRecommendationLimit.
 * Kept high so mobile/web can receive the full partner list without a client update
 * (older apps still send limit=10/12 — the API ignores that cap).
 */
export const PEER_RECOMMENDATIONS_ABSOLUTE_MAX = 500;

/** @deprecated Prefer role-specific limits from settings; kept as innovator default. */
export const PEER_RECOMMENDATIONS_MAX_PER_ORG = 5;

export const DEFAULT_INVESTOR_RECOMMENDATION_LIMIT = 100;
export const DEFAULT_INNOVATOR_RECOMMENDATION_LIMIT = 100;

export function clampRecommendationLimit(
  value: unknown,
  fallback: number,
): number {
  const n = Number(value);
  const base = Number.isFinite(n) ? n : fallback;
  return Math.max(1, Math.min(PEER_RECOMMENDATIONS_ABSOLUTE_MAX, Math.round(base)));
}

export const scheduleConfigSchema = z.object({
  scheduleDate: z.string().date(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  timeZone: z.string().min(1),
  slotCount: z.number().int().min(1).max(64).default(6),
  meetingDurationMinutes: z.number().int().min(5).max(240).default(15),
  bufferMinutes: z.number().int().min(0).max(60).default(5),
  maxMeetingsPerParticipant: z.number().int().min(1).max(64).default(24),
  mode: z.enum(['VIRTUAL', 'IN_PERSON', 'HYBRID']).default('VIRTUAL'),
  /**
   * When true, blend deterministic tag scores with AI semantic similarity
   * on profile text (about, focus events, categories, capabilities).
   */
  useAi: z.boolean().default(false),
  /** Time windows where no meetings should be scheduled (e.g. lunch 12:00–13:00). */
  excludeIntervals: z
    .array(
      z.object({
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
      }),
    )
    .default([]),
  breaks: z
    .array(
      z.object({
        afterSlotIndex: z.number().int().min(0),
        durationMinutes: z.number().int().min(5),
      }),
    )
    .default([]),
});

export type ScheduleConfig = z.infer<typeof scheduleConfigSchema>;
