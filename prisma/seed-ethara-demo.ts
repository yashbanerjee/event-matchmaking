/**
 * Ethara event-matchmaking demo data aligned with
 * https://www.ethara.com/en/events
 *
 * Creates filter tags, venues/places, published forms, 3 clients + 3 guests,
 * verified profiles, meeting requests, and calendar meetings.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';

const DEMO_PASSWORD = 'DemoEthara1!';

type TagDef = { value: string; label: string };

const DIMENSIONS: Array<{
  code: string;
  name: string;
  description: string;
  profileKey: string;
  sortOrder: number;
  tags: TagDef[];
}> = [
  {
    code: 'event_categories',
    name: 'Event categories',
    description: 'Ethara event categories from ethara.com/en/events',
    profileKey: 'categories',
    sortOrder: 10,
    tags: [
      { value: 'arts-culture', label: 'Arts & Culture' },
      { value: 'concerts', label: 'Concerts' },
      { value: 'family', label: 'Family' },
      { value: 'sports', label: 'Sports' },
      { value: 'gaming', label: 'Gaming' },
      { value: 'festivals', label: 'Festivals' },
    ],
  },
  {
    code: 'preferred_categories',
    name: 'Preferred categories',
    description: 'Client preferred Ethara event categories',
    profileKey: 'preferredCategories',
    sortOrder: 20,
    tags: [
      { value: 'arts-culture', label: 'Arts & Culture' },
      { value: 'concerts', label: 'Concerts' },
      { value: 'family', label: 'Family' },
      { value: 'sports', label: 'Sports' },
      { value: 'gaming', label: 'Gaming' },
      { value: 'festivals', label: 'Festivals' },
    ],
  },
  {
    code: 'venues',
    name: 'Venues & locations',
    description: 'Ethara / Yas Island venues and locations',
    profileKey: 'regions',
    sortOrder: 30,
    tags: [
      { value: 'etihad-arena', label: 'Etihad Arena' },
      { value: 'etihad-live', label: 'Etihad Live' },
      { value: 'yas-marina-circuit', label: 'Yas Marina Circuit' },
      { value: 'yas-gateway-park', label: 'Yas Gateway Park' },
      { value: 'space42-arena', label: 'Space42 Arena' },
      { value: 'coca-cola-arena', label: 'Coca-Cola Arena' },
      { value: 'yas-conference-centre', label: 'Yas Conference Centre' },
      { value: 'manarat-al-saadiyat', label: 'Manarat Al Saadiyat' },
      { value: 'qasr-al-hosn', label: 'Qasr Al Hosn' },
      { value: 'abu-dhabi', label: 'Abu Dhabi' },
    ],
  },
  {
    code: 'capabilities',
    name: 'Capabilities',
    description: 'Production and hospitality capabilities for Ethara events',
    profileKey: 'capabilities',
    sortOrder: 40,
    tags: [
      { value: 'live-production', label: 'Live production' },
      { value: 'artist-liaison', label: 'Artist liaison' },
      { value: 'ticketing', label: 'Ticketing' },
      { value: 'vip-hospitality', label: 'VIP hospitality' },
      { value: 'sports-ops', label: 'Sports operations' },
      { value: 'family-programming', label: 'Family programming' },
      { value: 'festival-ops', label: 'Festival operations' },
      { value: 'broadcast', label: 'Broadcast & media' },
      { value: 'sponsorship', label: 'Sponsorship activation' },
      { value: 'security-crowd', label: 'Security & crowd' },
    ],
  },
  {
    code: 'commercial_tags',
    name: 'Commercial focus',
    description: 'Commercial / partnership tags',
    profileKey: 'commercialTags',
    sortOrder: 50,
    tags: [
      { value: 'corporate', label: 'Corporate' },
      { value: 'vip', label: 'VIP' },
      { value: 'b2b', label: 'B2B partnerships' },
      { value: 'sponsorship', label: 'Sponsorship' },
      { value: 'rights-holder', label: 'Rights holder' },
      { value: 'content-provider', label: 'Content provider' },
    ],
  },
];

const PLACES = [
  {
    code: 'ETIHAD_ARENA',
    name: 'Etihad Arena',
    location: 'Yas Island, Abu Dhabi',
    capacity: 18000,
    description: 'Arena for Hans Zimmer, Andrea Bocelli, RAF and major concerts.',
  },
  {
    code: 'ETIHAD_LIVE',
    name: 'Etihad Live',
    location: 'Yas Island, Abu Dhabi',
    capacity: 25000,
    description: 'After-race concert venue (Kings of Leon, Imagine Dragons, etc.).',
  },
  {
    code: 'YAS_MARINA',
    name: 'Yas Marina Circuit',
    location: 'Yas Island, Abu Dhabi',
    capacity: 60000,
    description: 'Home of Formula 1® Etihad Airways Abu Dhabi Grand Prix.',
  },
  {
    code: 'YAS_GATEWAY',
    name: 'Yas Gateway Park',
    location: 'Yas Island, Abu Dhabi',
    capacity: 8000,
    description: 'Outdoor venue for after-parties such as Anyma.',
  },
  {
    code: 'COCA_COLA_ARENA',
    name: 'Coca-Cola Arena',
    location: 'Dubai',
    capacity: 17000,
    description: 'Ethara venue network arena for concerts and family shows.',
  },
] as const;

type DemoClient = {
  code: string;
  name: string;
  email: string;
  firstName: string;
  lastName: string;
  industry: string;
  website: string;
  preferredCategories: string[];
  requiredCapabilities: string[];
  regions: string[];
  commercialTags: string[];
  featured: boolean;
  about: string;
  focusEvents: string;
};

type DemoGuest = {
  code: string;
  name: string;
  displayName: string;
  email: string;
  firstName: string;
  lastName: string;
  industry: string;
  website: string;
  categories: string[];
  capabilities: string[];
  operatingRegions: string[];
  commercialTags: string[];
  featured: boolean;
  about: string;
  focusEvents: string;
};

const CLIENTS: DemoClient[] = [
  {
    code: 'ETH_CLI_01',
    name: 'Yasalam Live Productions',
    email: 'client1@ethara-demo.com',
    firstName: 'Layla',
    lastName: 'Al Mansoori',
    industry: 'Live entertainment',
    website: 'https://www.ethara.com/en/events',
    preferredCategories: ['concerts', 'arts-culture', 'festivals'],
    requiredCapabilities: [
      'live-production',
      'artist-liaison',
      'vip-hospitality',
      'ticketing',
    ],
    regions: ['etihad-arena', 'etihad-live', 'abu-dhabi'],
    commercialTags: ['vip', 'sponsorship', 'corporate'],
    featured: true,
    about:
      'Abu Dhabi promoter booking arena and after-race concerts with Ethara venues.',
    focusEvents:
      'Hans Zimmer Live, Andrea Bocelli, Kings of Leon & Lewis Capaldi after-race',
  },
  {
    code: 'ETH_CLI_02',
    name: 'Gulf Grand Prix Partners',
    email: 'client2@ethara-demo.com',
    firstName: 'Omar',
    lastName: 'Haddad',
    industry: 'Sports & motorsport',
    website: 'https://www.ethara.com/en/events',
    preferredCategories: ['sports', 'festivals', 'concerts'],
    requiredCapabilities: [
      'sports-ops',
      'vip-hospitality',
      'sponsorship',
      'broadcast',
    ],
    regions: ['yas-marina-circuit', 'etihad-live', 'yas-gateway-park'],
    commercialTags: ['corporate', 'sponsorship', 'rights-holder'],
    featured: true,
    about:
      'Corporate hospitality and brand partners around F1 weekend activations.',
    focusEvents:
      'Formula 1® Etihad Airways Abu Dhabi Grand Prix 2026 and after-race concerts',
  },
  {
    code: 'ETH_CLI_03',
    name: 'Family Moments Agency',
    email: 'client3@ethara-demo.com',
    firstName: 'Sara',
    lastName: 'Khalil',
    industry: 'Family entertainment',
    website: 'https://www.ethara.com/en/events',
    preferredCategories: ['family', 'gaming', 'festivals'],
    requiredCapabilities: [
      'family-programming',
      'security-crowd',
      'ticketing',
      'live-production',
    ],
    regions: ['etihad-arena', 'coca-cola-arena', 'abu-dhabi'],
    commercialTags: ['b2b', 'content-provider', 'corporate'],
    featured: false,
    about:
      'Family and youth programming agency seeking Ethara arena partners.',
    focusEvents: 'RAF Next Gen, family shows, and gaming activations',
  },
];

const GUESTS: DemoGuest[] = [
  {
    code: 'ETH_GST_01',
    name: 'Zimmer Tour Operations',
    displayName: 'Zimmer Tour Ops',
    email: 'guest1@ethara-demo.com',
    firstName: 'Noah',
    lastName: 'Richter',
    industry: 'Touring production',
    website: 'https://www.ethara.com/en/events',
    categories: ['concerts', 'arts-culture'],
    capabilities: [
      'live-production',
      'artist-liaison',
      'broadcast',
      'vip-hospitality',
    ],
    operatingRegions: ['etihad-arena', 'abu-dhabi', 'coca-cola-arena'],
    commercialTags: ['vip', 'content-provider', 'sponsorship'],
    featured: true,
    about:
      'Tour production team for arena classical / film-score concerts on Yas Island.',
    focusEvents: 'Abu Dhabi Festival presents Hans Zimmer Live! · Etihad Arena',
  },
  {
    code: 'ETH_GST_02',
    name: 'Marina Circuit Experiences',
    displayName: 'Marina Circuit Experiences',
    email: 'guest2@ethara-demo.com',
    firstName: 'Fatima',
    lastName: 'Noor',
    industry: 'Motorsport experiences',
    website: 'https://www.ethara.com/en/events',
    categories: ['sports', 'festivals', 'concerts'],
    capabilities: [
      'sports-ops',
      'vip-hospitality',
      'sponsorship',
      'festival-ops',
      'security-crowd',
    ],
    operatingRegions: [
      'yas-marina-circuit',
      'etihad-live',
      'yas-gateway-park',
      'abu-dhabi',
    ],
    commercialTags: ['corporate', 'sponsorship', 'rights-holder'],
    featured: true,
    about:
      'On-circuit hospitality, paddock access, and after-race concert logistics.',
    focusEvents:
      'F1 Abu Dhabi GP 2026 · Imagine Dragons / Chainsmokers after-race concerts',
  },
  {
    code: 'ETH_GST_03',
    name: 'RAF Combat Entertainment',
    displayName: 'RAF Combat Entertainment',
    email: 'guest3@ethara-demo.com',
    firstName: 'Jordan',
    lastName: 'Blake',
    industry: 'Combat sports & gaming',
    website: 'https://www.ethara.com/en/events',
    categories: ['gaming', 'sports', 'family'],
    capabilities: [
      'live-production',
      'family-programming',
      'ticketing',
      'broadcast',
      'security-crowd',
    ],
    operatingRegions: ['etihad-arena', 'space42-arena', 'abu-dhabi'],
    commercialTags: ['b2b', 'content-provider', 'vip'],
    featured: false,
    about:
      'Combat sports promoter delivering RAF main card and Next Gen youth programs.',
    focusEvents:
      'Real American Freestyle (RAF) Abu Dhabi · RAF Next Gen · Etihad Arena',
  },
];

function field(
  sectionId: string,
  order: number,
  partial: {
    key: string;
    type: string;
    label: string;
    required?: boolean;
    description?: string;
    options?: { value: string; label: string }[];
    filterDimensionId?: string | null;
  },
) {
  return {
    id: randomUUID(),
    key: partial.key,
    type: partial.type,
    label: partial.label,
    description: partial.description,
    required: partial.required ?? false,
    sectionId,
    order,
    options: partial.options,
    filterDimensionId: partial.filterDimensionId ?? null,
  };
}

function mapFieldType(type: string): Prisma.EnumFieldTypeFieldUpdateInput | string {
  const map: Record<string, string> = {
    text: 'SHORT_TEXT',
    textarea: 'LONG_TEXT',
    email: 'EMAIL',
    select: 'SINGLE_SELECT',
    multiselect: 'MULTI_SELECT',
    heading: 'READ_ONLY',
    info: 'READ_ONLY',
  };
  return map[type] ?? 'SHORT_TEXT';
}

export async function seedEtharaDemo(prisma: PrismaClient) {
  console.log('Seeding Ethara demo data (filters, places, 3 clients, 3 guests)…');

  const companyRole = await prisma.role.findUniqueOrThrow({
    where: { code: 'COMPANY_USER' },
  });
  const vendorRole = await prisma.role.findUniqueOrThrow({
    where: { code: 'VENDOR_USER' },
  });
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // ── Filters ──────────────────────────────────────────────────────────────
  const dimensionIds: Record<string, string> = {};
  const tagOptions: Record<string, { value: string; label: string }[]> = {};

  for (const dim of DIMENSIONS) {
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
    tagOptions[dim.code] = dim.tags;

    for (const [index, tag] of dim.tags.entries()) {
      await prisma.filterTag.upsert({
        where: {
          dimensionId_value: {
            dimensionId: created.id,
            value: tag.value,
          },
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

  // Cross-map concerts ↔ arts-culture for richer matching
  const concertPreferred = await prisma.filterTag.findFirst({
    where: {
      dimensionId: dimensionIds.preferred_categories,
      value: 'concerts',
    },
  });
  const artsGuest = await prisma.filterTag.findFirst({
    where: {
      dimensionId: dimensionIds.event_categories,
      value: 'arts-culture',
    },
  });
  if (concertPreferred && artsGuest) {
    await prisma.filterTagMapping.upsert({
      where: {
        fromTagId_toTagId: {
          fromTagId: concertPreferred.id,
          toTagId: artsGuest.id,
        },
      },
      create: {
        fromTagId: concertPreferred.id,
        toTagId: artsGuest.id,
        bidirectional: true,
      },
      update: { bidirectional: true },
    });
  }

  // ── Places ───────────────────────────────────────────────────────────────
  const placeIds: Record<string, string> = {};
  for (const place of PLACES) {
    const row = await prisma.place.upsert({
      where: { code: place.code },
      create: {
        code: place.code,
        name: place.name,
        location: place.location,
        capacity: place.capacity,
        description: place.description,
        isActive: true,
      },
      update: {
        name: place.name,
        location: place.location,
        capacity: place.capacity,
        description: place.description,
        isActive: true,
      },
    });
    placeIds[place.code] = row.id;
  }

  // ── Forms ────────────────────────────────────────────────────────────────
  async function upsertPublishedForm(input: {
    code: string;
    name: string;
    description: string;
    targetType: 'COMPANY' | 'VENDOR';
  }) {
    const sectionId = randomUUID();
    const fields = [
      field(sectionId, 0, {
        key: 'heading_profile',
        type: 'heading',
        label: input.targetType === 'COMPANY' ? 'Client profile' : 'Guest profile',
      }),
      field(sectionId, 1, {
        key: 'organization_summary',
        type: 'textarea',
        label: 'About your organization',
        required: true,
        description: 'How you work with Ethara venues and events.',
      }),
      field(sectionId, 2, {
        key: 'focus_events',
        type: 'textarea',
        label: 'Focus Ethara events',
        required: true,
        description:
          'e.g. Hans Zimmer Live, F1 Abu Dhabi GP, RAF Abu Dhabi — see ethara.com/en/events',
      }),
      field(sectionId, 3, {
        key:
          input.targetType === 'COMPANY' ? 'preferredCategories' : 'categories',
        type: 'multiselect',
        label: 'Event categories',
        required: true,
        options:
          tagOptions[
            input.targetType === 'COMPANY'
              ? 'preferred_categories'
              : 'event_categories'
          ],
        filterDimensionId:
          dimensionIds[
            input.targetType === 'COMPANY'
              ? 'preferred_categories'
              : 'event_categories'
          ],
      }),
      field(sectionId, 4, {
        key:
          input.targetType === 'COMPANY'
            ? 'requiredCapabilities'
            : 'capabilities',
        type: 'multiselect',
        label:
          input.targetType === 'COMPANY'
            ? 'Capabilities you need'
            : 'Your capabilities',
        required: true,
        options: tagOptions.capabilities,
        filterDimensionId: dimensionIds.capabilities,
      }),
      field(sectionId, 5, {
        key: input.targetType === 'COMPANY' ? 'regions' : 'operatingRegions',
        type: 'multiselect',
        label: 'Preferred venues / locations',
        required: true,
        options: tagOptions.venues,
        filterDimensionId: dimensionIds.venues,
      }),
      field(sectionId, 6, {
        key: 'commercialTags',
        type: 'multiselect',
        label: 'Commercial focus',
        required: false,
        options: tagOptions.commercial_tags,
        filterDimensionId: dimensionIds.commercial_tags,
      }),
      field(sectionId, 7, {
        key: 'contact_phone',
        type: 'text',
        label: 'Contact phone',
        required: false,
      }),
    ];

    const schema = {
      sections: [
        {
          id: sectionId,
          title: 'Ethara event profile',
          description:
            'Aligned with Ethara upcoming events (concerts, sports, family, gaming, festivals).',
          order: 0,
        },
      ],
      fields,
    };

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
      },
    });

    const existingVersion = await prisma.formVersion.findFirst({
      where: { formId: form.id, version: 1 },
    });

    let versionId: string;
    if (existingVersion) {
      await prisma.formField.deleteMany({
        where: { formVersionId: existingVersion.id },
      });
      await prisma.formVersion.update({
        where: { id: existingVersion.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: existingVersion.publishedAt ?? new Date(),
          schemaJson: schema as unknown as Prisma.InputJsonValue,
          schemaHash: `ethara-demo-${input.code}-v1`,
        },
      });
      versionId = existingVersion.id;
    } else {
      const created = await prisma.formVersion.create({
        data: {
          formId: form.id,
          version: 1,
          status: 'PUBLISHED',
          publishedAt: new Date(),
          schemaJson: schema as unknown as Prisma.InputJsonValue,
          schemaHash: `ethara-demo-${input.code}-v1`,
        },
      });
      versionId = created.id;
    }

    for (const [index, f] of fields.entries()) {
      if (f.type === 'heading' || f.type === 'info') continue;
      await prisma.formField.create({
        data: {
          formVersionId: versionId,
          fieldKey: f.key,
          label: f.label,
          description: f.description,
          fieldType: mapFieldType(f.type) as never,
          required: f.required,
          displayOrder: index,
          options: (f.options ?? []) as unknown as Prisma.InputJsonValue,
        },
      });
    }

    return { form, versionId, schema, fields };
  }

  const clientForm = await upsertPublishedForm({
    code: 'ETHARA_CLIENT_PROFILE',
    name: 'Ethara Client Profile',
    description:
      'Client onboarding for Ethara event matchmaking (concerts, sports, family).',
    targetType: 'COMPANY',
  });
  const guestForm = await upsertPublishedForm({
    code: 'ETHARA_GUEST_PROFILE',
    name: 'Ethara Guest Profile',
    description:
      'Guest / partner onboarding for Ethara venues and upcoming events.',
    targetType: 'VENDOR',
  });

  // Enable public registration against guest form by default if unset
  const regForm = await prisma.systemSetting.findUnique({
    where: { key: 'registration.formId' },
  });
  if (!regForm || !(regForm.value as { value?: string })?.value) {
    await prisma.systemSetting.upsert({
      where: { key: 'registration.formId' },
      create: {
        key: 'registration.formId',
        value: { value: guestForm.form.id },
      },
      update: { value: { value: guestForm.form.id } },
    });
  }
  await prisma.systemSetting.upsert({
    where: { key: 'registration.enabled' },
    create: { key: 'registration.enabled', value: { value: true } },
    update: {},
  });
  await prisma.systemSetting.upsert({
    where: { key: 'email.fromName' },
    create: { key: 'email.fromName', value: { value: 'Ethara' } },
    update: {},
  });

  // ── Cleanup previous demo meetings/requests for these orgs ───────────────
  const demoCodes = [...CLIENTS.map((c) => c.code), ...GUESTS.map((g) => g.code)];
  const existingDemoOrgs = await prisma.organization.findMany({
    where: { code: { in: demoCodes } },
    select: { id: true },
  });
  const existingIds = existingDemoOrgs.map((o) => o.id);
  if (existingIds.length) {
    const meetings = await prisma.meeting.findMany({
      where: {
        OR: [
          { companyOrgId: { in: existingIds } },
          { vendorOrgId: { in: existingIds } },
        ],
      },
      select: { id: true },
    });
    const meetingIds = meetings.map((m) => m.id);
    if (meetingIds.length) {
      await prisma.meetingFeedback.deleteMany({
        where: { meetingId: { in: meetingIds } },
      });
      await prisma.followUpAction.deleteMany({
        where: { meetingId: { in: meetingIds } },
      });
      await prisma.meetingRequest.deleteMany({
        where: { meetingId: { in: meetingIds } },
      });
      await prisma.meetingOccupancy.deleteMany({
        where: { meetingId: { in: meetingIds } },
      });
      await prisma.meeting.deleteMany({ where: { id: { in: meetingIds } } });
    }
    await prisma.meetingRequest.deleteMany({
      where: {
        OR: [
          { fromOrgId: { in: existingIds } },
          { toOrgId: { in: existingIds } },
        ],
      },
    });
    await prisma.formSubmission.deleteMany({
      where: { organizationId: { in: existingIds } },
    });
    await prisma.formAssignment.deleteMany({
      where: { organizationId: { in: existingIds } },
    });
    await prisma.invitation.deleteMany({
      where: { organizationId: { in: existingIds } },
    });
  }

  async function upsertDemoUser(input: {
    email: string;
    firstName: string;
    lastName: string;
    roleId: string;
  }) {
    const user = await prisma.user.upsert({
      where: { email: input.email },
      create: {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        status: 'ACTIVE',
        timeZone: 'Asia/Dubai',
      },
      update: {
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        status: 'ACTIVE',
        timeZone: 'Asia/Dubai',
      },
    });
    await prisma.userRole.upsert({
      where: {
        userId_roleId: { userId: user.id, roleId: input.roleId },
      },
      create: { userId: user.id, roleId: input.roleId },
      update: {},
    });
    return user;
  }

  function responsesFor(
    fields: Array<{ id: string; key: string; type: string }>,
    data: Record<string, unknown>,
  ) {
    const out: Record<string, unknown> = { ...data };
    for (const f of fields) {
      if (data[f.key] !== undefined) {
        out[f.id] = data[f.key];
      }
    }
    return out;
  }

  const clientOrgs: Array<{
    orgId: string;
    userId: string;
    def: DemoClient;
  }> = [];
  const guestOrgs: Array<{
    orgId: string;
    userId: string;
    def: DemoGuest;
  }> = [];

  // ── Clients ──────────────────────────────────────────────────────────────
  for (const client of CLIENTS) {
    const user = await upsertDemoUser({
      email: client.email,
      firstName: client.firstName,
      lastName: client.lastName,
      roleId: companyRole.id,
    });

    const org = await prisma.organization.upsert({
      where: { code: client.code },
      create: {
        code: client.code,
        name: client.name,
        type: 'COMPANY',
        status: 'APPROVED',
        industry: client.industry,
        region: 'Abu Dhabi',
        country: 'AE',
        website: client.website,
        timeZone: 'Asia/Dubai',
        customAttrs: {
          demo: true,
          etharaDemo: true,
          contactEmail: client.email,
          contactName: `${client.firstName} ${client.lastName}`,
          about: client.about,
          focusEvents: client.focusEvents,
        },
      },
      update: {
        name: client.name,
        status: 'APPROVED',
        industry: client.industry,
        region: 'Abu Dhabi',
        country: 'AE',
        website: client.website,
        archivedAt: null,
        customAttrs: {
          demo: true,
          etharaDemo: true,
          contactEmail: client.email,
          contactName: `${client.firstName} ${client.lastName}`,
          about: client.about,
          focusEvents: client.focusEvents,
        },
      },
    });

    await prisma.company.upsert({
      where: { organizationId: org.id },
      create: {
        organizationId: org.id,
        preferredCategories: client.preferredCategories,
        requiredCapabilities: client.requiredCapabilities,
        commercialPrefs: { tags: client.commercialTags },
        verificationStatus: 'VERIFIED',
        approvalStatus: 'VERIFIED',
        matchingEligible: true,
        featured: client.featured,
        normalizedProfile: {
          about: client.about,
          focusEvents: client.focusEvents,
          regions: client.regions,
        },
      },
      update: {
        preferredCategories: client.preferredCategories,
        requiredCapabilities: client.requiredCapabilities,
        commercialPrefs: { tags: client.commercialTags },
        verificationStatus: 'VERIFIED',
        approvalStatus: 'VERIFIED',
        matchingEligible: true,
        featured: client.featured,
        normalizedProfile: {
          about: client.about,
          focusEvents: client.focusEvents,
          regions: client.regions,
        },
      },
    });

    await prisma.organizationMember.upsert({
      where: {
        organizationId_userId: { organizationId: org.id, userId: user.id },
      },
      create: {
        organizationId: org.id,
        userId: user.id,
        isPrimary: true,
        title: 'Client lead',
      },
      update: { isPrimary: true, title: 'Client lead' },
    });

    await prisma.formAssignment.create({
      data: {
        formId: clientForm.form.id,
        formVersionId: clientForm.versionId,
        organizationId: org.id,
        userId: user.id,
        isRequired: true,
      },
    });

    const responseData = {
      organization_summary: client.about,
      focus_events: client.focusEvents,
      preferredCategories: client.preferredCategories,
      requiredCapabilities: client.requiredCapabilities,
      regions: client.regions,
      commercialTags: client.commercialTags,
      contact_phone: '+971 2 656 9999',
    };

    await prisma.formSubmission.create({
      data: {
        formVersionId: clientForm.versionId,
        organizationId: org.id,
        submittedById: user.id,
        status: 'APPROVED',
        submittedAt: new Date(),
        reviewedAt: new Date(),
        reviewNotes: 'Demo verified for Ethara client walkthrough',
        responses: responsesFor(clientForm.fields, responseData) as Prisma.InputJsonValue,
      },
    });

    clientOrgs.push({ orgId: org.id, userId: user.id, def: client });
  }

  // ── Guests ───────────────────────────────────────────────────────────────
  for (const guest of GUESTS) {
    const user = await upsertDemoUser({
      email: guest.email,
      firstName: guest.firstName,
      lastName: guest.lastName,
      roleId: vendorRole.id,
    });

    const org = await prisma.organization.upsert({
      where: { code: guest.code },
      create: {
        code: guest.code,
        name: guest.name,
        type: 'VENDOR',
        status: 'APPROVED',
        industry: guest.industry,
        region: 'Abu Dhabi',
        country: 'AE',
        website: guest.website,
        timeZone: 'Asia/Dubai',
        customAttrs: {
          demo: true,
          etharaDemo: true,
          contactEmail: guest.email,
          contactName: `${guest.firstName} ${guest.lastName}`,
          about: guest.about,
          focusEvents: guest.focusEvents,
        },
      },
      update: {
        name: guest.name,
        status: 'APPROVED',
        industry: guest.industry,
        region: 'Abu Dhabi',
        country: 'AE',
        website: guest.website,
        archivedAt: null,
        customAttrs: {
          demo: true,
          etharaDemo: true,
          contactEmail: guest.email,
          contactName: `${guest.firstName} ${guest.lastName}`,
          about: guest.about,
          focusEvents: guest.focusEvents,
        },
      },
    });

    await prisma.vendor.upsert({
      where: { organizationId: org.id },
      create: {
        organizationId: org.id,
        displayName: guest.displayName,
        categories: guest.categories,
        capabilities: guest.capabilities,
        services: guest.capabilities,
        operatingRegions: guest.operatingRegions,
        commercialPrefs: { tags: guest.commercialTags },
        verificationStatus: 'VERIFIED',
        approvalStatus: 'VERIFIED',
        onboardingComplete: true,
        matchingEligible: true,
        featured: guest.featured,
        normalizedProfile: {
          about: guest.about,
          focusEvents: guest.focusEvents,
        },
      },
      update: {
        displayName: guest.displayName,
        categories: guest.categories,
        capabilities: guest.capabilities,
        services: guest.capabilities,
        operatingRegions: guest.operatingRegions,
        commercialPrefs: { tags: guest.commercialTags },
        verificationStatus: 'VERIFIED',
        approvalStatus: 'VERIFIED',
        onboardingComplete: true,
        matchingEligible: true,
        featured: guest.featured,
        normalizedProfile: {
          about: guest.about,
          focusEvents: guest.focusEvents,
        },
      },
    });

    await prisma.organizationMember.upsert({
      where: {
        organizationId_userId: { organizationId: org.id, userId: user.id },
      },
      create: {
        organizationId: org.id,
        userId: user.id,
        isPrimary: true,
        title: 'Guest lead',
      },
      update: { isPrimary: true, title: 'Guest lead' },
    });

    await prisma.formAssignment.create({
      data: {
        formId: guestForm.form.id,
        formVersionId: guestForm.versionId,
        organizationId: org.id,
        userId: user.id,
        isRequired: true,
      },
    });

    const responseData = {
      organization_summary: guest.about,
      focus_events: guest.focusEvents,
      categories: guest.categories,
      capabilities: guest.capabilities,
      operatingRegions: guest.operatingRegions,
      commercialTags: guest.commercialTags,
      contact_phone: '+971 2 656 9999',
    };

    await prisma.formSubmission.create({
      data: {
        formVersionId: guestForm.versionId,
        organizationId: org.id,
        submittedById: user.id,
        status: 'APPROVED',
        submittedAt: new Date(),
        reviewedAt: new Date(),
        reviewNotes: 'Demo verified for Ethara guest walkthrough',
        responses: responsesFor(guestForm.fields, responseData) as Prisma.InputJsonValue,
      },
    });

    guestOrgs.push({ orgId: org.id, userId: user.id, def: guest });
  }

  // ── Meeting requests + meetings (full flow samples) ──────────────────────
  const now = new Date();
  const daysFromNow = (days: number, hour = 16, minute = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  async function createMeeting(input: {
    companyOrgId: string;
    vendorOrgId: string;
    startsAt: Date;
    durationMinutes: number;
    placeId: string;
    status: 'CONFIRMED' | 'AWAITING_CONFIRMATION' | 'COMPLETED' | 'PROPOSED';
    objectives: string;
    score: number;
  }) {
    const endsAt = new Date(
      input.startsAt.getTime() + input.durationMinutes * 60_000,
    );
    return prisma.meeting.create({
      data: {
        companyOrgId: input.companyOrgId,
        vendorOrgId: input.vendorOrgId,
        startsAt: input.startsAt,
        endsAt,
        durationMinutes: input.durationMinutes,
        placeId: input.placeId,
        mode: 'IN_PERSON',
        status: input.status,
        objectives: input.objectives,
        matchScore: input.score,
        timeZone: 'Asia/Dubai',
        venue: undefined,
        idempotencyKey: `ethara-demo:${input.companyOrgId}:${input.vendorOrgId}:${input.startsAt.toISOString()}`,
      },
    });
  }

  // 1) Confirmed meeting: Yasalam ↔ Zimmer @ Etihad Arena (Hans Zimmer track)
  {
    const startsAt = daysFromNow(5, 11, 0);
    const meeting = await createMeeting({
      companyOrgId: clientOrgs[0]!.orgId,
      vendorOrgId: guestOrgs[0]!.orgId,
      startsAt,
      durationMinutes: 45,
      placeId: placeIds.ETIHAD_ARENA!,
      status: 'CONFIRMED',
      objectives:
        'Align production rider and VIP hospitality for Hans Zimmer Live at Etihad Arena.',
      score: 92,
    });
    await prisma.meetingRequest.create({
      data: {
        fromOrgId: clientOrgs[0]!.orgId,
        toOrgId: guestOrgs[0]!.orgId,
        requestedById: clientOrgs[0]!.userId,
        status: 'SCHEDULED',
        message:
          'Interested in partnering on Hans Zimmer Live production at Etihad Arena.',
        proposedStartsAt: startsAt,
        proposedEndsAt: meeting.endsAt,
        proposedByOrgId: clientOrgs[0]!.orgId,
        placeId: placeIds.ETIHAD_ARENA!,
        meetingId: meeting.id,
      },
    });
    await prisma.meetingConfirmation.createMany({
      data: [
        {
          meetingId: meeting.id,
          userId: clientOrgs[0]!.userId,
          status: 'CONFIRMED',
          respondedAt: new Date(),
        },
        {
          meetingId: meeting.id,
          userId: guestOrgs[0]!.userId,
          status: 'CONFIRMED',
          respondedAt: new Date(),
        },
      ],
    });
  }

  // 2) Completed meeting + feedback: Gulf GP ↔ Marina Circuit
  {
    const startsAt = daysFromNow(-2, 10, 0);
    const meeting = await createMeeting({
      companyOrgId: clientOrgs[1]!.orgId,
      vendorOrgId: guestOrgs[1]!.orgId,
      startsAt,
      durationMinutes: 30,
      placeId: placeIds.YAS_MARINA!,
      status: 'COMPLETED',
      objectives:
        'Review F1 weekend hospitality packages and after-race concert guest flow.',
      score: 88,
    });
    await prisma.meetingRequest.create({
      data: {
        fromOrgId: clientOrgs[1]!.orgId,
        toOrgId: guestOrgs[1]!.orgId,
        requestedById: clientOrgs[1]!.userId,
        status: 'SCHEDULED',
        message: 'Need circuit hospitality inventory for GP weekend brands.',
        proposedStartsAt: startsAt,
        proposedEndsAt: meeting.endsAt,
        proposedByOrgId: guestOrgs[1]!.orgId,
        placeId: placeIds.YAS_MARINA!,
        meetingId: meeting.id,
      },
    });
    await prisma.meetingFeedback.create({
      data: {
        meetingId: meeting.id,
        organizationId: clientOrgs[1]!.orgId,
        reviewerUserId: clientOrgs[1]!.userId,
        attendanceConfirmed: true,
        meetingQuality: 5,
        relevance: 5,
        businessPotential: 4,
        communicationQuality: 5,
        interestLevel: 5,
        followUpRequired: true,
        outcome: 'FOLLOW_UP_REQUIRED',
        comments:
          'Strong fit for F1 corporate packages. Follow up on Yas Gateway after-party inventory.',
        isConfidential: true,
      },
    });
  }

  // 3) Awaiting confirmation: Family Moments ↔ RAF @ Etihad Arena
  {
    const startsAt = daysFromNow(8, 14, 30);
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
    const meeting = await createMeeting({
      companyOrgId: clientOrgs[2]!.orgId,
      vendorOrgId: guestOrgs[2]!.orgId,
      startsAt,
      durationMinutes: 30,
      placeId: placeIds.ETIHAD_ARENA!,
      status: 'AWAITING_CONFIRMATION',
      objectives: 'Plan RAF Next Gen family programming and ticketing journey.',
      score: 81,
    });
    await prisma.meetingRequest.create({
      data: {
        fromOrgId: clientOrgs[2]!.orgId,
        toOrgId: guestOrgs[2]!.orgId,
        requestedById: clientOrgs[2]!.userId,
        status: 'AWAITING_CONFIRMATION',
        message: 'Looking to co-produce family activations around RAF Next Gen.',
        proposedStartsAt: startsAt,
        proposedEndsAt: endsAt,
        proposedByOrgId: clientOrgs[2]!.orgId,
        placeId: placeIds.ETIHAD_ARENA!,
        meetingId: meeting.id,
      },
    });
  }

  // 4) Pending interest request (no meeting yet): Yasalam → Marina Circuit
  await prisma.meetingRequest.create({
    data: {
      fromOrgId: clientOrgs[0]!.orgId,
      toOrgId: guestOrgs[1]!.orgId,
      requestedById: clientOrgs[0]!.userId,
      status: 'PENDING',
      message:
        'Exploring after-race concert crossover for Kings of Leon weekend at Etihad Live.',
    },
  });

  // 5) Interest accepted + proposed slot: Gulf GP → Zimmer (cross category)
  {
    const startsAt = daysFromNow(12, 15, 0);
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
    await prisma.meetingRequest.create({
      data: {
        fromOrgId: clientOrgs[1]!.orgId,
        toOrgId: guestOrgs[0]!.orgId,
        requestedById: clientOrgs[1]!.userId,
        status: 'INTEREST_ACCEPTED',
        message:
          'Discuss VIP concert hospitality packages for GP weekend guests.',
        proposedStartsAt: startsAt,
        proposedEndsAt: endsAt,
        proposedByOrgId: guestOrgs[0]!.orgId,
        placeId: placeIds.ETIHAD_LIVE!,
      },
    });
  }

  // 6) Extra confirmed calendar meeting: Family ↔ Zimmer (optional collab)
  await createMeeting({
    companyOrgId: clientOrgs[2]!.orgId,
    vendorOrgId: guestOrgs[0]!.orgId,
    startsAt: daysFromNow(3, 13, 0),
    durationMinutes: 30,
    placeId: placeIds.COCA_COLA_ARENA!,
    status: 'CONFIRMED',
    objectives: 'Explore family-friendly classical crossover programming.',
    score: 74,
  });

  console.log(`
Ethara demo ready (inspired by https://www.ethara.com/en/events)

Password for all demo users: ${DEMO_PASSWORD}

Clients (portal /login → client dashboard):
  1) ${CLIENTS[0]!.email}  — ${CLIENTS[0]!.name}
  2) ${CLIENTS[1]!.email}  — ${CLIENTS[1]!.name}
  3) ${CLIENTS[2]!.email}  — ${CLIENTS[2]!.name}

Guests (login → guest panel):
  1) ${GUESTS[0]!.email}   — ${GUESTS[0]!.name}
  2) ${GUESTS[1]!.email}   — ${GUESTS[1]!.name}
  3) ${GUESTS[2]!.email}   — ${GUESTS[2]!.name}

Also seeded: Ethara filter tags, venues/places, published client/guest forms,
verified profiles, recommendations overlap, meeting requests, and calendar meetings.
`);
}
