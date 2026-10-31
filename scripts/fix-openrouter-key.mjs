import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function unwrap(value) {
  if (value && typeof value === 'object' && 'value' in value) {
    return value.value;
  }
  return value;
}

function sanitizeOpenRouterKey(raw) {
  let text = String(raw ?? '').trim();
  // User may have pasted: export OPENROUTER_API_KEY=sk-or-v1-...
  text = text.replace(/^export\s+/i, '');
  text = text.replace(/^OPENROUTER_API_KEY\s*=\s*/i, '');
  text = text.replace(/^JAV_AI_API_KEY\s*=\s*/i, '');
  text = text.replace(/^["']|["']$/g, '').trim();
  return text;
}

async function main() {
  const row = await prisma.systemSetting.findUnique({
    where: { key: 'ai.openrouterApiKey' },
  });
  if (!row) {
    console.log(JSON.stringify({ ok: false, error: 'ai.openrouterApiKey not found' }));
    return;
  }
  const current = unwrap(row.value);
  const cleaned = sanitizeOpenRouterKey(current);
  const changed = cleaned !== String(current ?? '');
  if (changed) {
    await prisma.systemSetting.update({
      where: { key: 'ai.openrouterApiKey' },
      data: { value: { value: cleaned } },
    });
  }
  console.log(
    JSON.stringify({
      ok: true,
      changed,
      prefix: cleaned ? `${cleaned.slice(0, 12)}…` : null,
      looksValid: /^sk-or-v1-/.test(cleaned),
      length: cleaned.length,
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
