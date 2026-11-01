/**
 * Remap event dates from Dec 7–9 2026 → Nov 2–4 2026 across settings,
 * meetings, requests, table allotments, availability, slots, and matchmaking runs.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DATE_MAP: Record<string, string> = {
  '2026-12-07': '2026-11-02',
  '2026-12-08': '2026-11-03',
  '2026-12-09': '2026-11-04',
};

const NEW_DATES = ['2026-11-02', '2026-11-03', '2026-11-04'];

function dubaiYmd(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

function dubaiParts(instant: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(instant);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? '00';
  return {
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour') === '24' ? '0' : get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
  };
}

function toDubaiInstant(ymd: string, hour: number, minute: number, second = 0) {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  const ss = String(second).padStart(2, '0');
  return new Date(`${ymd}T${hh}:${mm}:${ss}+04:00`);
}

function remapInstant(instant: Date | null | undefined): Date | null {
  if (!instant) return null;
  const parts = dubaiParts(instant);
  const nextYmd = DATE_MAP[parts.ymd];
  if (!nextYmd) return null;
  return toDubaiInstant(nextYmd, parts.hour, parts.minute, parts.second);
}

/** Remap a @db.Date value (UTC midnight of calendar day). */
function remapDateOnly(value: Date | null | undefined): Date | null {
  if (!value) return null;
  const ymd = value.toISOString().slice(0, 10);
  const next = DATE_MAP[ymd];
  if (!next) return null;
  return new Date(`${next}T00:00:00.000Z`);
}

function remapDateString(value: string): string {
  return DATE_MAP[value] ?? value;
}

function rewriteJsonDates(value: unknown): { next: unknown; changed: boolean } {
  const raw = JSON.stringify(value);
  let next = raw;
  for (const [from, to] of Object.entries(DATE_MAP)) {
    next = next.split(from).join(to);
  }
  if (next === raw) return { next: value, changed: false };
  return { next: JSON.parse(next), changed: true };
}

async function upsertSetting(key: string, value: unknown) {
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value: { value } },
    update: { value: { value } },
  });
}

async function main() {
  console.log('Updating ops.eventDates →', NEW_DATES.join(', '));
  await upsertSetting('ops.eventDates', NEW_DATES.join(','));
  await upsertSetting('ops.meetingWindowStart', NEW_DATES[0]);
  await upsertSetting('ops.meetingWindowEnd', NEW_DATES[2]);
  await upsertSetting('ops.eventActiveStart', '09:00');
  await upsertSetting('ops.eventActiveEnd', '17:00');

  let meetingsUpdated = 0;
  const meetings = await prisma.meeting.findMany({
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      actualStartedAt: true,
      actualEndedAt: true,
    },
  });
  for (const meeting of meetings) {
    const startsAt = remapInstant(meeting.startsAt);
    if (!startsAt) continue;
    const endsAt = remapInstant(meeting.endsAt) ?? startsAt;
    const actualStartedAt = remapInstant(meeting.actualStartedAt);
    const actualEndedAt = remapInstant(meeting.actualEndedAt);
    await prisma.meeting.update({
      where: { id: meeting.id },
      data: {
        startsAt,
        endsAt,
        ...(actualStartedAt ? { actualStartedAt } : {}),
        ...(actualEndedAt ? { actualEndedAt } : {}),
      },
    });
    meetingsUpdated += 1;
  }
  console.log(`Meetings remapped: ${meetingsUpdated}`);

  let slotsUpdated = 0;
  const slots = await prisma.meetingSlot.findMany({
    select: { id: true, startsAt: true, endsAt: true },
  });
  for (const slot of slots) {
    const startsAt = remapInstant(slot.startsAt);
    if (!startsAt) continue;
    const endsAt = remapInstant(slot.endsAt) ?? startsAt;
    await prisma.meetingSlot.update({
      where: { id: slot.id },
      data: { startsAt, endsAt },
    });
    slotsUpdated += 1;
  }
  console.log(`Meeting slots remapped: ${slotsUpdated}`);

  let occupancyUpdated = 0;
  const occupancy = await prisma.meetingOccupancy.findMany({
    select: { id: true, startsAt: true, endsAt: true },
  });
  for (const row of occupancy) {
    const startsAt = remapInstant(row.startsAt);
    if (!startsAt) continue;
    const endsAt = remapInstant(row.endsAt) ?? startsAt;
    await prisma.meetingOccupancy.update({
      where: { id: row.id },
      data: { startsAt, endsAt },
    });
    occupancyUpdated += 1;
  }
  console.log(`Meeting occupancy remapped: ${occupancyUpdated}`);

  let requestsUpdated = 0;
  const requests = await prisma.meetingRequest.findMany({
    select: {
      id: true,
      proposedStartsAt: true,
      proposedEndsAt: true,
    },
  });
  for (const request of requests) {
    const proposedStartsAt = remapInstant(request.proposedStartsAt);
    if (!proposedStartsAt) continue;
    const proposedEndsAt =
      remapInstant(request.proposedEndsAt) ?? proposedStartsAt;
    await prisma.meetingRequest.update({
      where: { id: request.id },
      data: { proposedStartsAt, proposedEndsAt },
    });
    requestsUpdated += 1;
  }
  console.log(`Meeting requests remapped: ${requestsUpdated}`);

  let assignmentsUpdated = 0;
  const assignments = await prisma.investorPlaceAssignment.findMany({
    select: { id: true, startsAt: true, endsAt: true },
  });
  for (const row of assignments) {
    const startsAt = remapInstant(row.startsAt);
    if (!startsAt) continue;
    const endsAt = remapInstant(row.endsAt) ?? startsAt;
    await prisma.investorPlaceAssignment.update({
      where: { id: row.id },
      data: { startsAt, endsAt },
    });
    assignmentsUpdated += 1;
  }
  console.log(`Table allotments remapped: ${assignmentsUpdated}`);

  let availabilityUpdated = 0;
  const windows = await prisma.availabilityWindow.findMany({
    select: { id: true, startDate: true, endDate: true },
  });
  for (const row of windows) {
    const startDate = remapDateOnly(row.startDate);
    const endDate = remapDateOnly(row.endDate);
    if (!startDate && !endDate) continue;
    await prisma.availabilityWindow.update({
      where: { id: row.id },
      data: {
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
      },
    });
    availabilityUpdated += 1;
  }
  console.log(`Availability windows remapped: ${availabilityUpdated}`);

  let runsUpdated = 0;
  const runs = await prisma.matchmakingRun.findMany({
    select: { id: true, scheduleDate: true, config: true },
  });
  for (const run of runs) {
    const raw =
      run.scheduleDate instanceof Date
        ? run.scheduleDate.toISOString().slice(0, 10)
        : String(run.scheduleDate).slice(0, 10);
    const next = remapDateString(raw);
    if (!raw || next === raw) {
      const rewritten = rewriteJsonDates(run.config);
      if (rewritten.changed) {
        await prisma.matchmakingRun.update({
          where: { id: run.id },
          data: { config: rewritten.next as object },
        });
        runsUpdated += 1;
      }
      continue;
    }
    const rewritten = rewriteJsonDates(run.config);
    await prisma.matchmakingRun.update({
      where: { id: run.id },
      data: {
        scheduleDate: new Date(`${next}T00:00:00.000Z`),
        ...(rewritten.changed ? { config: rewritten.next as object } : {}),
      },
    });
    runsUpdated += 1;
  }
  console.log(`Matchmaking runs remapped: ${runsUpdated}`);

  let orgsUpdated = 0;
  const orgs = await prisma.organization.findMany({
    select: { id: true, customAttrs: true },
  });
  for (const org of orgs) {
    const rewritten = rewriteJsonDates(org.customAttrs);
    if (!rewritten.changed) continue;
    await prisma.organization.update({
      where: { id: org.id },
      data: { customAttrs: rewritten.next as object },
    });
    orgsUpdated += 1;
  }
  console.log(`Organization customAttrs remapped: ${orgsUpdated}`);

  let submissionsUpdated = 0;
  const submissions = await prisma.formSubmission.findMany({
    select: { id: true, responses: true },
  });
  for (const submission of submissions) {
    const rewritten = rewriteJsonDates(submission.responses);
    if (!rewritten.changed) continue;
    await prisma.formSubmission.update({
      where: { id: submission.id },
      data: { responses: rewritten.next as object },
    });
    submissionsUpdated += 1;
  }
  console.log(`Form submissions remapped: ${submissionsUpdated}`);

  // Sanity: leftover Dec dates in meetings
  const leftover = await prisma.meeting.findMany({
    where: {
      startsAt: {
        gte: new Date('2026-12-06T20:00:00.000Z'),
        lt: new Date('2026-12-10T20:00:00.000Z'),
      },
    },
    select: { id: true, startsAt: true },
  });
  console.log(
    leftover.length
      ? `WARNING: ${leftover.length} meetings still on Dec dates`
      : 'No leftover Dec meetings.',
  );

  const sample = await prisma.meeting.findMany({
    take: 5,
    orderBy: { startsAt: 'asc' },
    select: { startsAt: true, endsAt: true, status: true },
  });
  console.log(
    'Sample meetings (Dubai):',
    sample.map((m) => ({
      starts: dubaiYmd(m.startsAt) + ' ' + dubaiParts(m.startsAt).hour,
      status: m.status,
    })),
  );

  console.log('Done. Event days are now 2026-11-02, 2026-11-03, 2026-11-04.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
