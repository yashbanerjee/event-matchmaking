import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const keys = [
    'ops.eventDates',
    'ops.meetingWindowStart',
    'ops.meetingWindowEnd',
    'ops.eventActiveStart',
    'ops.eventActiveEnd',
    'ops.meetingDurationMinutes',
  ];
  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: keys } },
  });
  const meetings = await prisma.meeting.findMany({
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      status: true,
      durationMinutes: true,
      timeZone: true,
    },
    orderBy: { startsAt: 'asc' },
  });
  const byDay: Record<string, number> = {};
  for (const m of meetings) {
    const d = m.startsAt.toLocaleDateString('en-CA', {
      timeZone: 'Asia/Dubai',
    });
    byDay[d] = (byDay[d] ?? 0) + 1;
  }
  const statuses = meetings.reduce<Record<string, number>>((acc, m) => {
    acc[m.status] = (acc[m.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    JSON.stringify(
      {
        settings: Object.fromEntries(
          settings.map((s) => [s.key, s.value]),
        ),
        totalMeetings: meetings.length,
        byDay,
        statuses,
        first: meetings[0]?.startsAt,
        last: meetings[meetings.length - 1]?.startsAt,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
