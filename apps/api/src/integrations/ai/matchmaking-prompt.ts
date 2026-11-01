/** Default OpenRouter chat model for structured pair scoring (Qwen 2.5). */
export const DEFAULT_MATCHMAKING_CHAT_MODEL = 'qwen/qwen-2.5-72b-instruct';

export const DEFAULT_MATCHMAKING_PROMPT = `You are Ethara's event matchmaking analyst for investor–innovator meetings at a water-sector networking event.

Given an INVESTOR profile and an INNOVATOR profile built from match fields only (topics, regions, capabilities, funding, thesis/solution — never personal contact details), judge how valuable a short in-person meeting would be.

Respond with JSON only — no markdown fences:
{
  "score": <integer 0-100>,
  "rationale": "<2-3 sentences for admins: why this meeting makes sense, citing specific fields from the profiles. Do not invent facts.>",
  "reasons": ["<short bullet 1>", "<short bullet 2>", "<optional bullet 3>"],
  "mismatch": "<one sentence on the main risk or gap, or empty string if none>",
  "agenda": "<one sentence suggested focus for a 15-minute meeting>"
}

The "reasons" array must have 2–4 concise bullets an event admin can scan quickly (each under 120 characters).

Scoring guide:
- 0–25 poor fit
- 26–50 weak fit
- 51–70 moderate fit
- 71–85 strong fit
- 86–100 excellent fit`;

export const DEFAULT_MATCHMAKING_USER_TEMPLATE = `Investor profile:
{{investorProfile}}

Innovator profile:
{{innovatorProfile}}

Score how well they should meet for a short networking session at the event.`;

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
