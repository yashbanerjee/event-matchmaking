/**
 * Rule-score investor↔innovator recommendations for every eligible org.
 * Use when Recommendations are empty after a seed / matchmaking reset.
 *
 *   npx tsx scripts/backfill-peer-recs.ts
 */
import { PrismaClient } from '@prisma/client';
import {
  calculateMatchScore,
  companyToProfileFeatures,
  selectDiverseTop,
  vendorToProfileFeatures,
} from '@em/domain';
import {
  defaultMatchingWeights,
  meetsTagCategoryThresholds,
  PEER_RECOMMENDATIONS_MAX_PER_ORG,
  resolveMatchingWeights,
  resolveTagCategoryThresholds,
} from '@em/shared';

const prisma = new PrismaClient();

async function loadWeights() {
  const rule = await prisma.matchingRule.findUnique({
    where: { code: 'DEFAULT' },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
  });
  return resolveMatchingWeights(
    rule?.versions[0]?.weights ?? defaultMatchingWeights,
  );
}

async function loadEquivalences() {
  const mappings = await prisma.filterTagMapping.findMany({
    include: {
      fromTag: { select: { label: true, value: true } },
      toTag: { select: { label: true, value: true } },
    },
  });
  const edges: Array<{ from: string; to: string; bidirectional: boolean }> = [];
  for (const mapping of mappings) {
    const pairs = [
      [mapping.fromTag.value, mapping.toTag.value],
      [mapping.fromTag.label, mapping.toTag.label],
      [mapping.fromTag.value, mapping.toTag.label],
      [mapping.fromTag.label, mapping.toTag.value],
    ] as const;
    for (const [from, to] of pairs) {
      edges.push({ from, to, bidirectional: mapping.bidirectional });
    }
  }
  return edges;
}

async function loadTagLabels() {
  const tags = await prisma.filterTag.findMany({
    select: { value: true, label: true },
  });
  const index: Record<string, string> = {};
  for (const tag of tags) {
    index[tag.value.trim().toLowerCase()] = tag.label;
  }
  return index;
}

async function getThreshold() {
  const row = await prisma.systemSetting.findUnique({
    where: { key: 'ops.recommendationScoreThreshold' },
  });
  const raw =
    row &&
    typeof row.value === 'object' &&
    row.value !== null &&
    'value' in row.value
      ? Number((row.value as { value: unknown }).value)
      : 50;
  return Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 50;
}

async function getTagCategoryThresholds() {
  const row = await prisma.systemSetting.findUnique({
    where: { key: 'ops.tagCategoryThresholds' },
  });
  const raw =
    row &&
    typeof row.value === 'object' &&
    row.value !== null &&
    'value' in row.value
      ? (row.value as { value: unknown }).value
      : row?.value;
  return resolveTagCategoryThresholds(raw);
}

function stampAttrs(existing: unknown) {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  return {
    ...base,
    peerRecsComputedAt: new Date().toISOString(),
  };
}

async function syncFrom(
  fromOrgId: string,
  perspective: 'COMPANY' | 'VENDOR',
  scored: Array<{
    toOrgId: string;
    fromProfileVersion: number;
    toProfileVersion: number;
    matchedChallengeTags: string[];
    pair: {
      ruleScore: number;
      aiScore: number | null;
      totalScore: number;
      reasons: string[];
      aiDescription: string | null;
      scoreBreakdown: Record<string, number | string>;
    };
  }>,
  threshold: number,
  tagCategoryThresholds: ReturnType<typeof resolveTagCategoryThresholds>,
) {
  const manual = await prisma.orgPeerRecommendation.findMany({
    where: { fromOrgId, source: 'MANUAL' },
    select: { toOrgId: true },
  });
  const manualToIds = new Set(manual.map((row) => row.toOrgId));
  const slots = Math.max(0, PEER_RECOMMENDATIONS_MAX_PER_ORG - manualToIds.size);

  const ranked = [...scored]
    .sort((a, b) => b.pair.totalScore - a.pair.totalScore)
    .filter((row) => {
      if (manualToIds.has(row.toOrgId)) return false;
      if (row.pair.totalScore < threshold) return false;
      return meetsTagCategoryThresholds(
        row.pair.scoreBreakdown,
        tagCategoryThresholds,
      ).ok;
    });

  const top = selectDiverseTop(
    ranked,
    slots,
    (row) => row.matchedChallengeTags[0] ?? row.toOrgId,
    2,
  );
  const keep = new Set([...manualToIds, ...top.map((row) => row.toOrgId)]);

  if (keep.size === 0) {
    await prisma.orgPeerRecommendation.deleteMany({
      where: { fromOrgId, source: 'COMPUTED' },
    });
  } else {
    await prisma.orgPeerRecommendation.deleteMany({
      where: {
        fromOrgId,
        source: 'COMPUTED',
        toOrgId: { notIn: [...keep] },
      },
    });
  }

  const now = new Date();
  for (const row of top) {
    const existing = await prisma.orgPeerRecommendation.findUnique({
      where: {
        fromOrgId_toOrgId: { fromOrgId, toOrgId: row.toOrgId },
      },
    });
    if (existing?.source === 'MANUAL') continue;
    await prisma.orgPeerRecommendation.upsert({
      where: {
        fromOrgId_toOrgId: { fromOrgId, toOrgId: row.toOrgId },
      },
      create: {
        fromOrgId,
        toOrgId: row.toOrgId,
        perspective,
        source: 'COMPUTED',
        fromProfileVersion: row.fromProfileVersion,
        toProfileVersion: row.toProfileVersion,
        ruleScore: row.pair.ruleScore,
        aiScore: null,
        totalScore: row.pair.totalScore,
        reasons: row.pair.reasons,
        aiDescription: null,
        scoreBreakdown: row.pair.scoreBreakdown,
        computedAt: now,
      },
      update: {
        perspective,
        source: 'COMPUTED',
        fromProfileVersion: row.fromProfileVersion,
        toProfileVersion: row.toProfileVersion,
        ruleScore: row.pair.ruleScore,
        aiScore: null,
        totalScore: row.pair.totalScore,
        reasons: row.pair.reasons,
        aiDescription: null,
        scoreBreakdown: row.pair.scoreBreakdown,
        computedAt: now,
      },
    });
  }

  const org = await prisma.organization.findUnique({
    where: { id: fromOrgId },
    select: { customAttrs: true },
  });
  await prisma.organization.update({
    where: { id: fromOrgId },
    data: { customAttrs: stampAttrs(org?.customAttrs) },
  });

  return top.length;
}

async function main() {
  const [weights, equivalences, tagLabels, threshold, tagCategoryThresholds] =
    await Promise.all([
      loadWeights(),
      loadEquivalences(),
      loadTagLabels(),
      getThreshold(),
      getTagCategoryThresholds(),
    ]);

  const companies = await prisma.company.findMany({
    where: {
      matchingEligible: true,
      approvalStatus: 'VERIFIED',
      verificationStatus: 'VERIFIED',
      organization: { status: { not: 'ARCHIVED' } },
    },
    include: { organization: true },
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

  console.log(
    `Backfilling peer recommendations for ${companies.length} investors and ${vendors.length} innovators (threshold ${threshold})…`,
  );

  let investorUpserts = 0;
  for (const company of companies) {
    const companyFeatures = companyToProfileFeatures({
      organizationId: company.organizationId,
      preferredCategories: company.preferredCategories,
      requiredCapabilities: company.requiredCapabilities,
      commercialPrefs: company.commercialPrefs,
      normalizedProfile: company.normalizedProfile,
      organization: company.organization,
    });
    const scored = vendors.map((vendor) => {
      const vendorFeatures = vendorToProfileFeatures({
        organizationId: vendor.organizationId,
        capabilities: vendor.capabilities,
        categories: vendor.categories,
        operatingRegions: vendor.operatingRegions,
        commercialPrefs: vendor.commercialPrefs,
        normalizedProfile: vendor.normalizedProfile,
        organization: vendor.organization,
      });
      const rule = calculateMatchScore(
        companyFeatures,
        vendorFeatures,
        weights,
        equivalences,
        tagLabels,
      );
      return {
        toOrgId: vendor.organizationId,
        fromProfileVersion: company.profileVersion,
        toProfileVersion: vendor.profileVersion,
        matchedChallengeTags: rule.matchedChallengeTags,
        pair: {
          ruleScore: rule.totalScore,
          aiScore: null as number | null,
          totalScore: rule.totalScore,
          reasons: rule.reasons,
          aiDescription: null as string | null,
          scoreBreakdown: rule.breakdown as unknown as Record<
            string,
            number | string
          >,
        },
      };
    });
    const n = await syncFrom(
      company.organizationId,
      'COMPANY',
      scored,
      threshold,
      tagCategoryThresholds,
    );
    investorUpserts += n;
    console.log(`  ${company.organization.code}: ${n} innovator matches`);
  }

  let innovatorUpserts = 0;
  for (const vendor of vendors) {
    const vendorFeatures = vendorToProfileFeatures({
      organizationId: vendor.organizationId,
      capabilities: vendor.capabilities,
      categories: vendor.categories,
      operatingRegions: vendor.operatingRegions,
      commercialPrefs: vendor.commercialPrefs,
      normalizedProfile: vendor.normalizedProfile,
      organization: vendor.organization,
    });
    const scored = companies.map((company) => {
      const companyFeatures = companyToProfileFeatures({
        organizationId: company.organizationId,
        preferredCategories: company.preferredCategories,
        requiredCapabilities: company.requiredCapabilities,
        commercialPrefs: company.commercialPrefs,
        normalizedProfile: company.normalizedProfile,
        organization: company.organization,
      });
      const rule = calculateMatchScore(
        companyFeatures,
        vendorFeatures,
        weights,
        equivalences,
        tagLabels,
      );
      return {
        toOrgId: company.organizationId,
        fromProfileVersion: vendor.profileVersion,
        toProfileVersion: company.profileVersion,
        matchedChallengeTags: rule.matchedChallengeTags,
        pair: {
          ruleScore: rule.totalScore,
          aiScore: null as number | null,
          totalScore: rule.totalScore,
          reasons: rule.reasons,
          aiDescription: null as string | null,
          scoreBreakdown: rule.breakdown as unknown as Record<
            string,
            number | string
          >,
        },
      };
    });
    const n = await syncFrom(
      vendor.organizationId,
      'VENDOR',
      scored,
      threshold,
      tagCategoryThresholds,
    );
    innovatorUpserts += n;
    if (n > 0) {
      console.log(`  ${vendor.organization.code}: ${n} investor matches`);
    }
  }

  const companyFrom = await prisma.orgPeerRecommendation.count({
    where: { perspective: 'COMPANY' },
  });
  const vendorFrom = await prisma.orgPeerRecommendation.count({
    where: { perspective: 'VENDOR' },
  });

  console.log(`
Done.
  Investor→innovator rows written this run: ${investorUpserts}
  Innovator→investor rows written this run: ${innovatorUpserts}
  DB totals: COMPANY perspective ${companyFrom}, VENDOR perspective ${vendorFrom}
`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
