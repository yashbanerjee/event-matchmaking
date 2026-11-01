import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const investors = await prisma.organization.findMany({
    where: { type: 'COMPANY', status: { not: 'ARCHIVED' } },
    orderBy: { code: 'asc' },
    take: 5,
    select: { id: true, code: true, name: true },
  });
  console.log(
    'Investors sample:',
    investors.map((i) => `${i.code} ${i.name}`),
  );

  for (const inv of investors.slice(0, 3)) {
    const recs = await prisma.orgPeerRecommendation.findMany({
      where: { fromOrgId: inv.id },
      include: {
        toOrg: { select: { code: true, name: true, type: true } },
      },
      orderBy: { totalScore: 'desc' },
      take: 8,
    });
    console.log(`\nFrom ${inv.code} count=${recs.length}`);
    for (const row of recs) {
      console.log(
        `  ${row.source} ${row.perspective} ${row.totalScore} -> ${row.toOrg.type} ${row.toOrg.code} ${row.toOrg.name}`,
      );
    }
  }

  const all = await prisma.orgPeerRecommendation.findMany({
    include: {
      fromOrg: { select: { type: true, code: true } },
      toOrg: { select: { type: true, code: true } },
    },
  });
  const bad = all.filter((row) => row.fromOrg.type === row.toOrg.type);
  console.log(`\nSame-type rows: ${bad.length} of ${all.length}`);
  console.log({
    COMPANY: all.filter((row) => row.fromOrg.type === 'COMPANY').length,
    VENDOR: all.filter((row) => row.fromOrg.type === 'VENDOR').length,
  });

  const companyFromCounts = new Map<string, number>();
  for (const row of all.filter((r) => r.fromOrg.type === 'COMPANY')) {
    companyFromCounts.set(
      row.fromOrg.code,
      (companyFromCounts.get(row.fromOrg.code) ?? 0) + 1,
    );
  }
  console.log(
    'Investor rec counts:',
    [...companyFromCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15),
  );

  const vendorFromCounts = new Map<string, number>();
  for (const row of all.filter((r) => r.fromOrg.type === 'VENDOR')) {
    vendorFromCounts.set(
      row.fromOrg.code,
      (vendorFromCounts.get(row.fromOrg.code) ?? 0) + 1,
    );
  }
  console.log(
    'Innovator rec counts (top):',
    [...vendorFromCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8),
  );
  console.log('Innovators with any recs:', vendorFromCounts.size);

  if (bad.length) {
    console.log(
      'Bad examples:',
      bad.slice(0, 10).map((row) => ({
        from: row.fromOrg.code,
        to: row.toOrg.code,
        perspective: row.perspective,
        source: row.source,
      })),
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
