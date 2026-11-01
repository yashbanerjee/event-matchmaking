import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const orgs = await prisma.organization.findMany({
    where: { type: { in: ['COMPANY', 'VENDOR'] }, status: { not: 'ARCHIVED' } },
    include: {
      company: {
        select: {
          preferredCategories: true,
          requiredCapabilities: true,
          matchingEligible: true,
          approvalStatus: true,
          updatedAt: true,
        },
      },
      vendor: {
        select: {
          categories: true,
          capabilities: true,
          matchingEligible: true,
          approvalStatus: true,
          onboardingComplete: true,
          updatedAt: true,
        },
      },
    },
    orderBy: { code: 'asc' },
  });

  let stamped = 0;
  let stampNoRecs = 0;
  let noStamp = 0;
  let noTags = 0;

  for (const org of orgs) {
    const attrs =
      org.customAttrs && typeof org.customAttrs === 'object'
        ? (org.customAttrs as Record<string, unknown>)
        : {};
    const stamp =
      typeof attrs.peerRecsComputedAt === 'string'
        ? attrs.peerRecsComputedAt
        : null;
    const tags =
      (org.company?.preferredCategories.length ?? 0) +
      (org.company?.requiredCapabilities.length ?? 0) +
      (org.vendor?.categories.length ?? 0) +
      (org.vendor?.capabilities.length ?? 0);
    if (tags === 0) noTags += 1;
    const recCount = await prisma.orgPeerRecommendation.count({
      where: { fromOrgId: org.id },
    });
    if (stamp) {
      stamped += 1;
      if (recCount === 0) stampNoRecs += 1;
    } else {
      noStamp += 1;
    }
    if (org.type === 'COMPANY' && (stamp || recCount > 0 || org.code.startsWith('INV-NILE') || org.code.startsWith('INV-AQUA') || org.code.startsWith('INV-AMAZONAS'))) {
      console.log({
        code: org.code,
        stamp,
        recCount,
        tags,
        eligible: org.company?.matchingEligible,
        approval: org.company?.approvalStatus,
        updatedAt: org.company?.updatedAt,
      });
    }
  }

  console.log({
    total: orgs.length,
    stamped,
    stampNoRecs,
    noStamp,
    noTags,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
