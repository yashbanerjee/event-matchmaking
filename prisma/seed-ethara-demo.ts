/**
 * Sample organizations aligned with https://www.ethara.com/en/events
 * (filters, venues, forms, clients, guests, meetings).
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';

/** Shared password for the six sample accounts. */
const SAMPLE_PASSWORD = 'EtharaEvents26!';

/** Previous sample codes/emails to remove when refreshing data. */
const LEGACY_SAMPLE_CODES = [
  'ETH_CLI_01',
  'ETH_CLI_02',
  'ETH_CLI_03',
  'ETH_GST_01',
  'ETH_GST_02',
  'ETH_GST_03',
];
const LEGACY_SAMPLE_EMAIL_SUFFIX = '@ethara-demo.com';

type TagDef = { value: string; label: string };

/** Shared Ethara work / event tags (ethara.com/en Work + Upcoming Events). */
const ETHARA_EVENT_TAGS: TagDef[] = [
  { value: 'arts-culture', label: 'Arts & Culture' },
  { value: 'concerts', label: 'Concerts' },
  { value: 'family', label: 'Family' },
  { value: 'sports', label: 'Sports' },
  { value: 'gaming', label: 'Gaming' },
  { value: 'festivals', label: 'Festivals' },
  { value: 'motorsport', label: 'Motorsport (F1 / Supercross)' },
  { value: 'combat-sports', label: 'Combat sports (UFC)' },
  { value: 'basketball', label: 'Basketball (NBA)' },
  { value: 'tennis', label: 'Tennis' },
  { value: 'heritage', label: 'Heritage & culture' },
  { value: 'public-art', label: 'Public art & light' },
  { value: 'community', label: 'Community carnival' },
  { value: 'entrepreneurship', label: 'Entrepreneurship' },
  { value: 'yacht-lifestyle', label: 'Yacht & lifestyle' },
  { value: 'climate', label: 'Climate & global forums' },
];

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
    description:
      'Ethara work & event categories (concerts, sports, festivals, heritage — ethara.com/en)',
    profileKey: 'categories',
    sortOrder: 10,
    tags: ETHARA_EVENT_TAGS,
  },
  {
    code: 'preferred_categories',
    name: 'Preferred categories',
    description: 'Client preferred Ethara event / work categories',
    profileKey: 'preferredCategories',
    sortOrder: 20,
    tags: ETHARA_EVENT_TAGS,
  },
  {
    code: 'venues',
    name: 'Venues & locations',
    description: 'Ethara / OVG venues and destination locations',
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
      { value: 'saadiyat', label: 'Saadiyat Island' },
      { value: 'abu-dhabi', label: 'Abu Dhabi' },
      { value: 'dubai', label: 'Dubai' },
    ],
  },
  {
    code: 'ethara_services',
    name: 'Ethara services',
    description:
      'Services from ethara.com/en — world-class events, content, venue ops, sponsorship, tech',
    profileKey: 'capabilities',
    sortOrder: 35,
    tags: [
      { value: 'world-class-events', label: 'World-class events' },
      { value: 'content-creation', label: 'Content & creation' },
      { value: 'event-management', label: 'Event management' },
      { value: 'marketing-comms', label: 'Marketing & communications' },
      { value: 'venue-management', label: 'Venue management' },
      { value: 'sponsorship-sales', label: 'Sponsorship & sales' },
      { value: 'technology-innovation', label: 'Technology & innovation' },
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
      { value: 'world-class-events', label: 'World-class events' },
      { value: 'content-creation', label: 'Content & creation' },
      { value: 'event-management', label: 'Event management' },
      { value: 'marketing-comms', label: 'Marketing & communications' },
      { value: 'venue-management', label: 'Venue management' },
      { value: 'sponsorship-sales', label: 'Sponsorship & sales' },
      { value: 'technology-innovation', label: 'Technology & innovation' },
    ],
  },
  {
    code: 'commercial_tags',
    name: 'Commercial focus',
    description:
      'Partnership types Ethara works with — brands, rights-holders, talent, media',
    profileKey: 'commercialTags',
    sortOrder: 50,
    tags: [
      { value: 'corporate', label: 'Corporate' },
      { value: 'vip', label: 'VIP' },
      { value: 'b2b', label: 'B2B partnerships' },
      { value: 'sponsorship', label: 'Sponsorship' },
      { value: 'rights-holder', label: 'Rights holder' },
      { value: 'content-provider', label: 'Content provider' },
      { value: 'brand-partner', label: 'Brand partner' },
      { value: 'talent', label: 'Talent / artist' },
      { value: 'media-partner', label: 'Media partner' },
      { value: 'destination-marketing', label: 'Destination marketing' },
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
    code: 'YASALAM',
    name: 'Yasalam Live Productions',
    email: 'layla.mansoori@yasalam.ae',
    firstName: 'Layla',
    lastName: 'Al Mansoori',
    industry: 'Live entertainment',
    website: 'https://www.yasalam.ae',
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
      'Abu Dhabi live entertainment company booking arena and after-race concerts across Ethara venues.',
    focusEvents:
      'Hans Zimmer Live, Andrea Bocelli with Yasalam Classics, Kings of Leon & Lewis Capaldi after-race',
  },
  {
    code: 'GULFGP',
    name: 'Gulf Grand Prix Partners',
    email: 'omar.haddad@gulfgrandprix.ae',
    firstName: 'Omar',
    lastName: 'Haddad',
    industry: 'Sports & motorsport',
    website: 'https://www.gulfgrandprix.ae',
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
      'Corporate hospitality and brand partnerships for motorsport weekends on Yas Island.',
    focusEvents:
      'Formula 1® Etihad Airways Abu Dhabi Grand Prix 2026 and after-race concerts',
  },
  {
    code: 'FAMMOM',
    name: 'Family Moments Agency',
    email: 'sara.khalil@familymoments.ae',
    firstName: 'Sara',
    lastName: 'Khalil',
    industry: 'Family entertainment',
    website: 'https://www.familymoments.ae',
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
      'Family and youth programming agency producing arena activations and school-holiday shows.',
    focusEvents: 'RAF Next Gen, family arena shows, and gaming activations',
  },
];

const GUESTS: DemoGuest[] = [
  {
    code: 'ZIMMERTOUR',
    name: 'Zimmer Tour Operations',
    displayName: 'Zimmer Tour Operations',
    email: 'noah.richter@zimmertour.ae',
    firstName: 'Noah',
    lastName: 'Richter',
    industry: 'Touring production',
    website: 'https://www.zimmertour.ae',
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
      'Tour production team for arena classical and film-score concerts on Yas Island.',
    focusEvents: 'Abu Dhabi Festival presents Hans Zimmer Live! · Etihad Arena',
  },
  {
    code: 'MARINAEXP',
    name: 'Marina Circuit Experiences',
    displayName: 'Marina Circuit Experiences',
    email: 'fatima.noor@marinaexperiences.ae',
    firstName: 'Fatima',
    lastName: 'Noor',
    industry: 'Motorsport experiences',
    website: 'https://www.marinaexperiences.ae',
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
      'On-circuit hospitality, paddock access, and after-race concert logistics at Yas Marina.',
    focusEvents:
      'F1 Abu Dhabi GP 2026 · Imagine Dragons / The Chainsmokers after-race concerts',
  },
  {
    code: 'RAFENT',
    name: 'RAF Combat Entertainment',
    displayName: 'RAF Combat Entertainment',
    email: 'jordan.blake@rafcombat.ae',
    firstName: 'Jordan',
    lastName: 'Blake',
    industry: 'Combat sports & gaming',
    website: 'https://www.rafcombat.ae',
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
      'Combat sports promoter delivering RAF main-card events and Next Gen youth programs.',
    focusEvents:
      'Real American Freestyle (RAF) Abu Dhabi · RAF Next Gen · Etihad Arena',
  },
];

/** Extra verified accounts so each side can see up to 10 category recommendations. */
const EXTRA_CATEGORY_SETS: string[][] = [
  ['concerts', 'arts-culture'],
  ['sports', 'festivals'],
  ['family', 'gaming'],
  ['concerts', 'festivals'],
  ['sports', 'gaming'],
  ['arts-culture', 'family'],
  ['festivals', 'concerts'],
];

const EXTRA_CAPABILITY_SETS: string[][] = [
  ['live-production', 'artist-liaison', 'vip-hospitality'],
  ['sports-ops', 'sponsorship', 'broadcast'],
  ['family-programming', 'ticketing', 'security-crowd'],
  ['festival-ops', 'live-production', 'sponsorship'],
  ['broadcast', 'vip-hospitality', 'ticketing'],
  ['artist-liaison', 'family-programming', 'security-crowd'],
  ['sports-ops', 'festival-ops', 'live-production'],
];

const EXTRA_REGION_SETS: string[][] = [
  ['etihad-arena', 'abu-dhabi'],
  ['yas-marina-circuit', 'etihad-live'],
  ['coca-cola-arena', 'abu-dhabi'],
  ['etihad-live', 'yas-gateway-park'],
  ['space42-arena', 'abu-dhabi'],
  ['yas-conference-centre', 'abu-dhabi'],
  ['manarat-al-saadiyat', 'abu-dhabi'],
];

for (let i = 0; i < EXTRA_CATEGORY_SETS.length; i += 1) {
  const n = i + 4;
  const cats = EXTRA_CATEGORY_SETS[i]!;
  const caps = EXTRA_CAPABILITY_SETS[i]!;
  const regions = EXTRA_REGION_SETS[i]!;
  CLIENTS.push({
    code: `ETHCLI${String(n).padStart(2, '0')}`,
    name: `Ethara Client ${n}`,
    email: `client${n}@ethara-sample.ae`,
    firstName: 'Client',
    lastName: `${n}`,
    industry: 'Event partnerships',
    website: `https://www.ethara-sample.ae/client-${n}`,
    preferredCategories: cats,
    requiredCapabilities: caps,
    regions,
    commercialTags: ['corporate', 'b2b'],
    featured: false,
    about: `Demo client ${n} for category matchmaking (up to 10 recommendations).`,
    focusEvents: `Category demo focus: ${cats.join(', ')}`,
  });
  GUESTS.push({
    code: `ETHGST${String(n).padStart(2, '0')}`,
    name: `Ethara Guest ${n}`,
    displayName: `Ethara Guest ${n}`,
    email: `guest${n}@ethara-sample.ae`,
    firstName: 'Guest',
    lastName: `${n}`,
    industry: 'Event services',
    website: `https://www.ethara-sample.ae/guest-${n}`,
    categories: cats,
    capabilities: caps,
    operatingRegions: regions,
    commercialTags: ['corporate', 'b2b'],
    featured: false,
    about: `Demo guest ${n} for category matchmaking (up to 10 recommendations).`,
    focusEvents: `Category demo focus: ${cats.join(', ')}`,
  });
}

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
  console.log('Seeding Ethara event sample data (filters, places, clients, guests)…');

  const companyRole = await prisma.role.findUniqueOrThrow({
    where: { code: 'COMPANY_USER' },
  });
  const vendorRole = await prisma.role.findUniqueOrThrow({
    where: { code: 'VENDOR_USER' },
  });
  const passwordHash = await bcrypt.hash(SAMPLE_PASSWORD, 12);

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

  // Cross-map Ethara-related categories for richer matchmaking
  async function mapPreferredToEvent(fromValue: string, toValue: string) {
    const fromTag = await prisma.filterTag.findFirst({
      where: {
        dimensionId: dimensionIds.preferred_categories,
        value: fromValue,
      },
    });
    const toTag = await prisma.filterTag.findFirst({
      where: {
        dimensionId: dimensionIds.event_categories,
        value: toValue,
      },
    });
    if (!fromTag || !toTag) return;
    await prisma.filterTagMapping.upsert({
      where: {
        fromTagId_toTagId: { fromTagId: fromTag.id, toTagId: toTag.id },
      },
      create: {
        fromTagId: fromTag.id,
        toTagId: toTag.id,
        bidirectional: true,
      },
      update: { bidirectional: true },
    });
  }

  await mapPreferredToEvent('concerts', 'arts-culture');
  await mapPreferredToEvent('arts-culture', 'public-art');
  await mapPreferredToEvent('sports', 'motorsport');
  await mapPreferredToEvent('sports', 'combat-sports');
  await mapPreferredToEvent('sports', 'basketball');
  await mapPreferredToEvent('sports', 'tennis');
  await mapPreferredToEvent('festivals', 'community');
  await mapPreferredToEvent('festivals', 'heritage');
  await mapPreferredToEvent('family', 'community');
  await mapPreferredToEvent('gaming', 'entrepreneurship');

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

  // ── Single Ethara onboarding form (clients + guests) ─────────────────────
  function buildEtharaOnboardingFields() {
    const aboutSection = randomUUID();
    const interestsSection = randomUUID();
    const servicesSection = randomUUID();
    const commercialSection = randomUUID();

    const capabilityOptions = [
      ...(tagOptions.ethara_services ?? []),
      ...(tagOptions.capabilities ?? []).filter(
        (t) =>
          !(tagOptions.ethara_services ?? []).some((s) => s.value === t.value),
      ),
    ];

    const fields = [
      field(aboutSection, 0, {
        key: 'heading_about',
        type: 'heading',
        label: 'About you',
      }),
      field(aboutSection, 1, {
        key: 'industry',
        type: 'text',
        label: 'Industry / sector',
        required: true,
        description: 'e.g. Live entertainment, Sports rights, Brand marketing',
      }),
      field(aboutSection, 2, {
        key: 'organization_summary',
        type: 'textarea',
        label: 'About your organization',
        required: true,
        description:
          'How you create moments with Ethara venues, rights-holders, and audiences.',
      }),
      field(aboutSection, 3, {
        key: 'focus_events',
        type: 'textarea',
        label: 'Focus Ethara events / work',
        required: true,
        description:
          'e.g. F1 Abu Dhabi GP, Yasalam, NBA Abu Dhabi, UFC, Saadiyat Nights — ethara.com/en',
      }),
      field(aboutSection, 4, {
        key: 'contact_phone',
        type: 'text',
        label: 'Contact phone',
        required: false,
      }),
      field(interestsSection, 10, {
        key: 'heading_interests',
        type: 'heading',
        label: 'Event interests',
      }),
      field(interestsSection, 11, {
        key: 'categories',
        type: 'multiselect',
        label: 'Event / work categories',
        required: true,
        description:
          'Concerts, motorsport, combat sports, heritage, public art, gaming, and more',
        options: tagOptions.event_categories,
        filterDimensionId: dimensionIds.event_categories,
      }),
      field(interestsSection, 12, {
        key: 'regions',
        type: 'multiselect',
        label: 'Preferred venues / locations',
        required: true,
        options: tagOptions.venues,
        filterDimensionId: dimensionIds.venues,
      }),
      field(servicesSection, 20, {
        key: 'heading_services',
        type: 'heading',
        label: 'Services & capabilities',
      }),
      field(servicesSection, 21, {
        key: 'capabilities',
        type: 'multiselect',
        label: 'Ethara services & capabilities',
        required: true,
        description:
          'World-class events, content, venue management, sponsorship, tech, and production skills',
        options: capabilityOptions,
        filterDimensionId: dimensionIds.capabilities,
      }),
      field(commercialSection, 30, {
        key: 'heading_commercial',
        type: 'heading',
        label: 'Partnership focus',
      }),
      field(commercialSection, 31, {
        key: 'commercialTags',
        type: 'multiselect',
        label: 'Commercial / partnership type',
        required: true,
        options: tagOptions.commercial_tags,
        filterDimensionId: dimensionIds.commercial_tags,
      }),
      field(commercialSection, 32, {
        key: 'partnership_goal',
        type: 'textarea',
        label: 'What would a successful match look like?',
        required: false,
        description:
          'Meetings, sponsorship activation, co-promotion, venue booking, talent, etc.',
      }),
    ];

    const sections = [
      {
        id: aboutSection,
        title: 'Organization',
        description:
          'One onboarding form for Ethara clients and guests — fields map to matchmaking.',
        order: 0,
      },
      {
        id: interestsSection,
        title: 'Categories & venues',
        description: 'Aligned with Ethara Work and venue portfolio.',
        order: 1,
      },
      {
        id: servicesSection,
        title: 'Services',
        description: 'Ethara services + production capabilities used in scoring.',
        order: 2,
      },
      {
        id: commercialSection,
        title: 'Partnership',
        description: 'Brands, rights-holders, talent, and media partners.',
        order: 3,
      },
    ];

    return { sections, fields };
  }

  const ONBOARDING_CODE = 'ETHARA_ONBOARDING';
  const { sections: onboardingSections, fields: onboardingFields } =
    buildEtharaOnboardingFields();
  const onboardingSchema = {
    sections: onboardingSections,
    fields: onboardingFields,
  };
  const onboardingHash = 'ethara-onboarding-v1';

  const onboardingFormRow = await prisma.form.upsert({
    where: { code: ONBOARDING_CODE },
    create: {
      code: ONBOARDING_CODE,
      name: 'Ethara onboarding form',
      description:
        'Single onboarding form for Ethara clients and guests (categories, venues, services, partnerships).',
      targetType: null,
      isTemplate: false,
    },
    update: {
      name: 'Ethara onboarding form',
      description:
        'Single onboarding form for Ethara clients and guests (categories, venues, services, partnerships).',
      targetType: null,
      isTemplate: false,
    },
  });

  const existingOnboardingVersion = await prisma.formVersion.findFirst({
    where: { formId: onboardingFormRow.id, version: 1 },
  });

  let onboardingVersionId: string;
  if (existingOnboardingVersion) {
    await prisma.formField.deleteMany({
      where: { formVersionId: existingOnboardingVersion.id },
    });
    await prisma.formVersion.update({
      where: { id: existingOnboardingVersion.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: existingOnboardingVersion.publishedAt ?? new Date(),
        schemaJson: onboardingSchema as unknown as Prisma.InputJsonValue,
        schemaHash: onboardingHash,
      },
    });
    onboardingVersionId = existingOnboardingVersion.id;
  } else {
    const created = await prisma.formVersion.create({
      data: {
        formId: onboardingFormRow.id,
        version: 1,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        schemaJson: onboardingSchema as unknown as Prisma.InputJsonValue,
        schemaHash: onboardingHash,
      },
    });
    onboardingVersionId = created.id;
  }

  for (const [index, f] of onboardingFields.entries()) {
    if (f.type === 'heading' || f.type === 'info') continue;
    await prisma.formField.create({
      data: {
        formVersionId: onboardingVersionId,
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

  const onboardingForm = {
    form: onboardingFormRow,
    versionId: onboardingVersionId,
    fields: onboardingFields,
  };

  // Remove every other form so the directory shows only Ethara onboarding
  const obsoleteForms = await prisma.form.findMany({
    where: { code: { not: ONBOARDING_CODE } },
    select: { id: true },
  });
  if (obsoleteForms.length) {
    const obsoleteIds = obsoleteForms.map((f) => f.id);
    await prisma.formAssignment.deleteMany({
      where: { formId: { in: obsoleteIds } },
    });
    await prisma.form.deleteMany({ where: { id: { in: obsoleteIds } } });
  }

  await prisma.systemSetting.upsert({
    where: { key: 'registration.formId' },
    create: {
      key: 'registration.formId',
      value: { value: onboardingForm.form.id },
    },
    update: { value: { value: onboardingForm.form.id } },
  });
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

  // Meeting booking period (clients/guests can only schedule inside this range)
  const windowStart = new Date();
  windowStart.setUTCHours(0, 0, 0, 0);
  const windowEnd = new Date(windowStart);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 90);
  const toYmd = (d: Date) => d.toISOString().slice(0, 10);
  await prisma.systemSetting.upsert({
    where: { key: 'ops.meetingWindowStart' },
    create: {
      key: 'ops.meetingWindowStart',
      value: { value: toYmd(windowStart) },
    },
    update: { value: { value: toYmd(windowStart) } },
  });
  await prisma.systemSetting.upsert({
    where: { key: 'ops.meetingWindowEnd' },
    create: {
      key: 'ops.meetingWindowEnd',
      value: { value: toYmd(windowEnd) },
    },
    update: { value: { value: toYmd(windowEnd) } },
  });
  await prisma.systemSetting.upsert({
    where: { key: 'ops.meetingDurationMinutes' },
    create: {
      key: 'ops.meetingDurationMinutes',
      value: { value: 15 },
    },
    update: {},
  });

  // ── Cleanup previous sample orgs (current + legacy) ──────────────────────
  const sampleCodes = [
    ...CLIENTS.map((c) => c.code),
    ...GUESTS.map((g) => g.code),
    ...LEGACY_SAMPLE_CODES,
  ];
  const existingSampleOrgs = await prisma.organization.findMany({
    where: { code: { in: sampleCodes } },
    select: { id: true, members: { select: { userId: true } } },
  });
  const existingIds = existingSampleOrgs.map((o) => o.id);
  const legacyUserIds = [
    ...new Set(existingSampleOrgs.flatMap((o) => o.members.map((m) => m.userId))),
  ];

  async function purgeOrgGraph(orgIds: string[]) {
    if (!orgIds.length) return;
    const meetings = await prisma.meeting.findMany({
      where: {
        OR: [
          { companyOrgId: { in: orgIds } },
          { vendorOrgId: { in: orgIds } },
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
        OR: [{ fromOrgId: { in: orgIds } }, { toOrgId: { in: orgIds } }],
      },
    });
    await prisma.matchCandidate.deleteMany({
      where: {
        OR: [{ companyOrgId: { in: orgIds } }, { vendorOrgId: { in: orgIds } }],
      },
    });
    await prisma.match.deleteMany({
      where: {
        OR: [{ companyOrgId: { in: orgIds } }, { vendorOrgId: { in: orgIds } }],
      },
    });
    await prisma.formSubmission.deleteMany({
      where: { organizationId: { in: orgIds } },
    });
    await prisma.formAssignment.deleteMany({
      where: { organizationId: { in: orgIds } },
    });
    await prisma.invitation.deleteMany({
      where: { organizationId: { in: orgIds } },
    });
    await prisma.document.deleteMany({
      where: { organizationId: { in: orgIds } },
    });
    await prisma.eventRegistration.deleteMany({
      where: { organizationId: { in: orgIds } },
    });
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  }

  await purgeOrgGraph(existingIds);

  const legacyUsers = await prisma.user.findMany({
    where: {
      OR: [
        { id: { in: legacyUserIds } },
        { email: { endsWith: LEGACY_SAMPLE_EMAIL_SUFFIX } },
        {
          email: {
            in: [...CLIENTS, ...GUESTS].map((account) => account.email),
          },
        },
      ],
    },
    select: { id: true },
  });
  for (const user of legacyUsers) {
    const remaining = await prisma.organizationMember.count({
      where: { userId: user.id },
    });
    if (remaining > 0) continue;
    await prisma.auditLog.updateMany({
      where: { actorId: user.id },
      data: { actorId: null },
    });
    await prisma.invitation.updateMany({
      where: { acceptedById: user.id },
      data: { acceptedById: null },
    });
    await prisma.eventRegistration.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }

  async function upsertSampleUser(input: {
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
    const user = await upsertSampleUser({
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
        formId: onboardingForm.form.id,
        formVersionId: onboardingForm.versionId,
        organizationId: org.id,
        userId: user.id,
        isRequired: true,
      },
    });

    const responseData = {
      industry: client.industry,
      organization_summary: client.about,
      focus_events: client.focusEvents,
      categories: client.preferredCategories,
      capabilities: client.requiredCapabilities,
      regions: client.regions,
      commercialTags: client.commercialTags,
      contact_phone: '+971 2 656 9999',
      partnership_goal: 'Meet partners who can activate Ethara venues and audiences.',
    };

    await prisma.formSubmission.create({
      data: {
        formVersionId: onboardingForm.versionId,
        organizationId: org.id,
        submittedById: user.id,
        status: 'APPROVED',
        submittedAt: new Date(),
        reviewedAt: new Date(),
        reviewNotes: 'Verified — profile complete for matchmaking',
        responses: responsesFor(
          onboardingForm.fields,
          responseData,
        ) as Prisma.InputJsonValue,
      },
    });

    clientOrgs.push({ orgId: org.id, userId: user.id, def: client });
  }

  // ── Guests ───────────────────────────────────────────────────────────────
  for (const guest of GUESTS) {
    const user = await upsertSampleUser({
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
        formId: onboardingForm.form.id,
        formVersionId: onboardingForm.versionId,
        organizationId: org.id,
        userId: user.id,
        isRequired: true,
      },
    });

    const responseData = {
      industry: guest.industry,
      organization_summary: guest.about,
      focus_events: guest.focusEvents,
      categories: guest.categories,
      capabilities: guest.capabilities,
      regions: guest.operatingRegions,
      commercialTags: guest.commercialTags,
      contact_phone: '+971 2 656 9999',
      partnership_goal: 'Connect with Ethara clients for the right event moments.',
    };

    await prisma.formSubmission.create({
      data: {
        formVersionId: onboardingForm.versionId,
        organizationId: org.id,
        submittedById: user.id,
        status: 'APPROVED',
        submittedAt: new Date(),
        reviewedAt: new Date(),
        reviewNotes: 'Verified — profile complete for matchmaking',
        responses: responsesFor(
          onboardingForm.fields,
          responseData,
        ) as Prisma.InputJsonValue,
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
        idempotencyKey: `ethara-events:${input.companyOrgId}:${input.vendorOrgId}:${input.startsAt.toISOString()}`,
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

  // 4) Awaiting confirmation: Yasalam → Marina Circuit @ Etihad Live
  {
    const startsAt = daysFromNow(9, 17, 0);
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
    await prisma.meetingRequest.create({
      data: {
        fromOrgId: clientOrgs[0]!.orgId,
        toOrgId: guestOrgs[1]!.orgId,
        requestedById: clientOrgs[0]!.userId,
        status: 'AWAITING_CONFIRMATION',
        message:
          'Exploring after-race concert crossover for Kings of Leon weekend at Etihad Live.',
        proposedStartsAt: startsAt,
        proposedEndsAt: endsAt,
        proposedByOrgId: clientOrgs[0]!.orgId,
        placeId: placeIds.ETIHAD_LIVE!,
      },
    });
  }

  // 5) Awaiting confirmation: Gulf GP → Zimmer @ Etihad Arena
  {
    const startsAt = daysFromNow(12, 15, 0);
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
    await prisma.meetingRequest.create({
      data: {
        fromOrgId: clientOrgs[1]!.orgId,
        toOrgId: guestOrgs[0]!.orgId,
        requestedById: clientOrgs[1]!.userId,
        status: 'AWAITING_CONFIRMATION',
        message:
          'Discuss VIP concert hospitality packages for GP weekend guests.',
        proposedStartsAt: startsAt,
        proposedEndsAt: endsAt,
        proposedByOrgId: clientOrgs[1]!.orgId,
        placeId: placeIds.ETIHAD_ARENA!,
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
Ethara sample accounts ready (aligned with https://www.ethara.com/en/events)

Password for all sample users: ${SAMPLE_PASSWORD}

Full-flow pair (strong category match — concerts / arts-culture):
  Client: ${CLIENTS[0]!.email}  /  ${SAMPLE_PASSWORD}
  Guest:  ${GUESTS[0]!.email}  /  ${SAMPLE_PASSWORD}

Clients (${CLIENTS.length} total, recommendations capped at 10):
${CLIENTS.map((c, i) => `  ${i + 1}) ${c.email}  — ${c.name}`).join('\n')}

Guests (${GUESTS.length} total, recommendations capped at 10):
${GUESTS.map((g, i) => `  ${i + 1}) ${g.email}  — ${g.name}`).join('\n')}
`);
}
