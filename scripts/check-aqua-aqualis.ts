import { PrismaClient } from '@prisma/client';
import {
  calculateMatchScore,
  companyToProfileFeatures,
  vendorToProfileFeatures,
} from '@em/domain';
import { defaultMatchingWeights, resolveMatchingWeights } from '@em/shared';

const prisma = new PrismaClient();

async function main() {
  const weights = resolveMatchingWeights(defaultMatchingWeights);
  const aqua = await prisma.organization.findFirst({
    where: { code: 'INV-AQUA' },
    include: { company: true },
  });
  const aqualis = await prisma.organization.findFirst({
    where: { code: 'INN-AQUALIS' },
    include: { vendor: true },
  });
  console.log({
    aquaEmail: (
      await prisma.organizationMember.findFirst({
        where: { organizationId: aqua?.id },
        include: { user: true },
      })
    )?.user.email,
    aqualisEmail: (
      await prisma.organizationMember.findFirst({
        where: { organizationId: aqualis?.id },
        include: { user: true },
      })
    )?.user.email,
  });

  if (!aqua?.company || !aqualis?.vendor) {
    console.log('missing profiles');
    return;
  }

  const left = companyToProfileFeatures({
    organizationId: aqua.id,
    preferredCategories: aqua.company.preferredCategories,
    requiredCapabilities: aqua.company.requiredCapabilities,
    commercialPrefs: aqua.company.commercialPrefs,
    normalizedProfile: aqua.company.normalizedProfile,
    organization: {
      industry: aqua.industry,
      region: aqua.region,
    },
  });
  const right = vendorToProfileFeatures({
    organizationId: aqualis.id,
    capabilities: aqualis.vendor.capabilities,
    categories: aqualis.vendor.categories,
    operatingRegions: aqualis.vendor.operatingRegions,
    commercialPrefs: aqualis.vendor.commercialPrefs,
    normalizedProfile: aqualis.vendor.normalizedProfile,
    organization: { industry: aqualis.industry },
  });
  const score = calculateMatchScore(left, right, weights);
  console.log({
    total: score.totalScore,
    breakdown: score.breakdown,
    leftCats: left.preferredCategories,
    leftCaps: left.requirements,
    leftRegions: left.regions,
    leftStages: left.investmentStages,
    leftTicket: left.ticketSize,
    rightCats: right.categories,
    rightCaps: right.capabilities,
    rightRegions: right.regions,
    rightStages: right.investmentStages,
    rightTicket: right.ticketSize,
  });

  const recs = await prisma.orgPeerRecommendation.findMany({
    where: { fromOrgId: aqua.id },
    include: { toOrg: { select: { code: true } } },
    orderBy: { totalScore: 'desc' },
  });
  console.log(
    'stored aqua recs',
    recs.map((r) => ({ to: r.toOrg.code, score: r.totalScore })),
  );

  const allCount = await prisma.orgPeerRecommendation.count();
  console.log('total peer rows', allCount);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
