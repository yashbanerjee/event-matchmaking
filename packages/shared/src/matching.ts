import { z } from 'zod';
import { DEFAULT_MATCHING_WEIGHTS } from './enums.js';

export const matchingWeightsSchema = z
  .object({
    capability: z.number().min(0).max(1),
    industry: z.number().min(0).max(1),
    requirements: z.number().min(0).max(1),
    geography: z.number().min(0).max(1),
    commercial: z.number().min(0).max(1),
    mutualPreferences: z.number().min(0).max(1),
  })
  .refine(
    (w) =>
      Math.abs(
        w.capability +
          w.industry +
          w.requirements +
          w.geography +
          w.commercial +
          w.mutualPreferences -
          1,
      ) < 0.001,
    { message: 'Matching weights must sum to 1.0' },
  );

export type MatchingWeights = z.infer<typeof matchingWeightsSchema>;

export const defaultMatchingWeights: MatchingWeights = {
  ...DEFAULT_MATCHING_WEIGHTS,
};

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
