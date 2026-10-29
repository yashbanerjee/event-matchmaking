import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function isDemoOrg(org) {
  const attrs =
    org.customAttrs && typeof org.customAttrs === 'object'
      ? org.customAttrs
      : {};
  if (attrs.demo === true) return true;
  if (org.code === 'ACME' || org.code === 'PRECIS') return true;
  if (/^CMP\d{2}_/.test(org.code) || /^VND\d{3}$/.test(org.code)) return true;
  if (typeof org.website === 'string' && org.website.includes('.example')) {
    return true;
  }
  const email = typeof attrs.contactEmail === 'string' ? attrs.contactEmail : '';
  if (email.endsWith('.example') || email.endsWith('@example.com')) return true;
  return false;
}

async function main() {
  const orgs = await prisma.organization.findMany({
    where: {
      status: { not: 'ARCHIVED' },
      type: { in: ['COMPANY', 'VENDOR'] },
    },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      website: true,
      customAttrs: true,
    },
  });

  const demo = orgs.filter(isDemoOrg);
  const kept = orgs.filter((o) => !isDemoOrg(o));

  console.log(
    JSON.stringify(
      {
        totalActive: orgs.length,
        demoCount: demo.length,
        kept: kept.map((o) => ({ code: o.code, name: o.name, type: o.type })),
        demoSample: demo.slice(0, 10).map((o) => ({
          code: o.code,
          name: o.name,
          type: o.type,
        })),
      },
      null,
      2,
    ),
  );

  if (!demo.length) {
    console.log('No demo organizations to archive.');
    return;
  }

  const result = await prisma.organization.updateMany({
    where: { id: { in: demo.map((o) => o.id) } },
    data: { status: 'ARCHIVED', archivedAt: new Date() },
  });

  console.log(`Archived ${result.count} demo organizations.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
