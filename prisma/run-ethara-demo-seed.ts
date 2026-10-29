import { PrismaClient } from '@prisma/client';
import { seedEtharaDemo } from './seed-ethara-demo';

const prisma = new PrismaClient();

seedEtharaDemo(prisma)
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
