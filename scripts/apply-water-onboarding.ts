import { PrismaClient } from '@prisma/client';
import { seedWaterFiltersAndForms } from '../prisma/water-onboarding';

const prisma = new PrismaClient();

async function main() {
  const result = await seedWaterFiltersAndForms(prisma);

  const orgUpdates = [
    {
      code: 'YASALAM',
      name: 'Nile Climate Water Fund',
      industry: 'Development finance institution',
    },
    {
      code: 'GULFGP',
      name: 'Blue Horizon Water Capital',
      industry: 'Venture capital',
    },
    {
      code: 'FAMMOM',
      name: 'Sahara Impact Partners',
      industry: 'Family office',
    },
    {
      code: 'ZIMMERTOUR',
      name: 'Aqualis Leak Systems',
      industry: 'Technology provider',
    },
    {
      code: 'MARINAEXP',
      name: 'SahelReuse Technologies',
      industry: 'Startup / scale-up',
    },
    {
      code: 'RAFENT',
      name: 'Oasis Modular Plants',
      industry: 'Project developer',
    },
  ];

  for (const row of orgUpdates) {
    await prisma.organization.updateMany({
      where: { code: row.code },
      data: { name: row.name, industry: row.industry },
    });
  }

  console.log(
    `Water onboarding ready. Investor form ${result.investorForm.form.id}, innovator form ${result.innovatorForm.form.id}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
