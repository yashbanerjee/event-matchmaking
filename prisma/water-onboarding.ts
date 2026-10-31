import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

export type TagDef = { value: string; label: string };

/** UN Water / SDG 6 challenge areas used for investor ↔ innovator matching. */
export const WATER_CHALLENGE_TAGS: TagDef[] = [
  { value: 'drinking-water', label: 'Drinking water access' },
  { value: 'sanitation-hygiene', label: 'Sanitation & hygiene (WASH)' },
  { value: 'wastewater-reuse', label: 'Wastewater treatment & reuse' },
  { value: 'water-efficiency', label: 'Water efficiency & NRW' },
  { value: 'desalination', label: 'Desalination' },
  { value: 'groundwater', label: 'Groundwater management' },
  { value: 'irrigation-agriculture', label: 'Irrigation & agriculture' },
  { value: 'industrial-water', label: 'Industrial & commercial water' },
  { value: 'stormwater-flood', label: 'Stormwater & flood resilience' },
  { value: 'drought-climate', label: 'Drought & climate adaptation' },
  { value: 'water-quality', label: 'Water quality & pollution' },
  { value: 'nature-based', label: 'Nature-based solutions' },
  { value: 'digital-water', label: 'Digital water & utilities' },
  { value: 'transboundary', label: 'Transboundary cooperation' },
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
  { value: 'treatment-tech', label: 'Treatment technology' },
  { value: 'reuse-recycling', label: 'Reuse & recycling' },
  { value: 'desalination-tech', label: 'Desalination systems' },
  { value: 'leak-detection', label: 'Leak detection & NRW' },
  { value: 'smart-metering', label: 'Smart metering & IoT' },
  { value: 'data-ai', label: 'Data, AI & decision support' },
  { value: 'nature-based-delivery', label: 'Nature-based delivery' },
  { value: 'utility-ops', label: 'Utility operations' },
  { value: 'community-wash', label: 'Community WASH delivery' },
  { value: 'blended-finance', label: 'Blended / project finance' },
  { value: 'policy-capacity', label: 'Policy & capacity building' },
  { value: 'climate-adaptation', label: 'Climate adaptation' },
];

export const WATER_CAPITAL_TAGS: TagDef[] = [
  { value: 'equity', label: 'Equity' },
  { value: 'debt', label: 'Debt' },
  { value: 'grant', label: 'Grant / philanthropy' },
  { value: 'blended-finance', label: 'Blended finance' },
  { value: 'concessional', label: 'Concessional capital' },
  { value: 'pilot-partnership', label: 'Pilot partnership' },
  { value: 'offtake', label: 'Offtake / commercial contract' },
  { value: 'joint-venture', label: 'Joint venture' },
  { value: 'technical-assistance', label: 'Technical assistance' },
  { value: 'corporate-venture', label: 'Corporate venture' },
];

export const WATER_STAGE_TAGS: TagDef[] = [
  { value: 'pilot', label: 'Pilot / proof of concept' },
  { value: 'early-revenue', label: 'Early revenue' },
  { value: 'growth', label: 'Growth / scale-up' },
  { value: 'infrastructure', label: 'Infrastructure / project finance' },
  { value: 'buyout', label: 'Growth equity / buyout' },
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

type FieldType = 'heading' | 'text' | 'textarea' | 'select' | 'multiselect';

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
    order,
  };
}

function mapFieldType(type: FieldType) {
  if (type === 'textarea') return 'LONG_TEXT';
  if (type === 'select') return 'SINGLE_SELECT';
  if (type === 'multiselect') return 'MULTI_SELECT';
  if (type === 'heading') return 'READ_ONLY';
  return 'SHORT_TEXT';
}

export function buildInvestorOnboardingFields(
  dimensionIds: Record<string, string>,
  tagOptions: Record<string, TagDef[]>,
) {
  const about = randomUUID();
  const mandate = randomUUID();
  const capital = randomUUID();

  const fields = [
    field(about, 0, { key: 'heading_about', type: 'heading', label: 'Your institution' }),
    field(about, 1, {
      key: 'industry',
      type: 'select',
      label: 'Investor type',
      required: true,
      options: [
        { value: 'Development finance institution', label: 'Development finance institution' },
        { value: 'Impact / climate fund', label: 'Impact / climate fund' },
        { value: 'Venture capital', label: 'Venture capital' },
        { value: 'Private equity', label: 'Private equity' },
        { value: 'Family office', label: 'Family office' },
        { value: 'Corporate / strategic', label: 'Corporate / strategic' },
        { value: 'Philanthropy / foundation', label: 'Philanthropy / foundation' },
        { value: 'Utility / municipality', label: 'Utility / municipality' },
        { value: 'Government / sovereign', label: 'Government / sovereign' },
      ],
    }),
    field(about, 2, {
      key: 'organization_summary',
      type: 'textarea',
      label: 'Investment thesis for water',
      required: true,
      description:
        'What water outcomes and business models you back (SDG 6, climate, utilities, WASH).',
    }),
    field(about, 3, {
      key: 'focus_events',
      type: 'textarea',
      label: 'What you want from this 3-day UN Water event',
      required: true,
      description: 'e.g. pipeline for 2027, pilot partners in the Sahel, co-investors for blended facilities.',
    }),
    field(mandate, 10, { key: 'heading_mandate', type: 'heading', label: 'Mandate' }),
    field(mandate, 11, {
      key: 'categories',
      type: 'multiselect',
      label: 'Water challenges you want to fund',
      required: true,
      options: tagOptions.event_categories,
      filterDimensionId: dimensionIds.event_categories,
    }),
    field(mandate, 12, {
      key: 'regions',
      type: 'multiselect',
      label: 'Priority geographies',
      required: true,
      options: tagOptions.venues,
      filterDimensionId: dimensionIds.venues,
    }),
    field(mandate, 13, {
      key: 'capabilities',
      type: 'multiselect',
      label: 'Solution types of interest',
      required: true,
      options: tagOptions.capabilities,
      filterDimensionId: dimensionIds.capabilities,
    }),
    field(capital, 20, { key: 'heading_capital', type: 'heading', label: 'Capital & partnership' }),
    field(capital, 21, {
      key: 'commercialTags',
      type: 'multiselect',
      label: 'Instruments you can deploy',
      required: true,
      options: tagOptions.commercial_tags,
      filterDimensionId: dimensionIds.commercial_tags,
    }),
    field(capital, 22, {
      key: 'investment_stages',
      type: 'multiselect',
      label: 'Preferred stages',
      required: true,
      options: tagOptions.investment_stages,
      filterDimensionId: dimensionIds.investment_stages,
    }),
    field(capital, 23, {
      key: 'ticket_size',
      type: 'select',
      label: 'Typical ticket size',
      required: true,
      options: [
        { value: 'under-250k', label: 'Under USD 250k' },
        { value: '250k-1m', label: 'USD 250k – 1m' },
        { value: '1m-5m', label: 'USD 1m – 5m' },
        { value: '5m-25m', label: 'USD 5m – 25m' },
        { value: '25m-plus', label: 'USD 25m+' },
      ],
    }),
    field(capital, 24, {
      key: 'partnership_goal',
      type: 'textarea',
      label: 'What a successful meeting looks like',
      required: false,
    }),
  ];

  return {
    sections: [
      {
        id: about,
        title: 'Institution',
        description: 'Help innovators understand who you are as a capital partner.',
        order: 0,
      },
      {
        id: mandate,
        title: 'Water mandate',
        description: 'Shared matching variables with innovators — challenges, regions, solutions.',
        order: 1,
      },
      {
        id: capital,
        title: 'How you invest',
        description: 'Instruments, stage, and ticket size used for pairing.',
        order: 2,
      },
    ],
    fields,
  };
}

export function buildInnovatorOnboardingFields(
  dimensionIds: Record<string, string>,
  tagOptions: Record<string, TagDef[]>,
) {
  const about = randomUUID();
  const solution = randomUUID();
  const capital = randomUUID();

  const fields = [
    field(about, 0, { key: 'heading_about', type: 'heading', label: 'Your organization' }),
    field(about, 1, {
      key: 'industry',
      type: 'select',
      label: 'Organization type',
      required: true,
      options: [
        { value: 'Startup / scale-up', label: 'Startup / scale-up' },
        { value: 'Technology provider', label: 'Technology provider' },
        { value: 'Utility / operator', label: 'Utility / operator' },
        { value: 'NGO / social enterprise', label: 'NGO / social enterprise' },
        { value: 'Research / university', label: 'Research / university spin-out' },
        { value: 'Project developer', label: 'Project developer' },
      ],
    }),
    field(about, 2, {
      key: 'organization_summary',
      type: 'textarea',
      label: 'Solution and the water problem it solves',
      required: true,
      description: 'Be concrete: who is served, what changes, and where it is deployed.',
    }),
    field(about, 3, {
      key: 'focus_events',
      type: 'textarea',
      label: 'What you want from this UN Water event',
      required: true,
      description: 'Capital, pilots, offtake, technical partners, or policy support.',
    }),
    field(solution, 10, { key: 'heading_solution', type: 'heading', label: 'Solution fit' }),
    field(solution, 11, {
      key: 'categories',
      type: 'multiselect',
      label: 'Water challenges you address',
      required: true,
      options: tagOptions.event_categories,
      filterDimensionId: dimensionIds.event_categories,
    }),
    field(solution, 12, {
      key: 'regions',
      type: 'multiselect',
      label: 'Regions you can deploy in',
      required: true,
      options: tagOptions.venues,
      filterDimensionId: dimensionIds.venues,
    }),
    field(solution, 13, {
      key: 'capabilities',
      type: 'multiselect',
      label: 'Your solution capabilities',
      required: true,
      options: tagOptions.capabilities,
      filterDimensionId: dimensionIds.capabilities,
    }),
    field(solution, 14, {
      key: 'investment_stages',
      type: 'select',
      label: 'Solution maturity',
      required: true,
      options: tagOptions.investment_stages,
      filterDimensionId: dimensionIds.investment_stages,
    }),
    field(capital, 20, { key: 'heading_ask', type: 'heading', label: 'Capital & traction' }),
    field(capital, 21, {
      key: 'commercialTags',
      type: 'multiselect',
      label: 'Partnership or capital you are seeking',
      required: true,
      options: tagOptions.commercial_tags,
      filterDimensionId: dimensionIds.commercial_tags,
    }),
    field(capital, 22, {
      key: 'ticket_size',
      type: 'select',
      label: 'Capital sought',
      required: true,
      options: [
        { value: 'under-250k', label: 'Under USD 250k' },
        { value: '250k-1m', label: 'USD 250k – 1m' },
        { value: '1m-5m', label: 'USD 1m – 5m' },
        { value: '5m-25m', label: 'USD 5m – 25m' },
        { value: '25m-plus', label: 'USD 25m+' },
      ],
    }),
    field(capital, 23, {
      key: 'impact_metrics',
      type: 'textarea',
      label: 'Impact and traction to date',
      required: false,
      description:
        'People served, m³ saved or treated, utility pilots, revenue, or letters of intent.',
    }),
    field(capital, 24, {
      key: 'partnership_goal',
      type: 'textarea',
      label: 'What a successful meeting looks like',
      required: false,
    }),
  ];

  return {
    sections: [
      {
        id: about,
        title: 'Organization',
        description: 'Tell investors what you do in the water sector.',
        order: 0,
      },
      {
        id: solution,
        title: 'Solution fit',
        description: 'Same challenge, region, and capability variables used for investors.',
        order: 1,
      },
      {
        id: capital,
        title: 'Ask & traction',
        description: 'Capital type, ticket, and evidence of operational impact.',
        order: 2,
      },
    ],
    fields,
  };
}

export const INVESTOR_FORM_CODE = 'WATER_INVESTOR_ONBOARDING';
export const INNOVATOR_FORM_CODE = 'WATER_INNOVATOR_ONBOARDING';
export const LEGACY_FORM_CODE = 'ETHARA_ONBOARDING';

export async function seedWaterFiltersAndForms(prisma: PrismaClient) {
  const dimensionIds: Record<string, string> = {};
  const tagOptions: Record<string, TagDef[]> = {};

  for (const dim of WATER_DIMENSIONS) {
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

    const keep = dim.tags.map((t) => t.value);
    await prisma.filterTag.updateMany({
      where: { dimensionId: created.id, value: { notIn: keep } },
      data: { isActive: false },
    });

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
    name: 'Investor onboarding',
    description:
      'UN Water matchmaking form for investors — challenges, geographies, instruments, and ticket size.',
    targetType: 'COMPANY',
    hash: 'water-investor-onboarding-v1',
    schema: investorBuilt,
  });

  const innovatorForm = await upsertPublishedForm({
    code: INNOVATOR_FORM_CODE,
    name: 'Innovator onboarding',
    description:
      'UN Water matchmaking form for innovators — solution, regions, maturity, and capital ask.',
    targetType: 'VENDOR',
    hash: 'water-innovator-onboarding-v1',
    schema: innovatorBuilt,
  });

  await upsertPublishedForm({
    code: LEGACY_FORM_CODE,
    name: 'Investor onboarding',
    description: 'Legacy code kept in sync with the investor water form.',
    targetType: 'COMPANY',
    hash: 'water-investor-onboarding-v1',
    schema: investorBuilt,
  });

  await prisma.systemSetting.upsert({
    where: { key: 'registration.formId' },
    create: {
      key: 'registration.formId',
      value: { value: investorForm.form.id },
    },
    update: { value: { value: investorForm.form.id } },
  });

  return {
    dimensionIds,
    tagOptions,
    investorForm,
    innovatorForm,
  };
}
