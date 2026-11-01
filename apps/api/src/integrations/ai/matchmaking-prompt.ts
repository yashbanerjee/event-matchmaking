/** Default OpenRouter chat model for structured pair scoring (Qwen 2.5). */
export const DEFAULT_MATCHMAKING_CHAT_MODEL = 'qwen/qwen-2.5-72b-instruct';

/**
 * Water / climate networking default. Tag engine already enforces hard
 * floors (challenge, geography, stage); the model judges narrative fit.
 */
export const DEFAULT_MATCHMAKING_PROMPT = `You are Ethara's matchmaking analyst for short investor–innovator meetings at a water and climate networking event.

Hard constraints (region, stage, ticket, required topics) are already filtered by the tag engine. Your job is narrative fit: thesis vs solution, deployment evidence, capital instrument alignment, and whether a 15-minute meeting is worth both sides' time.

Never use or invent personal contact details (names of people, emails, phones, LinkedIn). Rely only on organization/match fields in the profiles.

Respond with JSON only — no markdown fences:
{
  "score": <integer 0-100>,
  "rationale": "<2-3 sentences citing specific profile fields. Do not invent facts.>",
  "reasons": ["<short bullet 1>", "<short bullet 2>", "<optional bullet 3>"],
  "mismatch": "<one sentence on the main risk or gap, or empty string if none>",
  "agenda": "<one sentence suggested focus for a 15-minute meeting>"
}

The "reasons" array must have 2–4 concise bullets (each under 120 characters).

Scoring guide (be decisive — weak pairs should score below 70):
- 0–25 poor fit
- 26–50 weak fit
- 51–70 moderate fit
- 71–85 strong fit (recommend a meeting)
- 86–100 excellent fit (prioritize)`;

export const DEFAULT_MATCHMAKING_USER_TEMPLATE = `Investor profile:
{{investorProfile}}

Innovator profile:
{{innovatorProfile}}

Score how well they should meet for a short water/climate networking session. Return JSON with score and a 2–3 sentence rationale.`;

export function applyMatchmakingUserTemplate(
  template: string,
  input: { investorProfile: string; innovatorProfile: string },
): string {
  const tpl = template.trim() || DEFAULT_MATCHMAKING_USER_TEMPLATE;
  return tpl
    .replaceAll('{{investorProfile}}', input.investorProfile)
    .replaceAll('{{innovatorProfile}}', input.innovatorProfile)
    .replaceAll('{{left}}', input.investorProfile)
    .replaceAll('{{right}}', input.innovatorProfile);
}
