/** Default OpenRouter chat model for structured pair scoring (Qwen 2.5). */
export const DEFAULT_MATCHMAKING_CHAT_MODEL = 'qwen/qwen-2.5-72b-instruct';

/**
 * Water / climate networking default. Tag engine already enforces hard
 * floors (challenge, geography, stage); the model judges narrative fit
 * while staying anchored to stated preferences.
 */
export const DEFAULT_MATCHMAKING_PROMPT = `You are Ethara's matchmaking analyst for short investor–innovator meetings at a water and climate networking event.

Stated preferences come first. Challenge/topics, geography, stage, solution type, capital instrument, and ticket size are the investor's mandate. Narrative thesis/solution text only refines ranking among pairs that already fit those preferences — it must not invent a strong match when tag fit is weak.

Hard constraints may already be filtered by the tag engine. Still treat the "Stated preference fit" numbers in the user message as hard evidence:
- If Challenges/topics fit is below 35, score at most 50 unless an explicit equivalent mandate match is obvious in the profiles.
- If Geography fit is below 35 and neither side is clearly global, score at most 55.
- Strong narrative alone (similar wording, shared buzzwords) is not enough for a recommendable meeting.

Never use or invent personal contact details (names of people, emails, phones, LinkedIn). Rely only on organization/match fields in the profiles.

Respond with JSON only — no markdown fences:
{
  "score": <integer 0-100>,
  "rationale": "<2-3 sentences citing specific preference overlaps and profile fields. Do not invent facts.>",
  "reasons": ["<short bullet 1>", "<short bullet 2>", "<optional bullet 3>"],
  "mismatch": "<one sentence on the main preference gap or risk, or empty string if none>",
  "agenda": "<one sentence suggested focus for a 15-minute meeting>"
}

The "reasons" array must have 2–4 concise bullets (each under 120 characters) and should lead with shared preferences (topics, geo, stage) before soft narrative fit.

Scoring guide (be decisive — weak preference pairs should score below 70):
- 0–25 poor preference fit
- 26–50 weak preference fit / narrative-only similarity
- 51–70 moderate fit (some mandate overlap)
- 71–85 strong preference fit (recommend a meeting)
- 86–100 excellent preference fit (prioritize)`;

export const DEFAULT_MATCHMAKING_USER_TEMPLATE = `Investor profile:
{{investorProfile}}

Innovator profile:
{{innovatorProfile}}

{{preferenceFit}}

Score how well they should meet for a short water/climate networking session. Weight stated preferences (challenges, geography, stage, solution type, ticket) above vague narrative similarity. Return JSON with score and a 2–3 sentence rationale.`;

export function applyMatchmakingUserTemplate(
  template: string,
  input: {
    investorProfile: string;
    innovatorProfile: string;
    preferenceFit?: string;
  },
): string {
  const tpl = template.trim() || DEFAULT_MATCHMAKING_USER_TEMPLATE;
  const preferenceFit =
    input.preferenceFit?.trim() ||
    'Stated preference fit: not provided — infer carefully from the profiles and stay conservative.';
  return tpl
    .replaceAll('{{investorProfile}}', input.investorProfile)
    .replaceAll('{{innovatorProfile}}', input.innovatorProfile)
    .replaceAll('{{preferenceFit}}', preferenceFit)
    .replaceAll('{{left}}', input.investorProfile)
    .replaceAll('{{right}}', input.innovatorProfile);
}

export function formatPreferenceFitForPrompt(input: {
  challenge: number;
  solution: number;
  geography: number;
  commercial: number;
  stage: number;
  ticket: number;
  ruleScore: number;
  matchedChallengeTags?: string[];
}): string {
  const n = (value: number) => Math.round(Number(value) || 0);
  const overlaps =
    input.matchedChallengeTags?.filter(Boolean).slice(0, 6).join(', ') ||
    'none';
  return [
    'Stated preference fit (0–100 from tags — treat as hard evidence):',
    `- Challenges / topics: ${n(input.challenge)}`,
    `- Geography: ${n(input.geography)}`,
    `- Stage: ${n(input.stage)}`,
    `- Solution types: ${n(input.solution)}`,
    `- Capital / commercial: ${n(input.commercial)}`,
    `- Ticket size: ${n(input.ticket)}`,
    `Overlapping challenge tags: ${overlaps}`,
    `Rule-based preference score: ${n(input.ruleScore)}/100`,
  ].join('\n');
}
