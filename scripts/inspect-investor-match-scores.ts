import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.orgPeerRecommendation.findMany({
    select: { totalScore: true, perspective: true, fromOrgId: true },
  });
  const scores = rows.map((r) => r.totalScore).sort((a, b) => b - a);
  const above = scores.filter((s) => s >= 75).length;
  console.log({
    total: scores.length,
    above75: above,
    below75: scores.length - above,
    max: scores[0],
    min: scores[scores.length - 1],
    median: scores[Math.floor(scores.length / 2)],
  });

  const companies = await prisma.company.findMany({
    include: { organization: { select: { code: true, name: true } } },
    take: 8,
  });
  for (const c of companies) {
    const np = (c.normalizedProfile ?? {}) as Record<string, unknown>;
    const responses = (np.responses ?? {}) as Record<string, unknown>;
    console.log(c.organization.code, {
      preferredCategories: c.preferredCategories,
      requiredCapabilities: c.requiredCapabilities,
      commercialPrefs: c.commercialPrefs,
      ticket: responses.ticket_size,
      stages: responses.investment_stages,
      regions: responses.regions ?? np.regions,
    });
  }

  const top = await prisma.orgPeerRecommendation.findMany({
    orderBy: { totalScore: 'desc' },
    take: 15,
    include: {
      fromOrg: { select: { code: true, type: true } },
      toOrg: { select: { code: true, type: true } },
    },
  });
  console.log('\nTop scores:');
  for (const row of top) {
    console.log(
      Math.round(row.totalScore),
      row.fromOrg.code,
      '->',
      row.toOrg.code,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
