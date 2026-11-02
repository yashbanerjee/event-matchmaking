import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const companiesAll = await prisma.organization.count({
    where: { type: 'COMPANY', status: { not: 'ARCHIVED' } },
  });
  const vendorsAll = await prisma.organization.count({
    where: { type: 'VENDOR', status: { not: 'ARCHIVED' } },
  });
  const companiesEligible = await prisma.company.count({
    where: {
      matchingEligible: true,
      approvalStatus: 'VERIFIED',
      verificationStatus: 'VERIFIED',
      organization: { status: { not: 'ARCHIVED' } },
    },
  });
  const vendorsEligible = await prisma.vendor.count({
    where: {
      matchingEligible: true,
      approvalStatus: 'VERIFIED',
      verificationStatus: 'VERIFIED',
      onboardingComplete: true,
      organization: { status: { not: 'ARCHIVED' } },
    },
  });
  const companiesMatching = await prisma.company.count({
    where: {
      matchingEligible: true,
      organization: { status: { not: 'ARCHIVED' } },
    },
  });
  const vendorsMatching = await prisma.vendor.count({
    where: {
      matchingEligible: true,
      organization: { status: { not: 'ARCHIVED' } },
    },
  });
  const companiesVerified = await prisma.company.count({
    where: {
      approvalStatus: 'VERIFIED',
      organization: { status: { not: 'ARCHIVED' } },
    },
  });
  const vendorsVerified = await prisma.vendor.count({
    where: {
      approvalStatus: 'VERIFIED',
      organization: { status: { not: 'ARCHIVED' } },
    },
  });
  console.log({
    companiesAll,
    vendorsAll,
    companiesEligible,
    vendorsEligible,
    companiesMatching,
    vendorsMatching,
    companiesVerified,
    vendorsVerified,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
