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
  const eventDates = ['2026-11-02', '2026-11-03', '2026-11-04'];
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

  // ── Meetings on admin event dates only (20 across the 3 days) ─────────────
  const meetingDurationMinutes = 15;
  const eventDateTime = (date: string, hour: number, minute: number) => {
    const hh = String(hour).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    return new Date(`${date}T${hh}:${mm}:00+04:00`);
  };

  async function createMeeting(input: {
    companyOrgId: string;
    vendorOrgId: string;
    startsAt: Date;
    durationMinutes: number;
    placeId: string;
    status: 'CONFIRMED' | 'AWAITING_CONFIRMATION';
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

  /**
   * Exactly 20 meetings inside ops.eventDates / active hours (09:00–17:00 GST).
   * Day 1: 7 · Day 2: 7 · Day 3: 6. One home-table slot per investor where possible.
   */
  const seededMeetings: Array<{
    dayIndex: number;
    hour: number;
    minute: number;
    investor: number;
    innovator: number;
    status: 'CONFIRMED' | 'AWAITING_CONFIRMATION';
    score: number;
    objectives: string;
    message: string;
  }> = [
    // ── 2026-11-02 (7) ──
    {
      dayIndex: 0,
      hour: 9,
      minute: 0,
      investor: 0,
      innovator: 0,
      status: 'CONFIRMED',
      score: 92,
      objectives:
        'Discuss NRW reduction pilots and utility offtake for leak-detection systems.',
      message:
        'Interested in piloting leak detection with Gulf utilities this year.',
    },
    {
      dayIndex: 0,
      hour: 9,
      minute: 30,
      investor: 1,
      innovator: 1,
      status: 'CONFIRMED',
      score: 88,
      objectives:
        'Review wastewater reuse economics for irrigation projects in the Sahel.',
      message: 'Need bankable reuse plants with municipal offtake.',
    },
    {
      dayIndex: 0,
      hour: 10,
      minute: 0,
      investor: 2,
      innovator: 2,
      status: 'CONFIRMED',
      score: 85,
      objectives:
        'Discuss modular desal deployment for remote communities in Jordan and UAE.',
      message:
        'Interested in co-financing a three-site solar desal bundle with your EPC partners.',
    },
    {
      dayIndex: 0,
      hour: 11,
      minute: 0,
      investor: 3,
      innovator: 3,
      status: 'CONFIRMED',
      score: 84,
      objectives: 'Explore smart metering for municipal NRW programs.',
      message: 'Looking for digital water tools ready for Gulf utilities.',
    },
    {
      dayIndex: 0,
      hour: 13,
      minute: 0,
      investor: 4,
      innovator: 4,
      status: 'CONFIRMED',
      score: 81,
      objectives: 'Watershed protection co-investment for East Africa.',
      message: 'Interested in nature-based catchment programs.',
    },
    {
      dayIndex: 0,
      hour: 14,
      minute: 30,
      investor: 5,
      innovator: 5,
      status: 'AWAITING_CONFIRMATION',
      score: 79,
      objectives: 'Blended finance for school WASH infrastructure.',
      message: 'Exploring grant + equity stack for WASH scale-up.',
    },
    {
      dayIndex: 0,
      hour: 16,
      minute: 0,
      investor: 6,
      innovator: 6,
      status: 'CONFIRMED',
      score: 77,
      objectives: 'Climate-resilient irrigation for Sahel cooperatives.',
      message: 'Want a short intro on irrigation pilots this season.',
    },
    // ── 2026-11-03 (7) ──
    {
      dayIndex: 1,
      hour: 9,
      minute: 0,
      investor: 7,
      innovator: 7,
      status: 'CONFIRMED',
      score: 90,
      objectives: 'Policy platform partnership for transboundary water.',
      message: 'Exploring a policy desk collaboration for MENA.',
    },
    {
      dayIndex: 1,
      hour: 9,
      minute: 45,
      investor: 8,
      innovator: 8,
      status: 'CONFIRMED',
      score: 86,
      objectives: 'Treatment technology pilot for industrial reuse.',
      message: 'Need treatment tech partners for industrial parks.',
    },
    {
      dayIndex: 1,
      hour: 10,
      minute: 30,
      investor: 9,
      innovator: 9,
      status: 'CONFIRMED',
      score: 83,
      objectives: 'Community WASH delivery model diligence.',
      message: 'Diligence session on community WASH unit economics.',
    },
    {
      dayIndex: 1,
      hour: 11,
      minute: 15,
      investor: 10,
      innovator: 10,
      status: 'CONFIRMED',
      score: 82,
      objectives: 'Data / AI tools for utility leakage mapping.',
      message: 'Interested in AI leakage mapping for NRW.',
    },
    {
      dayIndex: 1,
      hour: 13,
      minute: 0,
      investor: 11,
      innovator: 11,
      status: 'AWAITING_CONFIRMATION',
      score: 78,
      objectives: 'Drought resilience program design.',
      message: 'Exploring drought-climate financing instruments.',
    },
    {
      dayIndex: 1,
      hour: 14,
      minute: 30,
      investor: 12,
      innovator: 12,
      status: 'CONFIRMED',
      score: 80,
      objectives: 'Desal + renewables package for coastal cities.',
      message: 'Discuss solar desal package for coastal utilities.',
    },
    {
      dayIndex: 1,
      hour: 16,
      minute: 0,
      investor: 13,
      innovator: 13,
      status: 'CONFIRMED',
      score: 76,
      objectives: 'Sanitation franchise model for secondary cities.',
      message: 'Want to review sanitation franchise unit economics.',
    },
    // ── 2026-11-04 (6) ──
    {
      dayIndex: 2,
      hour: 9,
      minute: 0,
      investor: 14,
      innovator: 14,
      status: 'CONFIRMED',
      score: 87,
      objectives: 'Groundwater monitoring network partnership.',
      message: 'Looking for groundwater monitoring partners.',
    },
    {
      dayIndex: 2,
      hour: 10,
      minute: 0,
      investor: 15,
      innovator: 15,
      status: 'CONFIRMED',
      score: 84,
      objectives: 'Reuse offtake structures for industrial parks.',
      message: 'Need offtake structures for industrial water reuse.',
    },
    {
      dayIndex: 2,
      hour: 11,
      minute: 0,
      investor: 16,
      innovator: 16,
      status: 'AWAITING_CONFIRMATION',
      score: 75,
      objectives: 'Youth-led WASH innovation showcase follow-up.',
      message: 'Follow-up after the youth WASH showcase.',
    },
    {
      dayIndex: 2,
      hour: 13,
      minute: 0,
      investor: 17,
      innovator: 17,
      status: 'CONFIRMED',
      score: 81,
      objectives: 'Flood early-warning systems for river basins.',
      message: 'Discuss flood early-warning deployment partners.',
    },
    {
      dayIndex: 2,
      hour: 14,
      minute: 30,
      investor: 18,
      innovator: 18,
      status: 'CONFIRMED',
      score: 79,
      objectives: 'Circular water economy for industrial clusters.',
      message: 'Interested in circular water for industrial clusters.',
    },
    {
      dayIndex: 2,
      hour: 16,
      minute: 0,
      investor: 19,
      innovator: 19,
      status: 'CONFIRMED',
      score: 74,
      objectives: 'Closing session: regional scale-up opportunities.',
      message: 'Closing conversation on regional scale-up.',
    },
  ];

  if (seededMeetings.length !== 20) {
    throw new Error(
      `Expected 20 seeded meetings, got ${seededMeetings.length}`,
    );
  }

  const meetingsByDay: Record<string, number> = {};
  for (const row of seededMeetings) {
    const date = eventDates[row.dayIndex];
    if (!date) {
      throw new Error(`Missing event date for dayIndex ${row.dayIndex}`);
    }
    if (row.hour < 9 || row.hour > 16 || (row.hour === 16 && row.minute > 45)) {
      throw new Error(
        `Meeting outside active hours 09:00–17:00: ${date} ${row.hour}:${row.minute}`,
      );
    }
    const investor = investorOrgs[row.investor];
    const innovator = innovatorOrgs[row.innovator];
    if (!investor || !innovator) {
      throw new Error(
        `Missing org for investor ${row.investor} / innovator ${row.innovator}`,
      );
    }
    const placeId = placeIds[tableCodeForInvestor(row.investor)];
    if (!placeId) {
      throw new Error(`Missing place for investor index ${row.investor}`);
    }

    const startsAt = eventDateTime(date, row.hour, row.minute);
    const meeting = await createMeeting({
      companyOrgId: investor.orgId,
      vendorOrgId: innovator.orgId,
      startsAt,
      durationMinutes: meetingDurationMinutes,
      placeId,
      status: row.status,
      objectives: row.objectives,
      score: row.score,
    });

    await prisma.meetingRequest.create({
      data: {
        fromOrgId: investor.orgId,
        toOrgId: innovator.orgId,
        requestedById: investor.userId,
        status:
          row.status === 'CONFIRMED' ? 'SCHEDULED' : 'AWAITING_CONFIRMATION',
        message: row.message,
        proposedStartsAt: startsAt,
        proposedEndsAt: meeting.endsAt,
        proposedByOrgId: investor.orgId,
        placeId,
        meetingId: meeting.id,
      },
    });

    if (row.status === 'CONFIRMED') {
      await prisma.meetingConfirmation.createMany({
        data: [
          {
            meetingId: meeting.id,
            userId: investor.userId,
            status: 'CONFIRMED',
            respondedAt: new Date(),
          },
          {
            meetingId: meeting.id,
            userId: innovator.userId,
            status: 'CONFIRMED',
            respondedAt: new Date(),
          },
        ],
      });
    }

    meetingsByDay[date] = (meetingsByDay[date] ?? 0) + 1;
  }

  console.log(`
UN Water demo roster seeded (${CLIENTS.length} investors, ${GUESTS.length} innovators)

Password for all demo users: ${SAMPLE_PASSWORD}

Venue: ${ARENA_LOCATION} — ${TABLE_COUNT} tables (CCA_T01…CCA_T${String(TABLE_COUNT).padStart(2, '0')}), one per investor.
Event dates (admin settings): ${eventDates.join(', ')} (09:00–17:00 Asia/Dubai)
Meetings seeded: 20 total — ${eventDates
    .map((d) => `${d}: ${meetingsByDay[d] ?? 0}`)
    .join(' · ')} (${meetingDurationMinutes} min each)

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
