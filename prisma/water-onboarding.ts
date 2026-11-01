import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

export type TagDef = { value: string; label: string };

/** UN Water / SDG 6 challenge areas used for investor ↔ innovator matching. */
export const WATER_CHALLENGE_TAGS: TagDef[] = [
  { value: 'drinking-water', label: 'Clean drinking water' },
  { value: 'sanitation-hygiene', label: 'Toilets & hygiene' },
  { value: 'wastewater-reuse', label: 'Cleaning & reusing wastewater' },
  { value: 'water-efficiency', label: 'Using less water / fixing leaks' },
  { value: 'desalination', label: 'Turning seawater into fresh water' },
  { value: 'groundwater', label: 'Underground water' },
  { value: 'irrigation-agriculture', label: 'Farming & irrigation' },
  { value: 'industrial-water', label: 'Water for factories & business' },
  { value: 'stormwater-flood', label: 'Floods & rainwater' },
  { value: 'drought-climate', label: 'Drought & climate' },
  { value: 'water-quality', label: 'Water quality & pollution' },
  { value: 'nature-based', label: 'Nature-based solutions' },
  { value: 'digital-water', label: 'Smart / digital water tools' },
  { value: 'transboundary', label: 'Working across countries' },
];

export const WATER_REGION_TAGS: TagDef[] = [
  { value: 'uae', label: 'UAE' },
  { value: 'gcc', label: 'GCC' },
  { value: 'mena', label: 'MENA' },
  { value: 'west-africa', label: 'West Africa' },
  { value: 'east-africa', label: 'East Africa' },
  { value: 'sahel', label: 'Sahel' },
  { value: 'southern-africa', label: 'Southern Africa' },
  { value: 'south-asia', label: 'South Asia' },
  { value: 'southeast-asia', label: 'Southeast Asia' },
  { value: 'latin-america', label: 'Latin America' },
  { value: 'europe', label: 'Europe' },
  { value: 'global', label: 'Global / multi-region' },
];

export const WATER_CAPABILITY_TAGS: TagDef[] = [
  { value: 'treatment-tech', label: 'Water treatment technology' },
  { value: 'reuse-recycling', label: 'Reuse & recycling' },
  { value: 'desalination-tech', label: 'Desalination systems' },
  { value: 'leak-detection', label: 'Finding & fixing leaks' },
  { value: 'smart-metering', label: 'Smart meters & sensors' },
  { value: 'data-ai', label: 'Data & AI tools' },
  { value: 'nature-based-delivery', label: 'Nature-based solutions' },
  { value: 'utility-ops', label: 'Running water utilities' },
  { value: 'community-wash', label: 'Community water & hygiene' },
  { value: 'blended-finance', label: 'Project / blended finance' },
  { value: 'policy-capacity', label: 'Policy & training' },
  { value: 'climate-adaptation', label: 'Climate adaptation' },
];

export const WATER_CAPITAL_TAGS: TagDef[] = [
  { value: 'equity', label: 'Equity investment' },
  { value: 'debt', label: 'Loan / debt' },
  { value: 'grant', label: 'Grant / donation' },
  { value: 'blended-finance', label: 'Mixed funding (blended)' },
  { value: 'concessional', label: 'Soft / low-cost capital' },
  { value: 'pilot-partnership', label: 'Pilot project together' },
  { value: 'offtake', label: 'Buy / supply contract' },
  { value: 'joint-venture', label: 'Joint venture' },
  { value: 'technical-assistance', label: 'Technical help' },
  { value: 'corporate-venture', label: 'Corporate venture' },
];

export const WATER_STAGE_TAGS: TagDef[] = [
  { value: 'pilot', label: 'Just testing (pilot)' },
  { value: 'early-revenue', label: 'Early customers / sales' },
  { value: 'growth', label: 'Growing / scaling' },
  { value: 'infrastructure', label: 'Large infrastructure project' },
  { value: 'buyout', label: 'Mature / buyout stage' },
];

/** Role tags used when admins schedule meetings manually (stable slug values). */
export const SCHEDULING_CATEGORY_TAGS: TagDef[] = [
  { value: 'investor', label: 'Investor' },
  { value: 'founder', label: 'Founder' },
  { value: 'developer', label: 'Developer' },
  { value: 'inventor', label: 'Inventor' },
];

export const SCHEDULING_INDUSTRY_TAGS: TagDef[] = [
  { value: 'food', label: 'Food' },
  { value: 'automation', label: 'Automation' },
  { value: 'water', label: 'Water' },
  { value: 'energy', label: 'Energy' },
  { value: 'agriculture', label: 'Agriculture' },
  { value: 'climate', label: 'Climate' },
  { value: 'technology', label: 'Technology' },
  { value: 'other', label: 'Other' },
];

export const SCHEDULING_PURPOSE_TAGS: TagDef[] = [
  { value: 'to_meet_investors', label: 'To meet investors' },
  { value: 'to_raise_funding_for_my_product', label: 'To raise funding for my product' },
  { value: 'to_explore_new_opportunities', label: 'To explore new opportunities' },
  { value: 'to_find_innovators', label: 'To find innovators' },
  { value: 'to_find_pilot_partners', label: 'To find pilot partners' },
  { value: 'to_co_invest', label: 'To co-invest' },
];

export const WATER_DIMENSIONS = [
  {
    code: 'event_categories',
    name: 'Water challenges',
    description:
      'SDG 6 and UN Water dialogue themes used to match investors and innovators',
    profileKey: 'categories',
    sortOrder: 10,
    tags: WATER_CHALLENGE_TAGS,
  },
  {
    code: 'preferred_categories',
    name: 'Preferred water challenges',
    description: 'Investor mandate / preferred water challenge areas',
    profileKey: 'preferredCategories',
    sortOrder: 20,
    tags: WATER_CHALLENGE_TAGS,
  },
  {
    code: 'venues',
    name: 'Operating regions',
    description: 'Geographies for deployment, capital, and partnerships',
    profileKey: 'regions',
    sortOrder: 30,
    tags: WATER_REGION_TAGS,
  },
  {
    code: 'ethara_services',
    name: 'Water solutions',
    description: 'Solution and delivery capabilities across the water value chain',
    profileKey: 'capabilities',
    sortOrder: 35,
    tags: WATER_CAPABILITY_TAGS,
  },
  {
    code: 'capabilities',
    name: 'Capabilities',
    description: 'Technical and delivery capabilities used in matchmaking',
    profileKey: 'capabilities',
    sortOrder: 40,
    tags: WATER_CAPABILITY_TAGS,
  },
  {
    code: 'commercial_tags',
    name: 'Capital & partnership',
    description: 'How capital or collaboration is structured',
    profileKey: 'commercialTags',
    sortOrder: 50,
    tags: WATER_CAPITAL_TAGS,
  },
  {
    code: 'investment_stages',
    name: 'Investment stages',
    description: 'Maturity of solutions and preferred investment stages',
    profileKey: 'commercialTags',
    sortOrder: 60,
    tags: WATER_STAGE_TAGS,
  },
] as const;

type FieldType =
  | 'heading'
  | 'text'
  | 'textarea'
  | 'select'
  | 'multiselect'
  | 'time';

/** Default event dates used until admin settings override availability options. */
export const DEFAULT_AVAILABILITY_DATES: TagDef[] = [
  { value: '2026-12-07', label: 'Sun 7 Dec 2026' },
  { value: '2026-12-08', label: 'Mon 8 Dec 2026' },
  { value: '2026-12-09', label: 'Tue 9 Dec 2026' },
];

function field(
  sectionId: string,
  order: number,
  partial: {
    key: string;
    type: FieldType;
    label: string;
    required?: boolean;
    description?: string;
    options?: TagDef[];
    filterDimensionId?: string | null;
    placeholder?: string;
  },
) {
  return {
    id: randomUUID(),
    sectionId,
    key: partial.key,
    type: partial.type,
    label: partial.label,
    required: partial.required ?? false,
    description: partial.description ?? '',
    options: partial.options ?? [],
    filterDimensionId: partial.filterDimensionId ?? null,
    placeholder: partial.placeholder ?? '',
    order,
  };
}

function mapFieldType(type: FieldType) {
  if (type === 'textarea') return 'LONG_TEXT';
  if (type === 'select') return 'SINGLE_SELECT';
  if (type === 'multiselect') return 'MULTI_SELECT';
  if (type === 'heading') return 'READ_ONLY';
  if (type === 'time') return 'SHORT_TEXT';
  return 'SHORT_TEXT';
}

const TICKET_OPTIONS: TagDef[] = [
  { value: 'under-250k', label: 'Under $250,000' },
  { value: '250k-1m', label: '$250,000 – $1 million' },
  { value: '1m-5m', label: '$1 – $5 million' },
  { value: '5m-25m', label: '$5 – $25 million' },
  { value: '25m-plus', label: 'More than $25 million' },
];

const COUNTRY_OPTIONS: TagDef[] = [
  { value: 'AE', label: 'United Arab Emirates' },
  { value: 'SA', label: 'Saudi Arabia' },
  { value: 'EG', label: 'Egypt' },
  { value: 'KE', label: 'Kenya' },
  { value: 'NG', label: 'Nigeria' },
  { value: 'ZA', label: 'South Africa' },
  { value: 'IN', label: 'India' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'US', label: 'United States' },
  { value: 'OTHER', label: 'Other' },
];

/** Personal contact fields shared by investor + innovator forms. */
function personalDetailFields(sectionId: string, startOrder: number) {
  return [
    field(sectionId, startOrder, {
      key: 'contact_name',
      type: 'text',
      label: `${startOrder}. Your full name`,
      required: true,
      description: 'So people know who they are meeting.',
      placeholder: 'First and last name',
    }),
    field(sectionId, startOrder + 1, {
      key: 'job_title',
      type: 'text',
      label: `${startOrder + 1}. Your job title`,
      required: true,
      description: 'For example: CEO, Partner, Founder.',
      placeholder: 'Your role',
    }),
    field(sectionId, startOrder + 2, {
      key: 'phone',
      type: 'text',
      label: `${startOrder + 2}. Mobile number`,
      required: true,
      description: 'Include country code, e.g. +971…',
      placeholder: '+971 …',
    }),
    field(sectionId, startOrder + 3, {
      key: 'linkedin_url',
      type: 'text',
      label: `${startOrder + 3}. LinkedIn or website`,
      required: true,
      description: 'A link so others can learn more about you.',
      placeholder: 'https://',
    }),
    field(sectionId, startOrder + 4, {
      key: 'country',
      type: 'select',
      label: `${startOrder + 4}. Which country are you based in?`,
      required: true,
      description: 'Where you usually work from.',
      options: COUNTRY_OPTIONS,
    }),
  ];
}

/** Shared scheduling tags from Admin → Filters (category, industry, purpose). */
function schedulingTagFields(
  sectionId: string,
  startOrder: number,
  dimensionIds: Record<string, string>,
  tagOptions: Record<string, TagDef[]>,
) {
  return [
    field(sectionId, startOrder, {
      key: 'role_category',
      type: 'select',
      label: `${startOrder}. Who are you at this event?`,
      required: true,
      description: 'Choose one option. Used when arranging meetings.',
      options: dedupeTagOptions(tagOptions.category ?? SCHEDULING_CATEGORY_TAGS),
      filterDimensionId: dimensionIds.category,
    }),
    field(sectionId, startOrder + 1, {
      key: 'industry',
      type: 'select',
      label: `${startOrder + 1}. What industry are you in?`,
      required: true,
      description: 'Choose the closest match.',
      options: dedupeTagOptions(tagOptions.industry ?? SCHEDULING_INDUSTRY_TAGS),
      filterDimensionId: dimensionIds.industry,
    }),
    field(sectionId, startOrder + 2, {
      key: 'visit_purpose',
      type: 'select',
      label: `${startOrder + 2}. Why are you coming to this event?`,
      required: true,
      description: 'This helps the team book the right meetings for you.',
      options: dedupeTagOptions(tagOptions.pv ?? SCHEDULING_PURPOSE_TAGS),
      filterDimensionId: dimensionIds.pv,
    }),
  ];
}

/** Keep one option per label (case-insensitive) so dropdowns do not show duplicates. */
function dedupeTagOptions(tags: TagDef[]): TagDef[] {
  const seen = new Set<string>();
  const out: TagDef[] = [];
  for (const tag of tags) {
    const key = tag.label.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/** Prefer slug-style values; deactivate other active tags with the same label. */
async function dedupeDimensionTagsByLabel(
  prisma: PrismaClient,
  dimensionId: string,
) {
  const tags = await prisma.filterTag.findMany({
    where: { dimensionId, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  const keepByLabel = new Map<string, string>();
  const deactivateIds: string[] = [];

  for (const tag of tags) {
    const labelKey = tag.label.trim().toLowerCase();
    if (!labelKey) continue;
    const existing = keepByLabel.get(labelKey);
    if (!existing) {
      keepByLabel.set(labelKey, tag.id);
      continue;
    }
    // Prefer lowercase/slug values when choosing which duplicate to keep.
    const current = tags.find((t) => t.id === existing)!;
    const preferIncoming =
      /^[a-z0-9_]+$/.test(tag.value) && !/^[a-z0-9_]+$/.test(current.value);
    if (preferIncoming) {
      deactivateIds.push(existing);
      keepByLabel.set(labelKey, tag.id);
    } else {
      deactivateIds.push(tag.id);
    }
  }

  if (deactivateIds.length) {
    await prisma.filterTag.updateMany({
      where: { id: { in: deactivateIds } },
      data: { isActive: false },
    });
  }
}

/**
 * Investor form — plain-language questions + scheduling tags (≥10).
 * Meeting dates/times are collected on the next registration step.
 */
export function buildInvestorOnboardingFields(
  dimensionIds: Record<string, string>,
  tagOptions: Record<string, TagDef[]>,
) {
  const personal = randomUUID();
  const scheduling = randomUUID();
  const match = randomUUID();
  const capital = randomUUID();

  const fields = [
    ...personalDetailFields(personal, 1),
    ...schedulingTagFields(scheduling, 6, dimensionIds, tagOptions),
    field(match, 9, {
      key: 'organization_summary',
      type: 'textarea',
      label: '9. In simple words, what do you invest in?',
      required: true,
      description: 'A short note about the kind of projects or companies you like.',
    }),
    field(match, 10, {
      key: 'categories',
      type: 'select',
      label: '10. Which water topics do you care about?',
      required: true,
      description: 'Choose the main topic for your meetings.',
      options: dedupeTagOptions(tagOptions.event_categories ?? []),
      filterDimensionId: dimensionIds.event_categories,
    }),
    field(match, 11, {
      key: 'regions',
      type: 'select',
      label: '11. Which regions are you interested in?',
      required: true,
      description: 'Choose your main region.',
      options: dedupeTagOptions(tagOptions.venues ?? []),
      filterDimensionId: dimensionIds.venues,
    }),
    field(match, 12, {
      key: 'capabilities',
      type: 'select',
      label: '12. What kinds of solutions do you want to see?',
      required: true,
      description: 'Choose one option.',
      options: dedupeTagOptions(tagOptions.capabilities ?? []),
      filterDimensionId: dimensionIds.capabilities,
    }),
    field(capital, 13, {
      key: 'commercial_tags',
      type: 'select',
      label: '13. What kind of funding or partnership can you offer?',
      required: true,
      description: 'Choose one option.',
      options: dedupeTagOptions(tagOptions.commercial_tags ?? []),
      filterDimensionId: dimensionIds.commercial_tags,
    }),
    field(capital, 14, {
      key: 'investment_stages',
      type: 'select',
      label: '14. What stage of company do you prefer?',
      required: true,
      description: 'Early idea, growing business, or large project.',
      options: dedupeTagOptions(tagOptions.investment_stages ?? []),
      filterDimensionId: dimensionIds.investment_stages,
    }),
    field(capital, 15, {
      key: 'ticket_size',
      type: 'select',
      label: '15. How much do you usually invest?',
      required: true,
      description: 'Your usual check size for one deal.',
      options: TICKET_OPTIONS,
    }),
  ];

  return {
    sections: [
      {
        id: personal,
        title: 'About you',
        description: 'Basic contact details.',
        order: 0,
      },
      {
        id: scheduling,
        title: 'For meeting booking',
        description: 'These tags help the team schedule the right meetings.',
        order: 1,
      },
      {
        id: match,
        title: 'What you are looking for',
        description: 'Used to match you with innovators.',
        order: 2,
      },
      {
        id: capital,
        title: 'Funding',
        description: 'How you usually invest.',
        order: 3,
      },
    ],
    fields,
  };
}

/**
 * Innovator form — plain-language questions + scheduling tags (≥10).
 * Meeting dates/times are collected on the next registration step.
 */
export function buildInnovatorOnboardingFields(
  dimensionIds: Record<string, string>,
  tagOptions: Record<string, TagDef[]>,
) {
  const personal = randomUUID();
  const scheduling = randomUUID();
  const match = randomUUID();
  const ask = randomUUID();

  const fields = [
    ...personalDetailFields(personal, 1),
    ...schedulingTagFields(scheduling, 6, dimensionIds, tagOptions),
    field(match, 9, {
      key: 'organization_summary',
      type: 'textarea',
      label: '9. In simple words, what does your product or project do?',
      required: true,
      description: 'Explain the problem you solve and who it helps.',
    }),
    field(match, 10, {
      key: 'categories',
      type: 'select',
      label: '10. Which water topics does your work cover?',
      required: true,
      description: 'Choose the main topic.',
      options: dedupeTagOptions(tagOptions.event_categories ?? []),
      filterDimensionId: dimensionIds.event_categories,
    }),
    field(match, 11, {
      key: 'regions',
      type: 'select',
      label: '11. Where can you work or deliver?',
      required: true,
      description: 'Choose your main region.',
      options: dedupeTagOptions(tagOptions.venues ?? []),
      filterDimensionId: dimensionIds.venues,
    }),
    field(match, 12, {
      key: 'capabilities',
      type: 'select',
      label: '12. What can you offer?',
      required: true,
      description: 'Choose one option.',
      options: dedupeTagOptions(tagOptions.capabilities ?? []),
      filterDimensionId: dimensionIds.capabilities,
    }),
    field(ask, 13, {
      key: 'investment_stages',
      type: 'select',
      label: '13. What stage is your solution at?',
      required: true,
      description: 'Be honest — this helps find the right investors.',
      options: dedupeTagOptions(tagOptions.investment_stages ?? []),
      filterDimensionId: dimensionIds.investment_stages,
    }),
    field(ask, 14, {
      key: 'commercial_tags',
      type: 'select',
      label: '14. What kind of help are you looking for?',
      required: true,
      description: 'Choose one option.',
      options: dedupeTagOptions(tagOptions.commercial_tags ?? []),
      filterDimensionId: dimensionIds.commercial_tags,
    }),
    field(ask, 15, {
      key: 'ticket_size',
      type: 'select',
      label: '15. How much funding are you looking for?',
      required: true,
      description: 'Choose the closest range.',
      options: TICKET_OPTIONS,
    }),
  ];

  return {
    sections: [
      {
        id: personal,
        title: 'About you',
        description: 'Basic contact details.',
        order: 0,
      },
      {
        id: scheduling,
        title: 'For meeting booking',
        description: 'These tags help the team schedule the right meetings.',
        order: 1,
      },
      {
        id: match,
        title: 'About your solution',
        description: 'Used to match you with investors.',
        order: 2,
      },
      {
        id: ask,
        title: 'What you need',
        description: 'Funding and partnership preferences.',
        order: 3,
      },
    ],
    fields,
  };
}

export const INVESTOR_FORM_CODE = 'WATER_INVESTOR_ONBOARDING';
export const INNOVATOR_FORM_CODE = 'WATER_INNOVATOR_ONBOARDING';
export const KEEP_FORM_CODES = [INVESTOR_FORM_CODE, INNOVATOR_FORM_CODE] as const;

const SCHEDULING_DIMENSIONS = [
  {
    code: 'category',
    name: 'Category',
    description: 'Who you are at the event (used for meeting booking)',
    profileKey: 'categories',
    sortOrder: 1,
    tags: SCHEDULING_CATEGORY_TAGS,
  },
  {
    code: 'industry',
    name: 'Industry',
    description: 'Industry tags used for meeting booking',
    profileKey: 'industry',
    sortOrder: 2,
    tags: SCHEDULING_INDUSTRY_TAGS,
  },
  {
    code: 'pv',
    name: 'Purpose of your visit',
    description: 'Why you are attending (used for meeting booking)',
    profileKey: 'categories',
    sortOrder: 3,
    tags: SCHEDULING_PURPOSE_TAGS,
  },
] as const;

async function upsertDimensionWithTags(
  prisma: PrismaClient,
  dim: {
    code: string;
    name: string;
    description: string;
    profileKey: string;
    sortOrder: number;
    tags: readonly TagDef[];
  },
  dimensionIds: Record<string, string>,
  tagOptions: Record<string, TagDef[]>,
  deactivateMissing = true,
) {
  const created = await prisma.filterDimension.upsert({
    where: { code: dim.code },
    create: {
      code: dim.code,
      name: dim.name,
      description: dim.description,
      profileKey: dim.profileKey,
      isActive: true,
      sortOrder: dim.sortOrder,
    },
    update: {
      name: dim.name,
      description: dim.description,
      profileKey: dim.profileKey,
      isActive: true,
      sortOrder: dim.sortOrder,
    },
  });
  dimensionIds[dim.code] = created.id;
  tagOptions[dim.code] = [...dim.tags];

  if (deactivateMissing) {
    const keep = dim.tags.map((t) => t.value);
    await prisma.filterTag.updateMany({
      where: { dimensionId: created.id, value: { notIn: keep } },
      data: { isActive: false },
    });
  }

  for (const [index, tag] of dim.tags.entries()) {
    await prisma.filterTag.upsert({
      where: {
        dimensionId_value: { dimensionId: created.id, value: tag.value },
      },
      create: {
        dimensionId: created.id,
        value: tag.value,
        label: tag.label,
        sortOrder: index,
        isActive: true,
      },
      update: {
        label: tag.label,
        sortOrder: index,
        isActive: true,
      },
    });
  }
}

export async function seedWaterFiltersAndForms(prisma: PrismaClient) {
  const dimensionIds: Record<string, string> = {};
  const tagOptions: Record<string, TagDef[]> = {};

  // Keep / refresh tags used for manual meeting scheduling.
  for (const dim of SCHEDULING_DIMENSIONS) {
    // Do not deactivate admin-added scheduling tags; only upsert known ones.
    await upsertDimensionWithTags(prisma, dim, dimensionIds, tagOptions, false);
  }

  // Deactivate duplicate tags (same label, different values) then reload.
  for (const code of ['category', 'industry', 'pv'] as const) {
    const dimId = dimensionIds[code];
    if (!dimId) continue;
    await dedupeDimensionTagsByLabel(prisma, dimId);
    const liveTags = await prisma.filterTag.findMany({
      where: { dimensionId: dimId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    tagOptions[code] = dedupeTagOptions(
      liveTags.map((t) => ({
        value: t.value,
        label: t.label,
      })),
    );
  }

  for (const dim of WATER_DIMENSIONS) {
    await upsertDimensionWithTags(prisma, dim, dimensionIds, tagOptions, true);
  }

  for (const tag of WATER_CHALLENGE_TAGS) {
    const fromTag = await prisma.filterTag.findFirst({
      where: {
        dimensionId: dimensionIds.preferred_categories,
        value: tag.value,
      },
    });
    const toTag = await prisma.filterTag.findFirst({
      where: { dimensionId: dimensionIds.event_categories, value: tag.value },
    });
    if (!fromTag || !toTag) continue;
    await prisma.filterTagMapping.upsert({
      where: { fromTagId_toTagId: { fromTagId: fromTag.id, toTagId: toTag.id } },
      create: {
        fromTagId: fromTag.id,
        toTagId: toTag.id,
        bidirectional: true,
      },
      update: { bidirectional: true },
    });
  }

  async function upsertPublishedForm(input: {
    code: string;
    name: string;
    description: string;
    targetType: 'COMPANY' | 'VENDOR' | null;
    hash: string;
    schema: { sections: unknown[]; fields: Array<Record<string, unknown>> };
  }) {
    const form = await prisma.form.upsert({
      where: { code: input.code },
      create: {
        code: input.code,
        name: input.name,
        description: input.description,
        targetType: input.targetType,
        isTemplate: false,
      },
      update: {
        name: input.name,
        description: input.description,
        targetType: input.targetType,
        isTemplate: false,
      },
    });

    const existing = await prisma.formVersion.findFirst({
      where: { formId: form.id },
      orderBy: { version: 'desc' },
    });

    let versionId: string;
    if (existing) {
      await prisma.formField.deleteMany({ where: { formVersionId: existing.id } });
      await prisma.formVersion.update({
        where: { id: existing.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: existing.publishedAt ?? new Date(),
          schemaJson: input.schema as unknown as Prisma.InputJsonValue,
          schemaHash: input.hash,
        },
      });
      versionId = existing.id;
    } else {
      const created = await prisma.formVersion.create({
        data: {
          formId: form.id,
          version: 1,
          status: 'PUBLISHED',
          publishedAt: new Date(),
          schemaJson: input.schema as unknown as Prisma.InputJsonValue,
          schemaHash: input.hash,
        },
      });
      versionId = created.id;
    }

    for (const [index, f] of input.schema.fields.entries()) {
      const type = String(f.type);
      if (type === 'heading' || type === 'info') continue;
      await prisma.formField.create({
        data: {
          formVersionId: versionId,
          fieldKey: String(f.key),
          label: String(f.label),
          description: typeof f.description === 'string' ? f.description : '',
          fieldType: mapFieldType(type as FieldType) as never,
          required: Boolean(f.required),
          displayOrder: index,
          options: (f.options ?? []) as unknown as Prisma.InputJsonValue,
        },
      });
    }

    return { form, versionId, fields: input.schema.fields };
  }

  const investorBuilt = buildInvestorOnboardingFields(dimensionIds, tagOptions);
  const innovatorBuilt = buildInnovatorOnboardingFields(dimensionIds, tagOptions);

  const investorForm = await upsertPublishedForm({
    code: INVESTOR_FORM_CODE,
    name: 'Investor form',
    description:
      'Simple questions plus booking tags for investors (availability on next step).',
    targetType: 'COMPANY',
    hash: 'investor-form-v7',
    schema: investorBuilt,
  });

  const innovatorForm = await upsertPublishedForm({
    code: INNOVATOR_FORM_CODE,
    name: 'Innovator form',
    description:
      'Simple questions plus booking tags for innovators (availability on next step).',
    targetType: 'VENDOR',
    hash: 'innovator-form-v7',
    schema: innovatorBuilt,
  });

  // Delete every other form so the product only has these two.
  await deleteFormsExcept(prisma, [...KEEP_FORM_CODES]);

  // All registration tag dropdowns are single-select.
  const selectionModes: Record<string, 'single' | 'multi'> = {};
  for (const code of Object.keys(dimensionIds)) {
    selectionModes[dimensionIds[code]] = 'single';
  }
  if (Object.keys(selectionModes).length) {
    await prisma.systemSetting.upsert({
      where: { key: 'filters.selectionModes' },
      create: {
        key: 'filters.selectionModes',
        value: { value: selectionModes },
      },
      update: { value: { value: selectionModes } },
    });
  }

  const dualFormSettings = [
    {
      key: 'registration.investorFormId',
      value: investorForm.form.id,
    },
    {
      key: 'registration.innovatorFormId',
      value: innovatorForm.form.id,
    },
    { key: 'registration.formId', value: investorForm.form.id },
    { key: 'registration.enabled', value: true },
    {
      key: 'ops.eventDates',
      value: DEFAULT_AVAILABILITY_DATES.map((d) => d.value).join(','),
    },
    { key: 'ops.eventActiveStart', value: '09:00' },
    { key: 'ops.eventActiveEnd', value: '17:00' },
  ] as const;

  for (const setting of dualFormSettings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      create: {
        key: setting.key,
        value: { value: setting.value },
      },
      update: { value: { value: setting.value } },
    });
  }

  return {
    dimensionIds,
    tagOptions,
    investorForm,
    innovatorForm,
  };
}

/** Remove legacy / unused forms and their dependent rows. */
async function deleteFormsExcept(
  prisma: PrismaClient,
  keepCodes: string[],
) {
  const obsolete = await prisma.form.findMany({
    where: { code: { notIn: keepCodes } },
    select: { id: true, code: true },
  });
  if (!obsolete.length) return;

  const formIds = obsolete.map((f) => f.id);
  const versions = await prisma.formVersion.findMany({
    where: { formId: { in: formIds } },
    select: { id: true },
  });
  const versionIds = versions.map((v) => v.id);

  if (versionIds.length) {
    const submissions = await prisma.formSubmission.findMany({
      where: { formVersionId: { in: versionIds } },
      select: { id: true },
    });
    const submissionIds = submissions.map((s) => s.id);
    if (submissionIds.length) {
      await prisma.submissionCorrectionField.deleteMany({
        where: { correction: { submissionId: { in: submissionIds } } },
      });
      await prisma.submissionCorrection.deleteMany({
        where: { submissionId: { in: submissionIds } },
      });
      await prisma.formSubmission.deleteMany({
        where: { id: { in: submissionIds } },
      });
      // EventRegistration.formVersionId / submissionId are not FK-constrained,
      // but clear rows that pointed at removed versions/submissions.
      await prisma.eventRegistration.deleteMany({
        where: {
          OR: [
            { formVersionId: { in: versionIds } },
            { submissionId: { in: submissionIds } },
          ],
        },
      });
    } else {
      await prisma.eventRegistration.deleteMany({
        where: { formVersionId: { in: versionIds } },
      });
    }
    await prisma.formField.deleteMany({
      where: { formVersionId: { in: versionIds } },
    });
  }

  await prisma.formAssignment.deleteMany({
    where: { formId: { in: formIds } },
  });
  await prisma.formVersion.deleteMany({
    where: { formId: { in: formIds } },
  });
  await prisma.form.deleteMany({
    where: { id: { in: formIds } },
  });

  console.log(
    `Deleted ${obsolete.length} old form(s): ${obsolete.map((f) => f.code).join(', ')}`,
  );
}
