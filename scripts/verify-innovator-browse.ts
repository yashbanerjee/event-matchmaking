/**
 * Smoke-check innovator directory eligibility + sample tag filter behavior.
 *
 *   npx tsx scripts/verify-innovator-browse.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [totalVendors, eligibleVendors, archivedEligible, dimensions, tags] =
    await Promise.all([
      prisma.vendor.count(),
      prisma.vendor.count({
        where: {
          matchingEligible: true,
          approvalStatus: 'VERIFIED',
          verificationStatus: 'VERIFIED',
          onboardingComplete: true,
          organization: { status: { not: 'ARCHIVED' } },
        },
      }),
      prisma.vendor.count({
        where: {
          matchingEligible: true,
          approvalStatus: 'VERIFIED',
          verificationStatus: 'VERIFIED',
          onboardingComplete: true,
          organization: { status: 'ARCHIVED' },
        },
      }),
      prisma.filterDimension.count({ where: { isActive: true } }),
      prisma.filterTag.count({ where: { isActive: true } }),
    ]);

  const sample = await prisma.vendor.findMany({
    where: {
      matchingEligible: true,
      approvalStatus: 'VERIFIED',
      verificationStatus: 'VERIFIED',
      onboardingComplete: true,
      organization: { status: { not: 'ARCHIVED' } },
    },
    include: {
      organization: { select: { name: true, industry: true, status: true } },
    },
    orderBy: { organization: { name: 'asc' } },
    take: 5,
  });

  const companies = await prisma.company.count({
    where: {
      matchingEligible: true,
      approvalStatus: 'VERIFIED',
      verificationStatus: 'VERIFIED',
      organization: { status: { not: 'ARCHIVED' } },
    },
  });

  console.log(
    JSON.stringify(
      {
        totalVendors,
        browseableInnovators: eligibleVendors,
        archivedEligibleSkipped: archivedEligible,
        browseableInvestors: companies,
        activeFilterDimensions: dimensions,
        activeFilterTags: tags,
        sampleInnovators: sample.map((v) => ({
          name: v.organization.name,
          industry: v.organization.industry,
          categories: v.categories.slice(0, 5),
          capabilities: v.capabilities.slice(0, 5),
          regions: v.operatingRegions.slice(0, 5),
        })),
        ok: eligibleVendors > 0 && dimensions >= 0,
      },
      null,
      2,
    ),
  );

  if (eligibleVendors <= 0) {
    throw new Error(
      'No browseable innovators found (need VERIFIED + matchingEligible + onboardingComplete)',
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
