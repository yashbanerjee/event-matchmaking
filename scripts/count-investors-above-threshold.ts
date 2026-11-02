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
  const companies = await prisma.company.findMany({ include: { organization: true } });
  const vendors = await prisma.vendor.findMany({ include: { organization: true } });
  let withHits = 0;
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
    let hits = 0;
    let best = 0;
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
      best = Math.max(best, scored.totalScore);
      if (scored.totalScore >= 75) hits += 1;
    }
    console.log(company.organization.code, { hits75: hits, best: Math.round(best) });
    if (hits > 0) withHits += 1;
  }
  console.log({ investorsWithAnyAbove75: withHits, totalInvestors: companies.length });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
