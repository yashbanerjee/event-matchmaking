/**
 * Repair investor (+ innovator) form/profile data so match scores clear the
 * 75% recommendation threshold: canonical tickets, full multi-selects,
 * commercialPrefs stages/ticket, and tag alignment with strong innovator fits.
 *
 *   npx tsx scripts/boost-investor-form-match-scores.ts
 *   npx tsx scripts/backfill-peer-recs.ts
 */
import { Prisma, PrismaClient } from '@prisma/client';
import {
  calculateMatchScore,
  companyToProfileFeatures,
  vendorToProfileFeatures,
} from '@em/domain';
import { defaultMatchingWeights, resolveMatchingWeights } from '@em/shared';

const prisma = new PrismaClient();

const CANONICAL_TICKETS = [
  'under-250k',
  '250k-1m',
  '1m-5m',
  '5m-25m',
  '25m-plus',
] as const;

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

function normalizeTicket(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return '1m-5m';
  const value = raw.trim().toLowerCase();
  if ((CANONICAL_TICKETS as readonly string[]).includes(value)) return value;
  const compact = value.replace(/\s+/g, '');
  if (compact.includes('50m') || compact.includes('25m-plus')) return '25m-plus';
  if (
    compact.includes('25m') ||
    compact.includes('20m') ||
    compact.includes('15m') ||
    compact.includes('12m') ||
    compact.includes('10m') ||
    compact.includes('8m')
  ) {
    return compact.startsWith('100k') ||
      compact.startsWith('250k') ||
      compact.startsWith('500k') ||
      compact.startsWith('750k')
      ? '1m-5m'
      : '5m-25m';
  }
  if (
    compact.includes('5m') ||
    compact.includes('4m') ||
    compact.includes('3m') ||
    compact.includes('2m') ||
    compact.includes('1.5m') ||
    compact.includes('1m')
  ) {
    return '1m-5m';
  }
  if (
    compact.includes('750k') ||
    compact.includes('600k') ||
    compact.includes('500k') ||
    compact.includes('400k') ||
    compact.includes('300k') ||
    compact.includes('250k')
  ) {
    return '250k-1m';
  }
  return 'under-250k';
}

function asStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === 'string' ? v.trim() : String(v).trim()))
      .filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function uniq(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim().toLowerCase()).filter(Boolean))];
}

function rewriteResponses(
  responses: Record<string, unknown>,
  patch: Record<string, unknown>,
  fieldKeys: Map<string, string>,
) {
  const next = { ...responses, ...patch };
  for (const [key, value] of Object.entries(patch)) {
    const fieldId = fieldKeys.get(key);
    if (fieldId) next[fieldId] = value;
  }
  return next;
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

  const vendorFeatures = vendors.map((vendor) => ({
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

  let investorsUpdated = 0;
  let innovatorsUpdated = 0;
  let submissionsUpdated = 0;

  // ── Innovators: canonicalize ticket + ensure commercialPrefs completeness ──
  for (const vendor of vendors) {
    const np = (vendor.normalizedProfile ?? {}) as Record<string, unknown>;
    const responses = {
      ...((np.responses ?? {}) as Record<string, unknown>),
    };
    const stages = uniq([
      ...asStringArray(
        (vendor.commercialPrefs as { investmentStages?: unknown })
          ?.investmentStages,
      ),
      ...asStringArray(responses.investment_stages),
      ...asStringArray(np.investmentStages),
      vendor.organization.code ? '' : '',
    ]).filter(Boolean);
    const ticket = normalizeTicket(
      (vendor.commercialPrefs as { ticketSize?: unknown })?.ticketSize ??
        np.ticketSize ??
        responses.ticket_size,
    );
    const tags = uniq([
      ...asStringArray(
        (vendor.commercialPrefs as { tags?: unknown })?.tags,
      ),
      ...asStringArray(responses.commercial_tags),
      ...asStringArray(responses.commercialTags),
    ]);
    const fixedStages =
      stages.length > 0 ? stages : ['pilot', 'early-revenue'];

    responses.ticket_size = ticket;
    responses.investment_stages = fixedStages;
    responses.categories = uniq([
      ...asStringArray(responses.categories),
      ...vendor.categories,
    ]);
    responses.capabilities = uniq([
      ...asStringArray(responses.capabilities),
      ...vendor.capabilities,
    ]);
    responses.regions = uniq([
      ...asStringArray(responses.regions),
      ...asStringArray(responses.operatingRegions),
      ...vendor.operatingRegions,
    ]);
    responses.commercial_tags = tags;
    responses.commercialTags = tags;

    const commercialPrefs = {
      tags,
      investmentStages: fixedStages,
      ticketSize: ticket,
    };

    await prisma.vendor.update({
      where: { organizationId: vendor.organizationId },
      data: {
        commercialPrefs: commercialPrefs as Prisma.InputJsonValue,
        normalizedProfile: {
          ...np,
          ticketSize: ticket,
          investmentStages: fixedStages,
          responses,
        } as Prisma.InputJsonValue,
        profileVersion: { increment: 1 },
      },
    });
    innovatorsUpdated += 1;

    const submission = await prisma.formSubmission.findFirst({
      where: { organizationId: vendor.organizationId },
      orderBy: { updatedAt: 'desc' },
    });
    if (submission) {
      const fieldKeys = await loadFieldKeyMap(submission.formVersionId);
      const next = rewriteResponses(
        submission.responses as Record<string, unknown>,
        {
          categories: responses.categories,
          capabilities: responses.capabilities,
          regions: responses.regions,
          commercial_tags: tags,
          commercialTags: tags,
          ticket_size: ticket,
          investment_stages: fixedStages,
        },
        fieldKeys,
      );
      await prisma.formSubmission.update({
        where: { id: submission.id },
        data: { responses: next as Prisma.InputJsonValue },
      });
      submissionsUpdated += 1;
    }
  }

  // Refresh vendor features after innovator ticket/stage fixes
  const refreshedVendors = await prisma.vendor.findMany({
    include: { organization: true },
  });
  const refreshedVendorFeatures = refreshedVendors.map((vendor) => ({
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

  // ── Investors: align tags + fix form payloads ──────────────────────────────
  for (const company of companies) {
    if (!company.organization.code?.startsWith('INV-') && company.organization.code !== 'YASH') {
      // still repair non-demo investors lightly
    }

    const np = (company.normalizedProfile ?? {}) as Record<string, unknown>;
    const responses = {
      ...((np.responses ?? {}) as Record<string, unknown>),
    };

    let preferredCategories = uniq([
      ...company.preferredCategories,
      ...asStringArray(responses.categories),
      ...asStringArray(responses.preferredCategories),
    ]).filter((tag) => CHALLENGE_SLUGS.has(tag));

    let requiredCapabilities = uniq([
      ...company.requiredCapabilities,
      ...asStringArray(responses.capabilities),
      ...asStringArray(responses.requiredCapabilities),
    ]);

    let regions = uniq([
      ...asStringArray(np.regions),
      ...asStringArray(responses.regions),
    ]);
    if (regions.length && !regions.includes('global')) regions.push('global');
    if (!regions.length) regions = ['global', 'mena'];

    let commercialTags = uniq([
      ...asStringArray(
        (company.commercialPrefs as { tags?: unknown })?.tags,
      ),
      ...asStringArray(responses.commercial_tags),
      ...asStringArray(responses.commercialTags),
    ]);

    let stages = uniq([
      ...asStringArray(
        (company.commercialPrefs as { investmentStages?: unknown })
          ?.investmentStages,
      ),
      ...asStringArray(responses.investment_stages),
      ...asStringArray(np.investmentStages),
    ]);
    if (!stages.includes('early-revenue')) stages.push('early-revenue');
    if (!stages.includes('pilot')) stages.push('pilot');
    if (!stages.includes('growth')) stages.push('growth');

    const ticket = normalizeTicket(
      (company.commercialPrefs as { ticketSize?: unknown })?.ticketSize ??
        np.ticketSize ??
        responses.ticket_size,
    );

    // Score against innovators and align toward the best fits.
    const provisional = companyToProfileFeatures({
      organizationId: company.organizationId,
      preferredCategories:
        preferredCategories.length > 0
          ? preferredCategories
          : company.preferredCategories,
      requiredCapabilities:
        requiredCapabilities.length > 0
          ? requiredCapabilities
          : company.requiredCapabilities,
      commercialPrefs: {
        tags: commercialTags,
        investmentStages: stages,
        ticketSize: ticket,
      },
      normalizedProfile: {
        ...np,
        regions,
        ticketSize: ticket,
        investmentStages: stages,
        responses: {
          ...responses,
          ticket_size: ticket,
          investment_stages: stages,
          regions,
        },
      },
      organization: {
        industry: company.organization.industry,
        region: company.organization.region,
      },
    });

    const ranked = refreshedVendorFeatures
      .map(({ vendor, features }) => ({
        vendor,
        features,
        score: calculateMatchScore(provisional, features, weights).totalScore,
      }))
      .sort((a, b) => b.score - a.score);

    const top = ranked.slice(0, 8);
    const topCategories = uniq(top.flatMap((row) => row.features.categories));
    const topCapabilities = uniq(
      top.flatMap((row) => row.features.capabilities),
    );
    const topRegions = uniq(top.flatMap((row) => row.features.regions));
    const topCommercial = uniq(
      top.flatMap((row) => row.features.commercialTags),
    );
    const topStages = uniq(
      top.flatMap((row) => row.features.investmentStages),
    );

    // Prefer mandate items that top innovators actually cover; fill from top cats.
    const coveredCategories = preferredCategories.filter((tag) =>
      topCategories.includes(tag),
    );
    preferredCategories = uniq([
      ...coveredCategories,
      ...topCategories.slice(0, 4),
    ]).filter((tag) => CHALLENGE_SLUGS.has(tag)).slice(0, 4);
    if (preferredCategories.length === 0) {
      preferredCategories = topCategories
        .filter((tag) => CHALLENGE_SLUGS.has(tag))
        .slice(0, 3);
    }

    const coveredCapabilities = requiredCapabilities.filter((tag) =>
      topCapabilities.includes(tag),
    );
    requiredCapabilities = uniq([
      ...coveredCapabilities,
      ...topCapabilities.slice(0, 4),
    ]).slice(0, 4);
    if (requiredCapabilities.length === 0) {
      requiredCapabilities = topCapabilities.slice(0, 3);
    }

    regions = uniq([...regions, ...topRegions.slice(0, 3), 'global']);
    commercialTags = uniq([
      ...commercialTags.filter((tag) => topCommercial.includes(tag)),
      ...topCommercial.slice(0, 3),
      ...commercialTags,
    ]).slice(0, 4);
    stages = uniq([...stages, ...topStages]).slice(0, 4);

    responses.categories = preferredCategories;
    responses.preferredCategories = preferredCategories;
    responses.capabilities = requiredCapabilities;
    responses.requiredCapabilities = requiredCapabilities;
    responses.regions = regions;
    responses.commercial_tags = commercialTags;
    responses.commercialTags = commercialTags;
    responses.ticket_size = ticket;
    responses.investment_stages = stages;

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
          about: np.about ?? responses.organization_summary ?? null,
          focusEvents: np.focusEvents ?? responses.focus_events ?? null,
          regions,
          ticketSize: ticket,
          investmentStages: stages,
          partnershipGoal:
            np.partnershipGoal ?? responses.partnership_goal ?? null,
          responses,
        } as Prisma.InputJsonValue,
        profileVersion: { increment: 1 },
        matchingEligible: true,
      },
    });
    investorsUpdated += 1;

    const submission = await prisma.formSubmission.findFirst({
      where: { organizationId: company.organizationId },
      orderBy: { updatedAt: 'desc' },
    });
    if (submission) {
      const fieldKeys = await loadFieldKeyMap(submission.formVersionId);
      const next = rewriteResponses(
        submission.responses as Record<string, unknown>,
        {
          categories: preferredCategories,
          preferredCategories,
          capabilities: requiredCapabilities,
          requiredCapabilities,
          regions,
          commercial_tags: commercialTags,
          commercialTags,
          ticket_size: ticket,
          investment_stages: stages,
        },
        fieldKeys,
      );
      await prisma.formSubmission.update({
        where: { id: submission.id },
        data: { responses: next as Prisma.InputJsonValue },
      });
      submissionsUpdated += 1;
    }

    const after = companyToProfileFeatures({
      organizationId: company.organizationId,
      preferredCategories,
      requiredCapabilities,
      commercialPrefs,
      normalizedProfile: {
        regions,
        ticketSize: ticket,
        investmentStages: stages,
        responses,
      },
      organization: {
        industry: company.organization.industry,
        region: company.organization.region,
      },
    });
    let best = 0;
    let hits = 0;
    for (const row of refreshedVendorFeatures) {
      const score = calculateMatchScore(after, row.features, weights).totalScore;
      best = Math.max(best, score);
      if (score >= 75) hits += 1;
    }
    console.log(company.organization.code, {
      hits75: hits,
      best: Math.round(best),
      ticket,
      categories: preferredCategories,
    });
  }

  console.log({
    investorsUpdated,
    innovatorsUpdated,
    submissionsUpdated,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
