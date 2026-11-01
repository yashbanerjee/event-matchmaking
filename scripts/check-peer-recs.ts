import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function dump(code: string) {
  const org = await prisma.organization.findFirst({
    where: { code },
    select: { id: true, name: true, type: true, code: true },
  });
  console.log('\n===', code, org);
  if (!org) return;
  const rows = await prisma.orgPeerRecommendation.findMany({
    where: { fromOrgId: org.id },
    include: {
      toOrg: { select: { id: true, code: true, name: true, type: true } },
    },
    orderBy: { totalScore: 'desc' },
    take: 40,
  });
  console.log('recs', rows.length);
  for (const row of rows) {
    console.log(
      row.perspective,
      row.source,
      Math.round(row.totalScore),
      '->',
      row.toOrg.type,
      row.toOrg.code,
      row.toOrg.name,
    );
  }
  const expected = org.type === 'COMPANY' ? 'VENDOR' : 'COMPANY';
  console.log(
    'wrong-type',
    rows.filter((row) => row.toOrg.type !== expected).length,
  );
}

async function main() {
  await dump('INV-NILE');
  await dump('INV-AQUA');
  await dump('INN-AQUALIS');
  await dump('INN-SAHEL');

  const cross = await prisma.orgPeerRecommendation.findMany({
    where: {
      OR: [
        { perspective: 'COMPANY', toOrg: { type: 'COMPANY' } },
        { perspective: 'VENDOR', toOrg: { type: 'VENDOR' } },
      ],
    },
    include: {
      fromOrg: { select: { code: true, type: true } },
      toOrg: { select: { code: true, type: true } },
    },
    take: 50,
  });
  console.log('\n=== same-type peer rows', cross.length);
  for (const row of cross.slice(0, 20)) {
    console.log(
      row.fromOrg.code,
      row.fromOrg.type,
      '->',
      row.toOrg.code,
      row.toOrg.type,
      row.perspective,
      row.source,
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
