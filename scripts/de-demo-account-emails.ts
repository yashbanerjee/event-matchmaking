/**
 * Remap seeded account emails from legacy *.demo / sample domains onto each
 * organisation's real website domain, and scrub visible "demo" copy in profiles.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import {
  WATER_DEMO_INNOVATORS,
  WATER_DEMO_INVESTORS,
} from '../prisma/water-demo-profiles';

const prisma = new PrismaClient();

const LEGACY_SUFFIXES = [
  '@unwater.ethara.demo',
  '@ethara-demo.com',
  '@ethara-sample.ae',
];

function scrubText(value: string): string {
  return value
    .replace(/\bdemo requested\b/gi, 'pilot requested')
    .replace(/\bauthority demo\b/gi, 'authority pilot')
    .replace(/\breuse demo\b/gi, 'reuse plant')
    .replace(/\bstormwater demo\b/gi, 'stormwater pilot')
    .replace(/\bcity demo\b/gi, 'city pilot');
}

async function rematerialize(
  code: string,
  email: string,
  website: string,
  about?: string,
  focusEvents?: string,
  partnershipGoal?: string,
) {
  const org = await prisma.organization.findFirst({
    where: { code },
    include: {
      members: { include: { user: true }, take: 5 },
    },
  });
  if (!org) {
    console.warn('missing org', code);
    return;
  }

  const attrs =
    org.customAttrs && typeof org.customAttrs === 'object'
      ? { ...(org.customAttrs as Record<string, unknown>) }
      : {};
  attrs.contactEmail = email;
  if (typeof about === 'string') attrs.about = scrubText(about);
  if (typeof focusEvents === 'string') attrs.focusEvents = scrubText(focusEvents);

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      website,
      customAttrs: attrs as Prisma.InputJsonValue,
    },
  });

  for (const member of org.members) {
    const user = member.user;
    const shouldUpdate =
      user.email !== email ||
      LEGACY_SUFFIXES.some((suffix) => user.email.endsWith(suffix));
    if (!shouldUpdate && user.email === email) continue;
    // Avoid unique collisions if another user already holds the target email.
    const clash = await prisma.user.findUnique({ where: { email } });
    if (clash && clash.id !== user.id) {
      console.warn('email clash', code, email, 'keeping', user.email);
      continue;
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { email },
    });
    console.log(code, user.email, '->', email);
  }

  const company = await prisma.company.findUnique({
    where: { organizationId: org.id },
  });
  if (company) {
    const np = (company.normalizedProfile ?? {}) as Record<string, unknown>;
    const responses = {
      ...((np.responses ?? {}) as Record<string, unknown>),
    };
    if (typeof about === 'string') {
      np.about = scrubText(about);
      responses.organization_summary = scrubText(about);
    }
    if (typeof focusEvents === 'string') {
      np.focusEvents = scrubText(focusEvents);
      responses.focus_events = scrubText(focusEvents);
    }
    if (typeof partnershipGoal === 'string') {
      np.partnershipGoal = scrubText(partnershipGoal);
      responses.partnership_goal = scrubText(partnershipGoal);
    }
    await prisma.company.update({
      where: { organizationId: org.id },
      data: {
        normalizedProfile: { ...np, responses } as Prisma.InputJsonValue,
      },
    });
  }

  const vendor = await prisma.vendor.findUnique({
    where: { organizationId: org.id },
  });
  if (vendor) {
    const np = (vendor.normalizedProfile ?? {}) as Record<string, unknown>;
    const responses = {
      ...((np.responses ?? {}) as Record<string, unknown>),
    };
    if (typeof about === 'string') {
      np.about = scrubText(about);
      responses.organization_summary = scrubText(about);
    }
    if (typeof focusEvents === 'string') {
      np.focusEvents = scrubText(focusEvents);
      responses.focus_events = scrubText(focusEvents);
    }
    if (typeof partnershipGoal === 'string') {
      np.partnershipGoal = scrubText(partnershipGoal);
      responses.partnership_goal = scrubText(partnershipGoal);
    }
    await prisma.vendor.update({
      where: { organizationId: org.id },
      data: {
        normalizedProfile: { ...np, responses } as Prisma.InputJsonValue,
      },
    });
  }

  const submissions = await prisma.formSubmission.findMany({
    where: { organizationId: org.id },
  });
  for (const submission of submissions) {
    const responses = {
      ...(submission.responses as Record<string, unknown>),
    };
    let changed = false;
    for (const [key, value] of Object.entries(responses)) {
      if (typeof value === 'string') {
        const next = scrubText(value);
        if (next !== value) {
          responses[key] = next;
          changed = true;
        }
      }
    }
    if (changed) {
      await prisma.formSubmission.update({
        where: { id: submission.id },
        data: { responses: responses as Prisma.InputJsonValue },
      });
    }
  }
}

async function main() {
  for (const investor of WATER_DEMO_INVESTORS) {
    await rematerialize(
      investor.code,
      investor.email,
      investor.website,
      investor.about,
      investor.focusEvents,
      investor.partnershipGoal,
    );
  }
  for (const innovator of WATER_DEMO_INNOVATORS) {
    await rematerialize(
      innovator.code,
      innovator.email,
      innovator.website,
      innovator.about,
      innovator.focusEvents,
      innovator.partnershipGoal,
    );
  }

  // Any leftover users still on legacy demo domains.
  const leftovers = await prisma.user.findMany({
    where: {
      OR: LEGACY_SUFFIXES.map((suffix) => ({
        email: { endsWith: suffix },
      })),
    },
    select: { id: true, email: true },
  });
  console.log('legacy-domain users remaining', leftovers.length);
  for (const row of leftovers) console.log(' leftover', row.email);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
