import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const updates = [
  { key: 'ai.enabled', value: true },
  { key: 'ai.primaryProvider', value: 'jav' },
  { key: 'ai.secondaryProvider', value: 'none' },
  { key: 'ai.javBaseUrl', value: 'https://openrouter.ai/api/v1' },
  { key: 'ai.javChatModel', value: '~typesafe/jev-latest' },
  { key: 'ai.matchmakingMode', value: 'llm' },
  { key: 'ai.matchmakingBlendWeight', value: 0.3 },
];

async function main() {
  for (const item of updates) {
    await prisma.systemSetting.upsert({
      where: { key: item.key },
      create: { key: item.key, value: { value: item.value } },
      update: { value: { value: item.value } },
    });
  }
  await prisma.featureFlag.upsert({
    where: { key: 'ai_enabled' },
    create: {
      key: 'ai_enabled',
      enabled: true,
      description: 'Global switch for Jev AI matchmaking / recommendations',
    },
    update: { enabled: true },
  });
  console.log(
    JSON.stringify({
      ok: true,
      updated: updates.map((u) => u.key),
      note: 'Paste OpenRouter sk-or-v1-… key in Admin → System Settings → OpenRouter API key',
    }),
  );
}

main()
  .catch((err) => {
    console.error(JSON.stringify({ ok: false, error: err.message }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
