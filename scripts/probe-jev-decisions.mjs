import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function unwrap(value) {
  if (value && typeof value === 'object' && 'value' in value) return value.value;
  return value;
}

function sanitizeKey(raw) {
  let text = String(raw ?? '').trim();
  text = text.replace(/^export\s+/i, '');
  text = text.replace(/^OPENROUTER_API_KEY\s*=\s*/i, '');
  text = text.replace(/^["']|["']$/g, '').trim();
  return text;
}

async function main() {
  const row = await prisma.systemSetting.findUnique({
    where: { key: 'ai.openrouterApiKey' },
  });
  const key = sanitizeKey(unwrap(row?.value));
  const started = Date.now();
  const res = await fetch('https://openrouter.ai/api/alpha/decisions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://ethara.com',
      'X-Title': 'Ethara Matchmaking',
    },
    body: JSON.stringify({
      model: '~typesafe/jev-latest',
      state: {
        clientProfile: 'Preferred: Concerts, Sports. Needs: hospitality.',
        guestProfile: 'Categories: Arts & Culture, Motorsport. Region: UAE.',
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
  const text = await res.text();
  console.log(
    JSON.stringify(
      {
        status: res.status,
        latencyMs: Date.now() - started,
        body: text.slice(0, 2500),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
