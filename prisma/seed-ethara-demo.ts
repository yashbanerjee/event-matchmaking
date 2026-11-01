/**
 * Sample organizations for a 3-day UN Water matchmaking event
 * (filters, forms, investors, innovators, meetings).
 */
import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { seedWaterFiltersAndForms } from './water-onboarding';
import {
  WATER_DEMO_INNOVATORS,
  WATER_DEMO_INVESTORS,
} from './water-demo-profiles';

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
const DEMO_EMAIL_SUFFIXES = [
  '@ethara-demo.com',
  '@ethara-sample.ae',
  '@unwater.ethara.demo',
];

type TagDef = { value: string; label: string };

const ARENA_LOCATION = 'Coca Cola Arena';
const TABLE_COUNT = 20;

/** One home table per investor, all on the Coca Cola Arena floor. */
const PLACES = Array.from({ length: TABLE_COUNT }, (_, index) => {
  const n = index + 1;
  const code = `CCA_T${String(n).padStart(2, '0')}`;
  return {
    code,
    name: `Table ${n}`,
    location: ARENA_LOCATION,
    capacity: 4,
    description: `Investor home table ${n} at ${ARENA_LOCATION}.`,
  };
});

function tableCodeForInvestor(index: number) {
  return `CCA_T${String(index + 1).padStart(2, '0')}`;
}

function allDayWindow(date: string) {
  const startsAt = new Date(`${date}T00:00:00+04:00`);
  const endsAt = new Date(startsAt.getTime() + 24 * 60 * 60 * 1000);
  return { startsAt, endsAt };
}

const CLIENTS = WATER_DEMO_INVESTORS;
const GUESTS = WATER_DEMO_INNOVATORS;

export async function seedEtharaDemo(prisma: PrismaClient) {
  console.log(
    'Seeding UN Water matchmaking sample data (filters, places, investors, innovators)…',
  );

  const companyRole = await prisma.role.findUniqueOrThrow({
    where: { code: 'COMPANY_USER' },
  });
  const vendorRole = await prisma.role.findUniqueOrThrow({
    where: { code: 'VENDOR_USER' },
  });
  const passwordHash = await bcrypt.hash(SAMPLE_PASSWORD, 12);

  const water = await seedWaterFiltersAndForms(prisma);
  const dimensionIds = water.dimensionIds;
  const tagOptions = water.tagOptions;
  const onboardingForm = {
    form: water.investorForm.form,
    versionId: water.investorForm.versionId,
    fields: water.investorForm.fields,
  };
  const innovatorOnboardingForm = {
    form: water.innovatorForm.form,
    versionId: water.innovatorForm.versionId,
    fields: water.innovatorForm.fields,
  };

  // ── Places: 20 tables at Coca Cola Arena ────────────────────────────────
  const placeIds: Record<string, string> = {};
  const arenaTableCodes = PLACES.map((place) => place.code);
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
  // Keep older venue rows for history but hide them from booking.
  await prisma.place.updateMany({
    where: { code: { notIn: arenaTableCodes } },
    data: { isActive: false },
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

  // Meeting booking period (investors/innovators can only schedule inside this range)
  const eventDates = ['2026-12-07', '2026-12-08', '2026-12-09'];
  const windowStart = eventDates[0]!;
  const windowEnd = eventDates[eventDates.length - 1]!;
  await prisma.systemSetting.upsert({
    where: { key: 'ops.eventDates' },
    create: {
      key: 'ops.eventDates',
      value: { value: eventDates.join(',') },
    },
    update: { value: { value: eventDates.join(',') } },
  });
  await prisma.systemSetting.upsert({
    where: { key: 'ops.eventActiveStart' },
    create: { key: 'ops.eventActiveStart', value: { value: '09:00' } },
    update: { value: { value: '09:00' } },
  });
  await prisma.systemSetting.upsert({
    where: { key: 'ops.eventActiveEnd' },
    create: { key: 'ops.eventActiveEnd', value: { value: '17:00' } },
    update: { value: { value: '17:00' } },
  });
  await prisma.systemSetting.upsert({
    where: { key: 'ops.meetingWindowStart' },
    create: {
      key: 'ops.meetingWindowStart',
      value: { value: windowStart },
    },
    update: { value: { value: windowStart } },
  });
  await prisma.systemSetting.upsert({
    where: { key: 'ops.meetingWindowEnd' },
    create: {
      key: 'ops.meetingWindowEnd',
      value: { value: windowEnd },
    },
    update: { value: { value: windowEnd } },
  });
  await prisma.systemSetting.upsert({
    where: { key: 'ops.meetingDurationMinutes' },
    create: {
      key: 'ops.meetingDurationMinutes',
      value: { value: 15 },
    },
    update: {},
  });

  // ── Wipe all investors & innovators (full roster refresh) ─────────────────
  console.log('Removing existing investor and innovator organizations…');

  const existingPeerOrgs = await prisma.organization.findMany({
    where: { type: { in: ['COMPANY', 'VENDOR'] } },
    select: { id: true, members: { select: { userId: true } } },
  });
  const existingIds = existingPeerOrgs.map((o) => o.id);
  const legacyUserIds = [
    ...new Set(existingPeerOrgs.flatMap((o) => o.members.map((m) => m.userId))),
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
      await prisma.meetingConfirmation.deleteMany({
        where: { meetingId: { in: meetingIds } },
      });
      await prisma.meetingParticipant.deleteMany({
        where: { meetingId: { in: meetingIds } },
      });
      await prisma.meetingStatusHistory.deleteMany({
        where: { meetingId: { in: meetingIds } },
      });
      await prisma.meetingReschedule.deleteMany({
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
    await prisma.orgPeerRecommendation.deleteMany({
      where: {
        OR: [{ fromOrgId: { in: orgIds } }, { toOrgId: { in: orgIds } }],
      },
    });
    await prisma.investorPlaceAssignment.deleteMany({
      where: { organizationId: { in: orgIds } },
    });
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  }

  await purgeOrgGraph(existingIds);

  const legacyUsers = await prisma.user.findMany({
    where: {
      OR: [
        { id: { in: legacyUserIds } },
        ...DEMO_EMAIL_SUFFIXES.map((suffix) => ({
          email: { endsWith: suffix },
        })),
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

  function firstOf(value: string | string[] | undefined, fallback: string) {
    if (Array.isArray(value) && value.length) return value[0]!;
    if (typeof value === 'string' && value.trim()) return value;
    return fallback;
  }

  function normalizeTicket(raw: string): string {
    const known = [
      'under-250k',
      '250k-1m',
      '1m-5m',
      '5m-25m',
      '25m-plus',
    ] as const;
    if ((known as readonly string[]).includes(raw)) return raw;
    const compact = raw.toLowerCase().replace(/\s+/g, '');
    if (compact.includes('50m') || compact.includes('25m-plus')) return '25m-plus';
    if (compact.includes('25m') || compact.includes('20m') || compact.includes('15m') || compact.includes('12m') || compact.includes('10m') || compact.includes('8m')) {
      return compact.startsWith('100k') || compact.startsWith('250k') || compact.startsWith('500k') || compact.startsWith('750k')
        ? '1m-5m'
        : '5m-25m';
    }
    if (compact.includes('5m') || compact.includes('4m') || compact.includes('3m') || compact.includes('2m') || compact.includes('1.5m') || compact.includes('1m')) {
      return '1m-5m';
    }
    if (compact.includes('750k') || compact.includes('600k') || compact.includes('500k') || compact.includes('400k') || compact.includes('300k') || compact.includes('250k')) {
      return '250k-1m';
    }
    return 'under-250k';
  }

  function schedulingIndustry(raw: string): string {
    const text = raw.toLowerCase();
    if (text.includes('agri') || text.includes('farm') || text.includes('irrig')) return 'agriculture';
    if (text.includes('energy') || text.includes('solar') || text.includes('renew')) return 'energy';
    if (text.includes('food')) return 'food';
    if (text.includes('climate') || text.includes('nature') || text.includes('adapt')) return 'climate';
    if (text.includes('software') || text.includes('digital') || text.includes('ai') || text.includes('iot')) {
      return 'technology';
    }
    if (text.includes('automat')) return 'automation';
    if (text.includes('water') || text.includes('wash') || text.includes('desal') || text.includes('utilit') || text.includes('sanit')) {
      return 'water';
    }
    return 'water';
  }

  function phoneFor(country: string, index: number): string {
    const prefixes: Record<string, string> = {
      AE: '+971 50',
      SA: '+966 55',
      EG: '+20 10',
      KE: '+254 7',
      NG: '+234 80',
      ZA: '+27 82',
      IN: '+91 98',
      GB: '+44 77',
      US: '+1 415',
      DE: '+49 170',
      SN: '+221 77',
      SG: '+65 8',
    };
    const prefix = prefixes[country] ?? '+971 50';
    const n = String(100000 + (index % 80000)).slice(-6);
    return `${prefix} ${n}`;
  }

  const investorOrgs: Array<{
    orgId: string;
    userId: string;
    def: (typeof CLIENTS)[number];
  }> = [];
  const innovatorOrgs: Array<{
    orgId: string;
    userId: string;
    def: (typeof GUESTS)[number];
  }> = [];

  // ── Investors ──────────────────────────────────────────────────────────────
  for (const investor of CLIENTS) {
    const user = await upsertSampleUser({
      email: investor.email,
      firstName: investor.firstName,
      lastName: investor.lastName,
      roleId: companyRole.id,
    });

    const org = await prisma.organization.upsert({
      where: { code: investor.code },
      create: {
        code: investor.code,
        name: investor.name,
        type: 'COMPANY',
        status: 'APPROVED',
        industry: investor.industry,
        region: investor.region,
        country: investor.country,
        website: investor.website,
        timeZone: 'Asia/Dubai',
        customAttrs: {
          contactEmail: investor.email,
          contactName: `${investor.firstName} ${investor.lastName}`,
          about: investor.about,
          focusEvents: investor.focusEvents,
        },
      },
      update: {
        name: investor.name,
        status: 'APPROVED',
        industry: investor.industry,
        region: investor.region,
        country: investor.country,
        website: investor.website,
        archivedAt: null,
        customAttrs: {
          contactEmail: investor.email,
          contactName: `${investor.firstName} ${investor.lastName}`,
          about: investor.about,
          focusEvents: investor.focusEvents,
        },
      },
    });

    await prisma.company.upsert({
      where: { organizationId: org.id },
      create: {
        organizationId: org.id,
        preferredCategories: investor.preferredCategories,
        requiredCapabilities: investor.requiredCapabilities,
        commercialPrefs: { tags: investor.commercialTags },
        verificationStatus: 'VERIFIED',
        approvalStatus: 'VERIFIED',
        matchingEligible: true,
        featured: investor.featured,
        normalizedProfile: {
          about: investor.about,
          focusEvents: investor.focusEvents,
          regions: investor.regions,
          responses: {
            industry: investor.industry,
            organization_summary: investor.about,
            focus_events: investor.focusEvents,
            categories: investor.preferredCategories,
            capabilities: investor.requiredCapabilities,
            regions: investor.regions,
            commercialTags: investor.commercialTags,
            partnership_goal: investor.partnershipGoal,
            ticket_size: investor.ticketSize,
            investment_stages: investor.investmentStages,
          },
        },
      },
      update: {
        preferredCategories: investor.preferredCategories,
        requiredCapabilities: investor.requiredCapabilities,
        commercialPrefs: { tags: investor.commercialTags },
        verificationStatus: 'VERIFIED',
        approvalStatus: 'VERIFIED',
        matchingEligible: true,
        featured: investor.featured,
        profileVersion: { increment: 1 },
        normalizedProfile: {
          about: investor.about,
          focusEvents: investor.focusEvents,
          regions: investor.regions,
          responses: {
            industry: investor.industry,
            organization_summary: investor.about,
            focus_events: investor.focusEvents,
            categories: investor.preferredCategories,
            capabilities: investor.requiredCapabilities,
            regions: investor.regions,
            commercialTags: investor.commercialTags,
            partnership_goal: investor.partnershipGoal,
            ticket_size: investor.ticketSize,
            investment_stages: investor.investmentStages,
          },
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
        title: investor.title,
      },
      update: { isPrimary: true, title: investor.title },
    });

    await prisma.formAssignment.create({
      data: {
        formId: onboardingForm.form.id,
        formVersionId: onboardingForm.versionId,
        organizationId: org.id,
        userId: user.id,
        isRequired: true,
      },
    }).catch(() => undefined);

    const responseData = {
      contact_name: `${investor.firstName} ${investor.lastName}`,
      job_title: investor.title,
      phone: phoneFor(investor.country, investorOrgs.length),
      linkedin_url: investor.website,
      country: investor.country,
      role_category: 'investor',
      industry: schedulingIndustry(investor.industry),
      visit_purpose: 'to_find_innovators',
      organization_summary: investor.about,
      focus_events: investor.focusEvents,
      categories: firstOf(investor.preferredCategories, 'digital-water'),
      capabilities: firstOf(investor.requiredCapabilities, 'data-ai'),
      regions: firstOf(investor.regions, 'mena'),
      commercial_tags: firstOf(investor.commercialTags, 'equity'),
      commercialTags: investor.commercialTags,
      contact_phone: phoneFor(investor.country, investorOrgs.length),
      partnership_goal: investor.partnershipGoal,
      ticket_size: normalizeTicket(investor.ticketSize),
      investment_stages: firstOf(investor.investmentStages, 'early-revenue'),
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

    investorOrgs.push({ orgId: org.id, userId: user.id, def: investor });
  }

  // ── Home tables: one Coca Cola Arena table per investor ───────────────────
  const assigner =
    (await prisma.user.findFirst({
      where: {
        roles: { some: { role: { code: { in: ['SUPER_ADMIN', 'ADMIN'] } } } },
      },
      select: { id: true },
    })) ?? { id: investorOrgs[0]!.userId };

  await prisma.investorPlaceAssignment.deleteMany({
    where: { placeId: { in: Object.values(placeIds) } },
  });

  for (let i = 0; i < investorOrgs.length; i++) {
    const investor = investorOrgs[i]!;
    const placeId = placeIds[tableCodeForInvestor(i)];
    if (!placeId) continue;
    for (const date of eventDates) {
      const { startsAt, endsAt } = allDayWindow(date);
      await prisma.investorPlaceAssignment.create({
        data: {
          organizationId: investor.orgId,
          placeId,
          startsAt,
          endsAt,
          allDay: true,
          note: `Home table at ${ARENA_LOCATION}`,
          createdById: assigner.id,
        },
      });
    }
  }

  // ── Innovators ───────────────────────────────────────────────────────────────
  for (const innovator of GUESTS) {
    const user = await upsertSampleUser({
      email: innovator.email,
      firstName: innovator.firstName,
      lastName: innovator.lastName,
      roleId: vendorRole.id,
    });

    const org = await prisma.organization.upsert({
      where: { code: innovator.code },
      create: {
        code: innovator.code,
        name: innovator.name,
        type: 'VENDOR',
        status: 'APPROVED',
        industry: innovator.industry,
        region: innovator.region,
        country: innovator.country,
        website: innovator.website,
        timeZone: 'Asia/Dubai',
        customAttrs: {
          contactEmail: innovator.email,
          contactName: `${innovator.firstName} ${innovator.lastName}`,
          about: innovator.about,
          focusEvents: innovator.focusEvents,
        },
      },
      update: {
        name: innovator.name,
        status: 'APPROVED',
        industry: innovator.industry,
        region: innovator.region,
        country: innovator.country,
        website: innovator.website,
        archivedAt: null,
        customAttrs: {
          contactEmail: innovator.email,
          contactName: `${innovator.firstName} ${innovator.lastName}`,
          about: innovator.about,
          focusEvents: innovator.focusEvents,
        },
      },
    });

    await prisma.vendor.upsert({
      where: { organizationId: org.id },
      create: {
        organizationId: org.id,
        displayName: innovator.displayName,
        categories: innovator.categories,
        capabilities: innovator.capabilities,
        services: innovator.capabilities,
        operatingRegions: innovator.operatingRegions,
        commercialPrefs: { tags: innovator.commercialTags },
        verificationStatus: 'VERIFIED',
        approvalStatus: 'VERIFIED',
        onboardingComplete: true,
        matchingEligible: true,
        featured: innovator.featured,
        normalizedProfile: {
          about: innovator.about,
          focusEvents: innovator.focusEvents,
          responses: {
            industry: innovator.industry,
            organization_summary: innovator.about,
            focus_events: innovator.focusEvents,
            categories: innovator.categories,
            capabilities: innovator.capabilities,
            regions: innovator.operatingRegions,
            commercialTags: innovator.commercialTags,
            partnership_goal: innovator.partnershipGoal,
            ticket_size: innovator.ticketSize,
            investment_stages: innovator.stage,
            impact_metrics: innovator.impactMetrics,
          },
        },
      },
      update: {
        displayName: innovator.displayName,
        categories: innovator.categories,
        capabilities: innovator.capabilities,
        services: innovator.capabilities,
        operatingRegions: innovator.operatingRegions,
        commercialPrefs: { tags: innovator.commercialTags },
        verificationStatus: 'VERIFIED',
        approvalStatus: 'VERIFIED',
        onboardingComplete: true,
        matchingEligible: true,
        featured: innovator.featured,
        profileVersion: { increment: 1 },
        normalizedProfile: {
          about: innovator.about,
          focusEvents: innovator.focusEvents,
          responses: {
            industry: innovator.industry,
            organization_summary: innovator.about,
            focus_events: innovator.focusEvents,
            categories: innovator.categories,
            capabilities: innovator.capabilities,
            regions: innovator.operatingRegions,
            commercialTags: innovator.commercialTags,
            partnership_goal: innovator.partnershipGoal,
            ticket_size: innovator.ticketSize,
            investment_stages: innovator.stage,
            impact_metrics: innovator.impactMetrics,
          },
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
        title: innovator.title,
      },
      update: { isPrimary: true, title: innovator.title },
    });

    await prisma.formAssignment.create({
      data: {
        formId: innovatorOnboardingForm.form.id,
        formVersionId: innovatorOnboardingForm.versionId,
        organizationId: org.id,
        userId: user.id,
        isRequired: true,
      },
    });

    const responseData = {
      contact_name: `${innovator.firstName} ${innovator.lastName}`,
      job_title: innovator.title,
      phone: phoneFor(innovator.country, innovatorOrgs.length + 20),
      linkedin_url: innovator.website,
      country: innovator.country,
      role_category: 'founder',
      industry: schedulingIndustry(innovator.industry),
      visit_purpose: 'to_meet_investors',
      organization_summary: innovator.about,
      focus_events: innovator.focusEvents,
      categories: firstOf(innovator.categories, 'digital-water'),
      capabilities: firstOf(innovator.capabilities, 'data-ai'),
      regions: firstOf(innovator.operatingRegions, 'global'),
      commercial_tags: firstOf(innovator.commercialTags, 'equity'),
      commercialTags: innovator.commercialTags,
      ticket_size: normalizeTicket(innovator.ticketSize),
      investment_stages: innovator.stage,
      impact_metrics: innovator.impactMetrics,
      partnership_goal: innovator.partnershipGoal,
    };

    await prisma.formSubmission.create({
      data: {
        formVersionId: innovatorOnboardingForm.versionId,
        organizationId: org.id,
        submittedById: user.id,
        status: 'APPROVED',
        submittedAt: new Date(),
        reviewedAt: new Date(),
        reviewNotes: 'Verified — profile complete for matchmaking',
        responses: responsesFor(
          innovatorOnboardingForm.fields,
          responseData,
        ) as Prisma.InputJsonValue,
      },
    });

    innovatorOrgs.push({ orgId: org.id, userId: user.id, def: innovator });
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
    status:
      | 'CONFIRMED'
      | 'AWAITING_CONFIRMATION'
      | 'COMPLETED'
      | 'PROPOSED'
      | 'IN_PROGRESS'
      | 'NO_SHOW';
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

  // 1) Confirmed meeting @ investor 1 home table (Coca Cola Arena)
  {
    const startsAt = daysFromNow(5, 11, 0);
    const meeting = await createMeeting({
      companyOrgId: investorOrgs[0]!.orgId,
      vendorOrgId: innovatorOrgs[0]!.orgId,
      startsAt,
      durationMinutes: 45,
      placeId: placeIds[tableCodeForInvestor(0)]!,
      status: 'CONFIRMED',
      objectives:
        'Discuss NRW reduction pilots and utility offtake for leak-detection systems.',
      score: 92,
    });
    await prisma.meetingRequest.create({
      data: {
        fromOrgId: investorOrgs[0]!.orgId,
        toOrgId: innovatorOrgs[0]!.orgId,
        requestedById: investorOrgs[0]!.userId,
        status: 'SCHEDULED',
        message:
          'Interested in piloting leak detection with Gulf utilities this year.',
        proposedStartsAt: startsAt,
        proposedEndsAt: meeting.endsAt,
        proposedByOrgId: investorOrgs[0]!.orgId,
        placeId: placeIds[tableCodeForInvestor(0)]!,
        meetingId: meeting.id,
      },
    });
    await prisma.meetingConfirmation.createMany({
      data: [
        {
          meetingId: meeting.id,
          userId: investorOrgs[0]!.userId,
          status: 'CONFIRMED',
          respondedAt: new Date(),
        },
        {
          meetingId: meeting.id,
          userId: innovatorOrgs[0]!.userId,
          status: 'CONFIRMED',
          respondedAt: new Date(),
        },
      ],
    });
  }

  // 2) Completed meeting + feedback @ investor 2 home table
  {
    const startsAt = daysFromNow(-2, 10, 0);
    const meeting = await createMeeting({
      companyOrgId: investorOrgs[1]!.orgId,
      vendorOrgId: innovatorOrgs[1]!.orgId,
      startsAt,
      durationMinutes: 30,
      placeId: placeIds[tableCodeForInvestor(1)]!,
      status: 'COMPLETED',
      objectives:
        'Review wastewater reuse economics for irrigation projects in the Sahel.',
      score: 88,
    });
    await prisma.meetingRequest.create({
      data: {
        fromOrgId: investorOrgs[1]!.orgId,
        toOrgId: innovatorOrgs[1]!.orgId,
        requestedById: investorOrgs[1]!.userId,
        status: 'SCHEDULED',
        message: 'Need bankable reuse plants with municipal offtake.',
        proposedStartsAt: startsAt,
        proposedEndsAt: meeting.endsAt,
        proposedByOrgId: innovatorOrgs[1]!.orgId,
        placeId: placeIds[tableCodeForInvestor(1)]!,
        meetingId: meeting.id,
      },
    });
    await prisma.meetingFeedback.create({
      data: {
        meetingId: meeting.id,
        organizationId: investorOrgs[1]!.orgId,
        reviewerUserId: investorOrgs[1]!.userId,
        attendanceConfirmed: true,
        meetingQuality: 5,
        relevance: 5,
        businessPotential: 4,
        communicationQuality: 5,
        interestLevel: 5,
        followUpRequired: true,
        outcome: 'FOLLOW_UP_REQUIRED',
        comments:
          'Strong alignment on reuse economics; follow up on Sahel municipal offtake term sheet.',
        isConfidential: true,
      },
    });
  }

  // 3) Awaiting confirmation @ investor 3 home table
  {
    const startsAt = daysFromNow(8, 14, 30);
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
    const meeting = await createMeeting({
      companyOrgId: investorOrgs[2]!.orgId,
      vendorOrgId: innovatorOrgs[2]!.orgId,
      startsAt,
      durationMinutes: 30,
      placeId: placeIds[tableCodeForInvestor(2)]!,
      status: 'AWAITING_CONFIRMATION',
      objectives:
        'Discuss modular desal deployment for remote communities in Jordan and UAE.',
      score: 81,
    });
    await prisma.meetingRequest.create({
      data: {
        fromOrgId: investorOrgs[2]!.orgId,
        toOrgId: innovatorOrgs[2]!.orgId,
        requestedById: investorOrgs[2]!.userId,
        status: 'AWAITING_CONFIRMATION',
        message:
          'Interested in co-financing a three-site solar desal bundle with your EPC partners.',
        proposedStartsAt: startsAt,
        proposedEndsAt: endsAt,
        proposedByOrgId: investorOrgs[2]!.orgId,
        placeId: placeIds[tableCodeForInvestor(2)]!,
        meetingId: meeting.id,
      },
    });
  }

  // 4) Awaiting confirmation @ investor 1 home table
  {
    const startsAt = daysFromNow(9, 17, 0);
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
    await prisma.meetingRequest.create({
      data: {
        fromOrgId: investorOrgs[0]!.orgId,
        toOrgId: innovatorOrgs[1]!.orgId,
        requestedById: investorOrgs[0]!.userId,
        status: 'AWAITING_CONFIRMATION',
        message:
          'Exploring blended finance for Sahel reuse scale-up after our NRW pilot learnings.',
        proposedStartsAt: startsAt,
        proposedEndsAt: endsAt,
        proposedByOrgId: investorOrgs[0]!.orgId,
        placeId: placeIds[tableCodeForInvestor(0)]!,
      },
    });
  }

  // 5) Awaiting confirmation @ investor 2 home table
  {
    const startsAt = daysFromNow(12, 15, 0);
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
    await prisma.meetingRequest.create({
      data: {
        fromOrgId: investorOrgs[1]!.orgId,
        toOrgId: innovatorOrgs[0]!.orgId,
        requestedById: investorOrgs[1]!.userId,
        status: 'AWAITING_CONFIRMATION',
        message:
          'Follow-up on smart metering tender — would like a joint utility intro in the Gulf.',
        proposedStartsAt: startsAt,
        proposedEndsAt: endsAt,
        proposedByOrgId: investorOrgs[1]!.orgId,
        placeId: placeIds[tableCodeForInvestor(1)]!,
      },
    });
  }

  // 6) Extra confirmed calendar meeting @ investor 3 home table
  await createMeeting({
    companyOrgId: investorOrgs[2]!.orgId,
    vendorOrgId: innovatorOrgs[0]!.orgId,
    startsAt: daysFromNow(3, 13, 0),
    durationMinutes: 30,
    placeId: placeIds[tableCodeForInvestor(2)]!,
    status: 'CONFIRMED',
    objectives:
      'Explore nature-based watershed program co-investment in West Africa.',
    score: 74,
  });

  // 7–12) Today's floor pulse: each meeting on that investor's home table
  const todayMeetings: Array<{
    investor: number;
    innovator: number;
    hour: number;
    minute: number;
    status: 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'NO_SHOW';
    score: number;
    quality?: number;
    outcome?: 'SUCCESSFUL_DISCUSSION' | 'INTERESTED_IN_PARTNERSHIP' | 'NOT_A_FIT';
  }> = [
    {
      investor: 0,
      innovator: 3,
      hour: 9,
      minute: 0,
      status: 'COMPLETED',
      score: 86,
      quality: 5,
      outcome: 'SUCCESSFUL_DISCUSSION',
    },
    {
      investor: 1,
      innovator: 4,
      hour: 10,
      minute: 0,
      status: 'COMPLETED',
      score: 79,
      quality: 4,
      outcome: 'INTERESTED_IN_PARTNERSHIP',
    },
    {
      investor: 3,
      innovator: 6,
      hour: 11,
      minute: 0,
      status: 'NO_SHOW',
      score: 68,
    },
    {
      investor: 0,
      innovator: 0,
      hour: 12,
      minute: 0,
      status: 'IN_PROGRESS',
      score: 91,
    },
    {
      investor: 2,
      innovator: 1,
      hour: 15,
      minute: 0,
      status: 'CONFIRMED',
      score: 77,
    },
    {
      investor: 4,
      innovator: 11,
      hour: 16,
      minute: 30,
      status: 'CONFIRMED',
      score: 73,
    },
  ];

  for (const row of todayMeetings) {
    const startsAt = daysFromNow(0, row.hour, row.minute);
    const meeting = await createMeeting({
      companyOrgId: investorOrgs[row.investor]!.orgId,
      vendorOrgId: innovatorOrgs[row.innovator]!.orgId,
      startsAt,
      durationMinutes: 30,
      placeId: placeIds[tableCodeForInvestor(row.investor)]!,
      status: row.status,
      objectives: 'On-site investor / innovator session.',
      score: row.score,
    });
    if (row.quality && row.outcome) {
      await prisma.meetingFeedback.create({
        data: {
          meetingId: meeting.id,
          organizationId: investorOrgs[row.investor]!.orgId,
          reviewerUserId: investorOrgs[row.investor]!.userId,
          attendanceConfirmed: true,
          meetingQuality: row.quality,
          relevance: row.quality,
          businessPotential: Math.max(3, row.quality - 1),
          communicationQuality: row.quality,
          interestLevel: row.quality,
          followUpRequired: row.outcome === 'INTERESTED_IN_PARTNERSHIP',
          outcome: row.outcome,
          comments: 'Recorded from the event floor.',
          isConfidential: false,
        },
      });
    }
  }

  console.log(`
UN Water demo roster seeded (${CLIENTS.length} investors, ${GUESTS.length} innovators)

Password for all demo users: ${SAMPLE_PASSWORD}

Venue: ${ARENA_LOCATION} — ${TABLE_COUNT} tables (CCA_T01…CCA_T${String(TABLE_COUNT).padStart(2, '0')}), one per investor.

Suggested strong match pair (NRW / digital water):
  Investor: ${CLIENTS[1]!.email}  /  ${SAMPLE_PASSWORD}
  Innovator:  ${GUESTS[0]!.email}  /  ${SAMPLE_PASSWORD}

All accounts are verified with completed onboarding forms.

Investors (${CLIENTS.length}):
${CLIENTS.map((c, i) => `  ${i + 1}) ${c.email}  — ${c.name}  @ Table ${i + 1}`).join('\n')}

Innovators (${GUESTS.length}):
${GUESTS.map((g, i) => `  ${i + 1}) ${g.email}  — ${g.name}`).join('\n')}
`);
}
