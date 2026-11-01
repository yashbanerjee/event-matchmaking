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
  { value: 'under-250k', label: 'Under USD 250k' },
  { value: '250k-1m', label: 'USD 250k – 1m' },
  { value: '1m-5m', label: 'USD 1m – 5m' },
  { value: '5m-25m', label: 'USD 5m – 25m' },
  { value: '25m-plus', label: 'USD 25m+' },
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
      label: `${startOrder}. Full name`,
      required: true,
      description: 'Name shown on your meeting profile.',
      placeholder: 'First and last name',
    }),
    field(sectionId, startOrder + 1, {
      key: 'job_title',
      type: 'text',
      label: `${startOrder + 1}. Job title`,
      required: true,
      description: 'Your role at the organization.',
      placeholder: 'e.g. Partner, CEO, Investment Director',
    }),
    field(sectionId, startOrder + 2, {
      key: 'phone',
      type: 'text',
      label: `${startOrder + 2}. Mobile phone`,
      required: true,
      description: 'Include country code for on-site coordination.',
      placeholder: '+971 …',
    }),
    field(sectionId, startOrder + 3, {
      key: 'linkedin_url',
      type: 'text',
      label: `${startOrder + 3}. LinkedIn or website`,
      required: true,
      description: 'Profile or company URL for introductions.',
      placeholder: 'https://',
    }),
    field(sectionId, startOrder + 4, {
      key: 'country',
      type: 'select',
      label: `${startOrder + 4}. Country / base`,
      required: true,
      description: 'Where you are primarily based.',
      options: COUNTRY_OPTIONS,
    }),
  ];
}

/**
 * Investor form — personal details + match fields (≥10 questions).
 * Meeting dates/times are collected on the next registration step.
 */
export function buildInvestorOnboardingFields(
  dimensionIds: Record<string, string>,
  tagOptions: Record<string, TagDef[]>,
) {
  const personal = randomUUID();
  const profile = randomUUID();
  const match = randomUUID();
  const capital = randomUUID();

  const fields = [
    ...personalDetailFields(personal, 1),
    field(profile, 6, {
      key: 'industry',
      type: 'select',
      label: '6. Investor type',
      required: true,
      description: 'Used to pair you with relevant innovator pitches.',
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
    field(profile, 7, {
      key: 'organization_summary',
      type: 'textarea',
      label: '7. Investment thesis',
      required: true,
      description: 'What you look for in a pitch — outcomes, sectors, deal style.',
    }),
    field(profile, 8, {
      key: 'focus_events',
      type: 'textarea',
      label: '8. Goal for this event',
      required: true,
      description: 'e.g. shortlist innovators, find pilot partners, co-invest.',
    }),
    field(match, 9, {
      key: 'categories',
      type: 'multiselect',
      label: '9. Challenges you want to fund',
      required: true,
      description: 'Primary recommendation filter vs innovator challenges.',
      options: tagOptions.event_categories,
      filterDimensionId: dimensionIds.event_categories,
    }),
    field(match, 10, {
      key: 'regions',
      type: 'multiselect',
      label: '10. Priority geographies',
      required: true,
      description: 'Geography fit used in recommendations.',
      options: tagOptions.venues,
      filterDimensionId: dimensionIds.venues,
    }),
    field(match, 11, {
      key: 'capabilities',
      type: 'multiselect',
      label: '11. Solution types of interest',
      required: true,
      description: 'Maps to innovator capabilities for scoring.',
      options: tagOptions.capabilities,
      filterDimensionId: dimensionIds.capabilities,
    }),
    field(capital, 12, {
      key: 'commercialTags',
      type: 'multiselect',
      label: '12. Instruments you can deploy',
      required: true,
      description: 'Commercial fit against innovator ask.',
      options: tagOptions.commercial_tags,
      filterDimensionId: dimensionIds.commercial_tags,
    }),
    field(capital, 13, {
      key: 'investment_stages',
      type: 'multiselect',
      label: '13. Preferred stages',
      required: true,
      description: 'Stage fit vs innovator maturity.',
      options: tagOptions.investment_stages,
      filterDimensionId: dimensionIds.investment_stages,
    }),
    field(capital, 14, {
      key: 'ticket_size',
      type: 'select',
      label: '14. Typical ticket size',
      required: true,
      description: 'Ticket-size fit against innovator capital ask.',
      options: TICKET_OPTIONS,
    }),
  ];

  return {
    sections: [
      {
        id: personal,
        title: 'Personal details',
        description: 'How innovators and the team will reach you.',
        order: 0,
      },
      {
        id: profile,
        title: 'About your firm',
        description: 'Who sits across the table from innovators.',
        order: 1,
      },
      {
        id: match,
        title: 'Match criteria',
        description: 'These answers drive investor ↔ innovator recommendations.',
        order: 2,
      },
      {
        id: capital,
        title: 'Capital',
        description: 'Instruments, stage, and check size.',
        order: 3,
      },
    ],
    fields,
  };
}

/**
 * Innovator form — personal details + match fields (≥10 questions).
 * Meeting dates/times are collected on the next registration step.
 */
export function buildInnovatorOnboardingFields(
  dimensionIds: Record<string, string>,
  tagOptions: Record<string, TagDef[]>,
) {
  const personal = randomUUID();
  const profile = randomUUID();
  const match = randomUUID();
  const ask = randomUUID();

  const fields = [
    ...personalDetailFields(personal, 1),
    field(profile, 6, {
      key: 'industry',
      type: 'select',
      label: '6. Organization type',
      required: true,
      description: 'Helps investors understand the pitch context.',
      options: [
        { value: 'Startup / scale-up', label: 'Startup / scale-up' },
        { value: 'Technology provider', label: 'Technology provider' },
        { value: 'Utility / operator', label: 'Utility / operator' },
        { value: 'NGO / social enterprise', label: 'NGO / social enterprise' },
        { value: 'Research / university', label: 'Research / university spin-out' },
        { value: 'Project developer', label: 'Project developer' },
      ],
    }),
    field(profile, 7, {
      key: 'organization_summary',
      type: 'textarea',
      label: '7. Your pitch in plain language',
      required: true,
      description: 'Problem, solution, and who pays — one-minute story.',
    }),
    field(profile, 8, {
      key: 'focus_events',
      type: 'textarea',
      label: '8. Goal for this event',
      required: true,
      description: 'Capital, pilots, offtake, partners, or policy support.',
    }),
    field(match, 9, {
      key: 'categories',
      type: 'multiselect',
      label: '9. Challenges you address',
      required: true,
      description: 'Primary recommendation filter vs investor mandates.',
      options: tagOptions.event_categories,
      filterDimensionId: dimensionIds.event_categories,
    }),
    field(match, 10, {
      key: 'regions',
      type: 'multiselect',
      label: '10. Regions you can deploy in',
      required: true,
      description: 'Geography fit for investor interest.',
      options: tagOptions.venues,
      filterDimensionId: dimensionIds.venues,
    }),
    field(match, 11, {
      key: 'capabilities',
      type: 'multiselect',
      label: '11. Your solution capabilities',
      required: true,
      description: 'Capability overlap used in match scoring.',
      options: tagOptions.capabilities,
      filterDimensionId: dimensionIds.capabilities,
    }),
    field(match, 12, {
      key: 'investment_stages',
      type: 'select',
      label: '12. Solution maturity',
      required: true,
      description: 'Stage fit against investor preferences.',
      options: tagOptions.investment_stages,
      filterDimensionId: dimensionIds.investment_stages,
    }),
    field(ask, 13, {
      key: 'commercialTags',
      type: 'multiselect',
      label: '13. Partnership or capital you seek',
      required: true,
      description: 'Commercial fit with investor instruments.',
      options: tagOptions.commercial_tags,
      filterDimensionId: dimensionIds.commercial_tags,
    }),
    field(ask, 14, {
      key: 'ticket_size',
      type: 'select',
      label: '14. Capital sought',
      required: true,
      description: 'Ticket-size fit against investor check size.',
      options: TICKET_OPTIONS,
    }),
  ];

  return {
    sections: [
      {
        id: personal,
        title: 'Personal details',
        description: 'How investors and the team will reach you.',
        order: 0,
      },
      {
        id: profile,
        title: 'About your venture',
        description: 'Your pitch card for investors.',
        order: 1,
      },
      {
        id: match,
        title: 'Match criteria',
        description: 'Same fields investors use for recommendations.',
        order: 2,
      },
      {
        id: ask,
        title: 'The ask',
        description: 'Capital type and check size.',
        order: 3,
      },
    ],
    fields,
  };
}

export const INVESTOR_FORM_CODE = 'WATER_INVESTOR_ONBOARDING';
export const INNOVATOR_FORM_CODE = 'WATER_INNOVATOR_ONBOARDING';
export const KEEP_FORM_CODES = [INVESTOR_FORM_CODE, INNOVATOR_FORM_CODE] as const;

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
    name: 'Investor form',
    description:
      'Personal details and match fields for investors (availability on next step).',
    targetType: 'COMPANY',
    hash: 'investor-form-v4',
    schema: investorBuilt,
  });

  const innovatorForm = await upsertPublishedForm({
    code: INNOVATOR_FORM_CODE,
    name: 'Innovator form',
    description:
      'Personal details and match fields for innovators (availability on next step).',
    targetType: 'VENDOR',
    hash: 'innovator-form-v4',
    schema: innovatorBuilt,
  });

  // Delete every other form so the product only has these two.
  await deleteFormsExcept(prisma, [...KEEP_FORM_CODES]);

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
