import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const aqua = await prisma.organization.findFirst({
    where: { code: 'INV-AQUA' },
  });
  if (!aqua) throw new Error('INV-AQUA missing');

  const codes = ['INN-AQUALIS', 'INN-DUBAI', 'INN-METER', 'INN-LAGOSGRID'];
  const orgs = await prisma.organization.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true, name: true },
  });
  console.log('targets', orgs);

  const recs = await prisma.orgPeerRecommendation.findMany({
    where: {
      fromOrgId: aqua.id,
      toOrgId: { in: orgs.map((o) => o.id) },
    },
    select: { toOrgId: true, totalScore: true, source: true },
  });
  console.log(
    'peer rows for top4',
    recs.map((r) => ({
      ...r,
      code: orgs.find((o) => o.id === r.toOrgId)?.code,
    })),
  );

  const allRecs = await prisma.orgPeerRecommendation.findMany({
    where: { fromOrgId: aqua.id },
    include: { toOrg: { select: { code: true, name: true } } },
    orderBy: { totalScore: 'desc' },
    take: 10,
  });
  console.log(
    'top stored',
    allRecs.map((r) => ({
      code: r.toOrg.code,
      name: r.toOrg.name,
      score: r.totalScore,
      source: r.source,
    })),
  );

  const diss = await prisma.orgPeerRecommendationDismissal.findMany({
    where: {
      fromOrgId: aqua.id,
      toOrgId: { in: orgs.map((o) => o.id) },
    },
  });
  console.log(
    'dismissals for top4',
    diss.map((d) => orgs.find((o) => o.id === d.toOrgId)?.code),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
