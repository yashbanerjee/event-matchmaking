import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const aqua = await prisma.organization.findFirst({
    where: { code: 'INV-AQUA' },
  });
  if (!aqua) throw new Error('missing');

  const openRequestStatuses = [
    'PENDING',
    'INTEREST_ACCEPTED',
    'AWAITING_CONFIRMATION',
    'SCHEDULED',
  ] as const;

  const [recs, dismissals, outbound, inbound, asCompany] = await Promise.all([
    prisma.orgPeerRecommendation.findMany({
      where: { fromOrgId: aqua.id },
      include: { toOrg: { select: { code: true, name: true } } },
      orderBy: { totalScore: 'desc' },
    }),
    prisma.orgPeerRecommendationDismissal.findMany({
      where: { fromOrgId: aqua.id },
      select: { toOrgId: true },
    }),
    prisma.meetingRequest.findMany({
      where: {
        fromOrgId: aqua.id,
        status: { in: [...openRequestStatuses] },
      },
      select: { toOrgId: true },
    }),
    prisma.meetingRequest.findMany({
      where: {
        toOrgId: aqua.id,
        status: { in: [...openRequestStatuses] },
      },
      select: { fromOrgId: true },
    }),
    prisma.meeting.findMany({
      where: {
        companyOrgId: aqua.id,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
      select: { vendorOrgId: true },
    }),
  ]);

  const dismissed = new Set(dismissals.map((d) => d.toOrgId));
  const engaged = new Set([
    ...outbound.map((r) => r.toOrgId),
    ...inbound.map((r) => r.fromOrgId),
    ...asCompany.map((r) => r.vendorOrgId),
  ]);

  const sections = {
    active: [] as string[],
    engaged: [] as string[],
    dismissed: [] as string[],
  };
  for (const row of recs) {
    const label = `${row.toOrg.name} (${Math.round(row.totalScore)})`;
    if (dismissed.has(row.toOrgId)) sections.dismissed.push(label);
    else if (engaged.has(row.toOrgId)) sections.engaged.push(label);
    else sections.active.push(label);
  }
  console.log(sections);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
