import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

// Load apps/api/.env so DATABASE_URL is available without shell injection.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  const envText = readFileSync(resolve(root, 'apps/api/.env'), 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
} catch {
  // Caller may already have DATABASE_URL set.
}

const prisma = new PrismaClient();

function unwrap(value) {
  if (value && typeof value === 'object' && 'value' in value) {
    return value.value;
  }
  return value;
}

async function main() {
  const keys = [
    'ai.enabled',
    'ai.primaryProvider',
    'ai.javBaseUrl',
    'ai.javChatModel',
    'ai.javFineTunedModel',
    'ai.matchmakingMode',
    'ai.openrouterApiKey',
    'ai.javApiKey',
    'ai.openaiApiKey',
  ];
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: keys } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, unwrap(r.value)]));
  const flag = await prisma.featureFlag.findUnique({
    where: { key: 'ai_enabled' },
  });

  function sanitizeKey(raw) {
    let text = String(raw ?? '').trim();
    text = text.replace(/^export\s+/i, '');
    text = text.replace(/^OPENROUTER_API_KEY\s*=\s*/i, '');
    text = text.replace(/^JAV_AI_API_KEY\s*=\s*/i, '');
    text = text.replace(/^["']|["']$/g, '').trim();
    return text;
  }

  const apiKey = sanitizeKey(
    map['ai.openrouterApiKey'] || map['ai.javApiKey'] || '',
  );

  const baseUrl = String(
    map['ai.javBaseUrl'] || 'https://openrouter.ai/api/v1',
  ).replace(/\/$/, '');
  const model =
    (typeof map['ai.javFineTunedModel'] === 'string' &&
      map['ai.javFineTunedModel'].trim()) ||
    String(map['ai.javChatModel'] || '~typesafe/jev-latest');

  const report = {
    settings: {
      featureFlagAiEnabled: flag?.enabled ?? null,
      aiEnabled: map['ai.enabled'] ?? null,
      primaryProvider: map['ai.primaryProvider'] ?? null,
      javBaseUrl: baseUrl,
      javChatModel: model,
      matchmakingMode: map['ai.matchmakingMode'] ?? null,
      openrouterKeyConfigured: Boolean(map['ai.openrouterApiKey']),
      openrouterKeyPrefix: map['ai.openrouterApiKey']
        ? `${String(map['ai.openrouterApiKey']).slice(0, 12)}…`
        : null,
    },
    checks: {},
  };

  if (!apiKey) {
    report.checks.key = {
      ok: false,
      error: 'No OpenRouter/JAV API key saved in Admin → System Settings',
    };
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // 1) OpenRouter models / auth health
  const healthStarted = Date.now();
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://ethara.com',
        'X-Title': 'Ethara Matchmaking',
      },
      signal: AbortSignal.timeout(20000),
    });
    report.checks.openrouterModels = {
      ok: res.ok,
      status: res.status,
      latencyMs: Date.now() - healthStarted,
      error: res.ok ? undefined : await res.text().then((t) => t.slice(0, 300)),
    };
  } catch (err) {
    report.checks.openrouterModels = {
      ok: false,
      latencyMs: Date.now() - healthStarted,
      error: err.message,
    };
  }

  // 2) Live Jev pair score via OpenRouter Decisions API
  const decisionsUrl = baseUrl.includes('openrouter.ai')
    ? 'https://openrouter.ai/api/alpha/decisions'
    : baseUrl.replace(/\/v1\/?$/, '/alpha/decisions');
  const chatStarted = Date.now();
  try {
    const res = await fetch(decisionsUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ethara.com',
        'X-Title': 'Ethara Matchmaking',
      },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model,
        state: {
          clientProfile: 'Preferred: Concerts, Sports. Needs: hospitality.',
          guestProfile: 'Categories: Arts & Culture, Motorsport. UAE.',
        },
        questions: {
          fit: {
            type: 'score',
            instructions:
              'How strong is the match for a short Ethara networking meeting between this client and guest?',
            criteria: [
              'Poor fit — little overlap in needs or categories',
              'Weak fit — some overlap but limited meeting value',
              'Moderate fit — clear shared interests worth exploring',
              'Strong fit — strong commercial or category alignment',
              'Excellent fit — highly complementary profiles, prioritize meeting',
            ],
          },
        },
      }),
    });
    const body = await res.json().catch(() => ({}));
    const answer = body?.answers?.fit;
    const rawScore = typeof answer?.score === 'number' ? answer.score : null;
    const normalized =
      rawScore == null ? null : Math.round((rawScore / 4) * 10000) / 10000;
    const legendKey =
      rawScore == null
        ? null
        : String(Math.max(0, Math.min(4, Math.round(rawScore))));
    const rationale =
      (legendKey && answer?.legend?.[legendKey]) || null;
    report.checks.jevPairScore = {
      ok: res.ok && rawScore != null,
      status: res.status,
      latencyMs: Date.now() - chatStarted,
      model,
      decisionsUrl,
      rawScore,
      score: normalized,
      rationale,
      confidence: answer?.confidence ?? null,
      error: res.ok
        ? rawScore != null
          ? undefined
          : `Unexpected response: ${JSON.stringify(body).slice(0, 240)}`
        : JSON.stringify(body).slice(0, 400),
    };
  } catch (err) {
    report.checks.jevPairScore = {
      ok: false,
      latencyMs: Date.now() - chatStarted,
      model,
      error: err.message,
    };
  }

  report.summary = {
    working:
      Boolean(report.checks.openrouterModels?.ok) &&
      Boolean(report.checks.jevPairScore?.ok),
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((err) => {
    console.error(JSON.stringify({ ok: false, error: err.message }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
