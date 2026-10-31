import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_PASSWORD_NOTE = 'Uses orgs already in the database.';

async function main() {
  const now = new Date();
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);

  const at = (hour: number, minute = 0) => {
    const d = new Date(day);
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  const investors = await prisma.organization.findMany({
    where: { type: 'COMPANY', status: { not: 'ARCHIVED' } },
    include: { members: { take: 1, select: { userId: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const innovators = await prisma.organization.findMany({
    where: { type: 'VENDOR', status: { not: 'ARCHIVED' } },
    orderBy: { createdAt: 'asc' },
  });
  const places = await prisma.place.findMany({ take: 6 });

  if (investors.length < 3 || innovators.length < 3 || places.length < 1) {
    throw new Error('Need seeded investors, innovators, and places first.');
  }

  const rows = [
    { i: 0, v: 0, hour: 9, status: 'COMPLETED' as const, quality: 5 },
    { i: 1, v: 1, hour: 10, status: 'COMPLETED' as const, quality: 4 },
    { i: 2, v: 2, hour: 11, status: 'NO_SHOW' as const },
    { i: 0, v: 1, hour: 12, status: 'IN_PROGRESS' as const },
    { i: 1, v: 0, hour: 15, status: 'CONFIRMED' as const },
    { i: 2, v: 0, hour: 16, status: 'CONFIRMED' as const },
  ];

  for (const row of rows) {
    const investor = investors[row.i % investors.length]!;
    const innovator = innovators[row.v % innovators.length]!;
    const place = places[row.hour % places.length]!;
    const startsAt = at(row.hour);
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
    const key = `ethara-pulse:${investor.id}:${innovator.id}:${startsAt.toISOString()}`;

    const meeting = await prisma.meeting.upsert({
      where: { idempotencyKey: key },
      create: {
        companyOrgId: investor.id,
        vendorOrgId: innovator.id,
        startsAt,
        endsAt,
        durationMinutes: 30,
        placeId: place.id,
        mode: 'IN_PERSON',
        status: row.status,
        objectives: 'On-site investor / innovator session.',
        matchScore: 80,
        timeZone: 'Asia/Dubai',
        idempotencyKey: key,
      },
      update: { status: row.status },
    });

    const reviewerId = investor.members[0]?.userId;
    if (row.quality && reviewerId) {
      await prisma.meetingFeedback.upsert({
        where: {
          meetingId_organizationId: {
            meetingId: meeting.id,
            organizationId: investor.id,
          },
        },
        create: {
          meetingId: meeting.id,
          organizationId: investor.id,
          reviewerUserId: reviewerId,
          attendanceConfirmed: true,
          meetingQuality: row.quality,
          relevance: row.quality,
          businessPotential: row.quality,
          communicationQuality: row.quality,
          interestLevel: row.quality,
          followUpRequired: row.quality < 5,
          outcome:
            row.quality >= 5
              ? 'SUCCESSFUL_DISCUSSION'
              : 'INTERESTED_IN_PARTNERSHIP',
          comments: 'Recorded from the event floor.',
          isConfidential: false,
        },
        update: {},
      });
    }
  }

  console.log(`Today's pulse meetings are ready. ${DEFAULT_PASSWORD_NOTE}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
