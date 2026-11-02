import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const aqua = await prisma.organization.findFirst({
    where: { code: 'INV-AQUA' },
    select: { id: true, name: true },
  });
  if (!aqua) throw new Error('INV-AQUA missing');

  const recs = await prisma.orgPeerRecommendation.findMany({
    where: { fromOrgId: aqua.id },
    include: { toOrg: { select: { id: true, code: true, name: true } } },
    orderBy: { totalScore: 'desc' },
  });
  console.log(
    'stored',
    recs.map((r) => ({
      to: r.toOrg.code,
      name: r.toOrg.name,
      score: Math.round(r.totalScore),
    })),
  );

  const openRequestStatuses = [
    'PENDING',
    'INTEREST_ACCEPTED',
    'AWAITING_CONFIRMATION',
    'SCHEDULED',
  ] as const;
  const [outbound, inbound, asCompany, dismissals] = await Promise.all([
    prisma.meetingRequest.findMany({
      where: { fromOrgId: aqua.id, status: { in: [...openRequestStatuses] } },
      select: {
        toOrgId: true,
        status: true,
        toOrg: { select: { code: true, name: true } },
      },
    }),
    prisma.meetingRequest.findMany({
      where: { toOrgId: aqua.id, status: { in: [...openRequestStatuses] } },
      select: {
        fromOrgId: true,
        status: true,
        fromOrg: { select: { code: true, name: true } },
      },
    }),
    prisma.meeting.findMany({
      where: {
        companyOrgId: aqua.id,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
      select: {
        vendorOrgId: true,
        status: true,
        vendorOrg: { select: { code: true, name: true } },
      },
    }),
    prisma.orgPeerRecommendationDismissal.findMany({
      where: { fromOrgId: aqua.id },
      select: { toOrgId: true, toOrg: { select: { code: true, name: true } } },
    }),
  ]);

  console.log('outbound requests', outbound);
  console.log('inbound requests', inbound);
  console.log('meetings', asCompany);
  console.log('dismissals', dismissals);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
