import { PrismaClient } from '@prisma/client';
import {
  calculateMatchScore,
  companyToProfileFeatures,
  vendorToProfileFeatures,
} from '@em/domain';
import {
  defaultMatchingWeights,
  meetsTagCategoryThresholds,
  resolveMatchingWeights,
  resolveTagCategoryThresholds,
} from '@em/shared';

const prisma = new PrismaClient();

async function main() {
  const weights = resolveMatchingWeights(defaultMatchingWeights);
  const floors = resolveTagCategoryThresholds(undefined);

  const companies = await prisma.company.findMany({
    include: { organization: true },
  });
  const vendors = await prisma.vendor.findMany({
    include: { organization: true },
  });

  const near: Array<{
    from: string;
    to: string;
    total: number;
    breakdown: Record<string, number>;
    passesFloors: boolean;
  }> = [];

  for (const company of companies) {
    const left = companyToProfileFeatures({
      organizationId: company.organizationId,
      preferredCategories: company.preferredCategories,
      requiredCapabilities: company.requiredCapabilities,
      commercialPrefs: company.commercialPrefs,
      normalizedProfile: company.normalizedProfile,
      organization: {
        industry: company.organization.industry,
        region: company.organization.region,
      },
    });
    for (const vendor of vendors) {
      const right = vendorToProfileFeatures({
        organizationId: vendor.organizationId,
        capabilities: vendor.capabilities,
        categories: vendor.categories,
        operatingRegions: vendor.operatingRegions,
        commercialPrefs: vendor.commercialPrefs,
        normalizedProfile: vendor.normalizedProfile,
        organization: { industry: vendor.organization.industry },
      });
      const scored = calculateMatchScore(left, right, weights);
      if (scored.totalScore < 60) continue;
      near.push({
        from: company.organization.code ?? company.organization.name,
        to: vendor.organization.code ?? vendor.organization.name,
        total: scored.totalScore,
        breakdown: scored.breakdown as unknown as Record<string, number>,
        passesFloors: meetsTagCategoryThresholds(scored.breakdown, floors),
      });
    }
  }

  near.sort((a, b) => b.total - a.total);
  console.log('pairs >=60:', near.length);
  console.log('pairs >=75:', near.filter((p) => p.total >= 75).length);
  console.log('pairs >=75 + floors:', near.filter((p) => p.total >= 75 && p.passesFloors).length);
  for (const row of near.slice(0, 20)) {
    console.log(
      Math.round(row.total),
      row.passesFloors ? 'PASS' : 'FAIL',
      row.from,
      '->',
      row.to,
      row.breakdown,
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
