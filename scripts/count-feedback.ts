import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.meetingFeedback.count();
  const latest = await prisma.meetingFeedback.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: {
      organization: { select: { name: true, type: true } },
      meeting: {
        select: {
          startsAt: true,
          companyOrg: { select: { name: true } },
          vendorOrg: { select: { name: true } },
        },
      },
    },
  });
  console.log(JSON.stringify({ count, latest }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
