import { PrismaClient } from '@prisma/client';
import { companyToProfileFeatures, vendorToProfileFeatures } from '@em/domain';

const prisma = new PrismaClient();

async function main() {
  const vendors = await prisma.vendor.findMany({
    include: { organization: true },
    take: 15,
  });
  let missingTicket = 0;
  let missingStage = 0;
  for (const v of vendors) {
    const f = vendorToProfileFeatures({
      organizationId: v.organizationId,
      capabilities: v.capabilities,
      categories: v.categories,
      operatingRegions: v.operatingRegions,
      commercialPrefs: v.commercialPrefs,
      normalizedProfile: v.normalizedProfile,
      organization: { industry: v.organization.industry },
    });
    if (!f.ticketSize) missingTicket += 1;
    if (!f.investmentStages.length) missingStage += 1;
    console.log(v.organization.code, {
      ticket: f.ticketSize,
      stages: f.investmentStages,
      cats: f.categories.slice(0, 3),
    });
  }
  console.log({ sampleMissingTicket: missingTicket, sampleMissingStage: missingStage, sample: vendors.length });

  const allVendors = await prisma.vendor.findMany({ include: { organization: true } });
  let mt = 0;
  let ms = 0;
  for (const v of allVendors) {
    const f = vendorToProfileFeatures({
      organizationId: v.organizationId,
      capabilities: v.capabilities,
      categories: v.categories,
      operatingRegions: v.operatingRegions,
      commercialPrefs: v.commercialPrefs,
      normalizedProfile: v.normalizedProfile,
      organization: { industry: v.organization.industry },
    });
    if (!f.ticketSize) mt += 1;
    if (!f.investmentStages.length) ms += 1;
  }
  console.log({ allVendors: allVendors.length, missingTicket: mt, missingStage: ms });

  const companies = await prisma.company.findMany({ include: { organization: true } });
  let ct = 0;
  let cs = 0;
  let badTicket = 0;
  const known = new Set(['under-250k', '250k-1m', '1m-5m', '5m-25m', '25m-plus']);
  for (const c of companies) {
    const f = companyToProfileFeatures({
      organizationId: c.organizationId,
      preferredCategories: c.preferredCategories,
      requiredCapabilities: c.requiredCapabilities,
      commercialPrefs: c.commercialPrefs,
      normalizedProfile: c.normalizedProfile,
      organization: {
        industry: c.organization.industry,
        region: c.organization.region,
      },
    });
    if (!f.ticketSize) ct += 1;
    else if (!known.has(f.ticketSize)) badTicket += 1;
    if (!f.investmentStages.length) cs += 1;
  }
  console.log({
    allCompanies: companies.length,
    missingTicket: ct,
    badTicket,
    missingStage: cs,
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
