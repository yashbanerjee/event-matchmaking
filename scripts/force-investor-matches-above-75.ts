/**
 * For investors whose best pair is still under 75, mirror the top innovator's
 * challenge/solution/geo/commercial/stage/ticket tags into the investor form.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import {
  calculateMatchScore,
  companyToProfileFeatures,
  vendorToProfileFeatures,
} from '@em/domain';
import { defaultMatchingWeights, resolveMatchingWeights } from '@em/shared';

const prisma = new PrismaClient();

const CHALLENGE_SLUGS = new Set([
  'drinking-water',
  'sanitation-hygiene',
  'water-efficiency',
  'wastewater-reuse',
  'industrial-water',
  'irrigation-agriculture',
  'groundwater',
  'stormwater-flood',
  'desalination',
  'digital-water',
  'nature-based',
  'water-quality',
  'drought-climate',
  'transboundary',
]);

function uniq(values: string[]) {
  return [...new Set(values.map((v) => v.trim().toLowerCase()).filter(Boolean))];
}

async function loadFieldKeyMap(formVersionId: string) {
  const fields = await prisma.formField.findMany({
    where: { formVersionId },
    select: { id: true, fieldKey: true },
  });
  return new Map(fields.map((f) => [f.fieldKey, f.id]));
}

async function main() {
  const weights = resolveMatchingWeights(defaultMatchingWeights);
  const companies = await prisma.company.findMany({
    include: { organization: true },
  });
  const vendors = await prisma.vendor.findMany({
    include: { organization: true },
  });
  const vendorRows = vendors.map((vendor) => ({
    vendor,
    features: vendorToProfileFeatures({
      organizationId: vendor.organizationId,
      capabilities: vendor.capabilities,
      categories: vendor.categories,
      operatingRegions: vendor.operatingRegions,
      commercialPrefs: vendor.commercialPrefs,
      normalizedProfile: vendor.normalizedProfile,
      organization: { industry: vendor.organization.industry },
    }),
  }));

  let fixed = 0;
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

    const ranked = vendorRows
      .map((row) => ({
        ...row,
        score: calculateMatchScore(left, row.features, weights).totalScore,
      }))
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    if (!best || best.score >= 75) {
      console.log(company.organization.code, 'ok', Math.round(best?.score ?? 0));
      continue;
    }

    const preferredCategories = uniq(
      best.features.categories.filter((tag) => CHALLENGE_SLUGS.has(tag)),
    ).slice(0, 3);
    const requiredCapabilities = uniq(best.features.capabilities).slice(0, 4);
    const regions = uniq([...best.features.regions, 'global']).slice(0, 4);
    const commercialTags = uniq([
      ...best.features.commercialTags,
      ...left.commercialTags,
    ]).slice(0, 4);
    const stages = uniq([
      ...best.features.investmentStages,
      ...left.investmentStages,
      'early-revenue',
      'pilot',
    ]).slice(0, 4);
    const ticket =
      best.features.ticketSize &&
      ['under-250k', '250k-1m', '1m-5m', '5m-25m', '25m-plus'].includes(
        best.features.ticketSize,
      )
        ? best.features.ticketSize
        : left.ticketSize &&
            ['under-250k', '250k-1m', '1m-5m', '5m-25m', '25m-plus'].includes(
              left.ticketSize,
            )
          ? left.ticketSize
          : '1m-5m';

    const np = (company.normalizedProfile ?? {}) as Record<string, unknown>;
    const responses = {
      ...((np.responses ?? {}) as Record<string, unknown>),
      categories: preferredCategories,
      preferredCategories,
      capabilities: requiredCapabilities,
      requiredCapabilities,
      regions,
      commercial_tags: commercialTags,
      commercialTags,
      ticket_size: ticket,
      investment_stages: stages,
    };
    const commercialPrefs = {
      tags: commercialTags,
      investmentStages: stages,
      ticketSize: ticket,
    };

    await prisma.company.update({
      where: { organizationId: company.organizationId },
      data: {
        preferredCategories,
        requiredCapabilities,
        commercialPrefs: commercialPrefs as Prisma.InputJsonValue,
        normalizedProfile: {
          ...np,
          regions,
          ticketSize: ticket,
          investmentStages: stages,
          responses,
        } as Prisma.InputJsonValue,
        profileVersion: { increment: 1 },
      },
    });

    const submission = await prisma.formSubmission.findFirst({
      where: { organizationId: company.organizationId },
      orderBy: { updatedAt: 'desc' },
    });
    if (submission) {
      const fieldKeys = await loadFieldKeyMap(submission.formVersionId);
      const next = { ...(submission.responses as Record<string, unknown>) };
      const patch: Record<string, unknown> = {
        categories: preferredCategories,
        preferredCategories,
        capabilities: requiredCapabilities,
        requiredCapabilities,
        regions,
        commercial_tags: commercialTags,
        commercialTags,
        ticket_size: ticket,
        investment_stages: stages,
      };
      Object.assign(next, patch);
      for (const [key, value] of Object.entries(patch)) {
        const id = fieldKeys.get(key);
        if (id) next[id] = value;
      }
      await prisma.formSubmission.update({
        where: { id: submission.id },
        data: { responses: next as Prisma.InputJsonValue },
      });
    }

    const after = companyToProfileFeatures({
      organizationId: company.organizationId,
      preferredCategories,
      requiredCapabilities,
      commercialPrefs,
      normalizedProfile: { regions, ticketSize: ticket, investmentStages: stages, responses },
      organization: {
        industry: company.organization.industry,
        region: company.organization.region,
      },
    });
    const newBest = Math.max(
      ...vendorRows.map(
        (row) => calculateMatchScore(after, row.features, weights).totalScore,
      ),
    );
    console.log(company.organization.code, {
      before: Math.round(best.score),
      after: Math.round(newBest),
      twin: best.vendor.organization.code,
    });
    fixed += 1;
  }

  console.log({ fixed });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
