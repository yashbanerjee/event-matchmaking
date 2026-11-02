/**
 * Restore AquaHorizon's top innovator recommendations for portal + admin parity:
 * clear dismissals on the known top matches, recompute tag scores, upsert rows.
 */
import { PrismaClient } from '@prisma/client';
import {
  calculateMatchScore,
  companyToProfileFeatures,
  vendorToProfileFeatures,
} from '@em/domain';
import {
  clampRecommendationLimit,
  DEFAULT_INVESTOR_RECOMMENDATION_LIMIT,
  defaultMatchingWeights,
  resolveMatchingWeights,
} from '@em/shared';

const prisma = new PrismaClient();

const PRIORITY_CODES = [
  'INN-AQUALIS',
  'INN-DUBAI',
  'INN-METER',
  'INN-LAGOSGRID',
];

async function main() {
  const weights = resolveMatchingWeights(defaultMatchingWeights);
  const aqua = await prisma.organization.findFirst({
    where: { code: 'INV-AQUA' },
    include: { company: true },
  });
  if (!aqua?.company) throw new Error('INV-AQUA / company missing');

  const priorityPeers = await prisma.organization.findMany({
    where: { code: { in: PRIORITY_CODES } },
    select: { id: true, code: true },
  });
  const priorityIds = priorityPeers.map((p) => p.id);

  const clearedDismissals =
    await prisma.orgPeerRecommendationDismissal.deleteMany({
      where: { fromOrgId: aqua.id, toOrgId: { in: priorityIds } },
    });
  console.log('cleared priority dismissals', clearedDismissals.count);

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

  const vendors = await prisma.vendor.findMany({
    where: {
      matchingEligible: true,
      approvalStatus: 'VERIFIED',
      verificationStatus: 'VERIFIED',
      onboardingComplete: true,
      organization: { status: { not: 'ARCHIVED' } },
    },
    include: { organization: true },
  });

  const thresholdSetting = await prisma.systemSetting.findUnique({
    where: { key: 'ops.recommendationScoreThreshold' },
  });
  const thresholdRaw = Number(thresholdSetting?.value ?? 75);
  const threshold = Number.isFinite(thresholdRaw) ? thresholdRaw : 75;

  const limitSetting = await prisma.systemSetting.findUnique({
    where: { key: 'ops.investorRecommendationLimit' },
  });
  const roleLimit = clampRecommendationLimit(
    limitSetting?.value,
    DEFAULT_INVESTOR_RECOMMENDATION_LIMIT,
  );

  const dismissed = await prisma.orgPeerRecommendationDismissal.findMany({
    where: { fromOrgId: aqua.id },
    select: { toOrgId: true },
  });
  const dismissedIds = new Set(dismissed.map((d) => d.toOrgId));

  const scored = vendors
    .map((vendor) => {
      const right = vendorToProfileFeatures({
        organizationId: vendor.organizationId,
        capabilities: vendor.capabilities,
        categories: vendor.categories,
        operatingRegions: vendor.operatingRegions,
        commercialPrefs: vendor.commercialPrefs,
        normalizedProfile: vendor.normalizedProfile,
        organization: {
          industry: vendor.organization.industry,
        },
      });
      const score = calculateMatchScore(left, right, weights);
      return {
        toOrgId: vendor.organizationId,
        code: vendor.organization.code,
        name: vendor.organization.name,
        totalScore: score.totalScore,
        breakdown: score.breakdown,
        reasons: score.reasons,
        toProfileVersion: vendor.profileVersion,
      };
    })
    .filter((row) => !dismissedIds.has(row.toOrgId))
    .filter((row) => row.totalScore >= threshold)
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, roleLimit);

  console.log(
    'selected',
    scored.map((r) => ({
      code: r.code,
      name: r.name,
      score: Math.round(r.totalScore),
    })),
  );

  await prisma.orgPeerRecommendation.deleteMany({
    where: { fromOrgId: aqua.id, source: 'COMPUTED' },
  });

  const now = new Date();
  for (const row of scored) {
    await prisma.orgPeerRecommendation.create({
      data: {
        fromOrgId: aqua.id,
        toOrgId: row.toOrgId,
        perspective: 'COMPANY',
        source: 'COMPUTED',
        ruleScore: row.totalScore,
        aiScore: null,
        totalScore: row.totalScore,
        reasons: row.reasons,
        aiDescription: null,
        scoreBreakdown: row.breakdown,
        fromProfileVersion: aqua.company.profileVersion,
        toProfileVersion: row.toProfileVersion,
        computedAt: now,
      },
    });
  }

  // Aqualis has an open meeting/request — keep that engagement; portal should
  // list it under "Meeting or request in progress".
  const after = await prisma.orgPeerRecommendation.findMany({
    where: { fromOrgId: aqua.id },
    include: { toOrg: { select: { code: true, name: true } } },
    orderBy: { totalScore: 'desc' },
  });
  console.log(
    'stored',
    after.map((r) => ({
      code: r.toOrg.code,
      name: r.toOrg.name,
      score: Math.round(r.totalScore),
    })),
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
