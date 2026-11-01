/**
 * Upsert 20 Coca Cola Arena tables and assign one to each investor org
 * for the configured event dates. Does not wipe the roster.
 *
 *   npx tsx prisma/assign-coca-cola-tables.ts
 */
import { PrismaClient } from '@prisma/client';
import { WATER_DEMO_INVESTORS } from './water-demo-profiles';

const prisma = new PrismaClient();

const ARENA_LOCATION = 'Coca Cola Arena';
const TABLE_COUNT = 20;

function tableCode(n: number) {
  return `CCA_T${String(n).padStart(2, '0')}`;
}

function allDayWindow(date: string) {
  const startsAt = new Date(`${date}T00:00:00+04:00`);
  const endsAt = new Date(startsAt.getTime() + 24 * 60 * 60 * 1000);
  return { startsAt, endsAt };
}

async function main() {
  const eventDatesSetting = await prisma.systemSetting.findUnique({
    where: { key: 'ops.eventDates' },
  });
  const raw =
    eventDatesSetting &&
    typeof eventDatesSetting.value === 'object' &&
    eventDatesSetting.value !== null &&
    'value' in eventDatesSetting.value
      ? String((eventDatesSetting.value as { value: unknown }).value)
      : '2026-11-02,2026-11-03,2026-11-04';
  const eventDates = raw
    .split(',')
    .map((d) => d.trim())
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));

  if (!eventDates.length) {
    throw new Error('No event dates configured (ops.eventDates)');
  }

  const placeIds: string[] = [];
  for (let n = 1; n <= TABLE_COUNT; n++) {
    const code = tableCode(n);
    const row = await prisma.place.upsert({
      where: { code },
      create: {
        code,
        name: `Table ${n}`,
        location: ARENA_LOCATION,
        capacity: 4,
        description: `Investor home table ${n} at ${ARENA_LOCATION}.`,
        isActive: true,
      },
      update: {
        name: `Table ${n}`,
        location: ARENA_LOCATION,
        capacity: 4,
        description: `Investor home table ${n} at ${ARENA_LOCATION}.`,
        isActive: true,
      },
    });
    placeIds.push(row.id);
  }

  await prisma.place.updateMany({
    where: { code: { notIn: placeIds.map((_, i) => tableCode(i + 1)) } },
    data: { isActive: false },
  });

  const investorByCode = new Map(
    (
      await prisma.organization.findMany({
        where: { type: 'COMPANY', archivedAt: null },
        select: { id: true, code: true, name: true },
      })
    ).map((org) => [org.code, org]),
  );

  const investors = WATER_DEMO_INVESTORS.map((def) => investorByCode.get(def.code)).filter(
    (org): org is { id: string; code: string; name: string } => Boolean(org),
  );

  if (investors.length < TABLE_COUNT) {
    console.warn(
      `Found ${investors.length} investors from demo roster; expected ${TABLE_COUNT}. Assigning tables 1..${investors.length}.`,
    );
  }

  const assigner = await prisma.user.findFirst({
    where: {
      roles: { some: { role: { code: { in: ['SUPER_ADMIN', 'ADMIN'] } } } },
    },
    select: { id: true },
  });
  if (!assigner) {
    throw new Error('No admin user found to record as assignment creator');
  }

  await prisma.investorPlaceAssignment.deleteMany({
    where: { placeId: { in: placeIds } },
  });

  const assigned: string[] = [];
  for (let i = 0; i < Math.min(investors.length, TABLE_COUNT); i++) {
    const investor = investors[i]!;
    const placeId = placeIds[i]!;
    for (const date of eventDates) {
      const { startsAt, endsAt } = allDayWindow(date);
      await prisma.investorPlaceAssignment.create({
        data: {
          organizationId: investor.id,
          placeId,
          startsAt,
          endsAt,
          allDay: true,
          note: `Home table at ${ARENA_LOCATION}`,
          createdById: assigner.id,
        },
      });
    }
    assigned.push(
      `${tableCode(i + 1)} → ${investor.code} (${investor.name})`,
    );
  }

  console.log(`
Coca Cola Arena ready
  Location: ${ARENA_LOCATION}
  Tables:   ${TABLE_COUNT} (CCA_T01 … CCA_T${String(TABLE_COUNT).padStart(2, '0')})
  Event:    ${eventDates.join(', ')}
  Assigned: ${assigned.length} investor home tables

${assigned.map((line) => `  ${line}`).join('\n')}
`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
