import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { demoCompanies, demoVendors, logoUrlFor } from './demo-orgs';

const prisma = new PrismaClient();

const ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'COMPANY_USER',
  'VENDOR_USER',
  'OPERATIONS_MANAGER',
] as const;

const PERMISSIONS: Record<string, string> = {
  'users:manage': 'Manage users',
  'users:read': 'Read users',
  'admins:manage': 'Manage administrators',
  'orgs:manage': 'Manage organizations',
  'orgs:read': 'Read organizations',
  'invitations:manage': 'Manage invitations',
  'forms:manage': 'Manage forms',
  'forms:read': 'Read forms',
  'submissions:review': 'Review submissions',
  'matching:configure': 'Configure matching',
  'matching:run': 'Run matching',
  'schedule:publish': 'Publish schedules',
  'schedule:override': 'Override schedules',
  'meetings:manage': 'Manage meetings',
  'meetings:read': 'Read meetings',
  'feedback:read_all': 'Read all feedback',
  'feedback:submit': 'Submit feedback',
  'jobs:manage': 'Manage jobs',
  'integrations:manage': 'Manage integrations',
  'audit:read': 'Read audit logs',
  'reports:read': 'Read reports',
  'settings:manage': 'Manage settings',
  'health:read': 'Read health',
};

const ROLE_PERMISSIONS: Record<(typeof ROLES)[number], string[]> = {
  SUPER_ADMIN: Object.keys(PERMISSIONS),
  ADMIN: [
    'users:manage',
    'users:read',
    'orgs:manage',
    'orgs:read',
    'invitations:manage',
    'forms:manage',
    'forms:read',
    'submissions:review',
    'matching:configure',
    'matching:run',
    'schedule:publish',
    'schedule:override',
    'meetings:manage',
    'meetings:read',
    'feedback:read_all',
    'reports:read',
    'health:read',
  ],
  OPERATIONS_MANAGER: [
    'orgs:read',
    'users:read',
    'meetings:manage',
    'meetings:read',
    'schedule:override',
    'jobs:manage',
    'feedback:read_all',
    'reports:read',
    'health:read',
  ],
  COMPANY_USER: ['orgs:read', 'forms:read', 'meetings:read', 'feedback:submit'],
  VENDOR_USER: ['orgs:read', 'forms:read', 'meetings:read', 'feedback:submit'],
};

const defaultMatchingWeights = {
  capability: 0.3,
  industry: 0.2,
  requirements: 0.2,
  geography: 0.1,
  commercial: 0.1,
  mutualPreferences: 0.1,
};

async function main() {
  for (const [code, name] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { code },
      create: { code, name },
      update: { name },
    });
  }

  for (const roleCode of ROLES) {
    const role = await prisma.role.upsert({
      where: { code: roleCode },
      create: {
        code: roleCode,
        name: roleCode.replaceAll('_', ' '),
        isSystem: true,
      },
      update: {},
    });

    for (const permissionCode of ROLE_PERMISSIONS[roleCode]) {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { code: permissionCode },
      });
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });
    }
  }

  const platform = await prisma.organization.upsert({
    where: { code: 'PLATFORM' },
    create: {
      code: 'PLATFORM',
      name: 'Platform Administration',
      type: 'PLATFORM',
      status: 'ACTIVE',
    },
    update: {},
  });

  const adminEmail = process.env.ADMIN_EMAIL ?? 'info@vedha.ae';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'Vedha1002';
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      passwordHash,
      firstName: 'Super',
      lastName: 'Admin',
      status: 'ACTIVE',
    },
    update: { passwordHash, status: 'ACTIVE' },
  });

  const superAdminRole = await prisma.role.findUniqueOrThrow({
    where: { code: 'SUPER_ADMIN' },
  });
  await prisma.userRole.upsert({
    where: {
      userId_roleId: { userId: admin.id, roleId: superAdminRole.id },
    },
    create: { userId: admin.id, roleId: superAdminRole.id },
    update: {},
  });
  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: platform.id,
        userId: admin.id,
      },
    },
    create: {
      organizationId: platform.id,
      userId: admin.id,
      isPrimary: true,
      title: 'Super Administrator',
    },
    update: {},
  });

  await prisma.matchingRule.upsert({
    where: { code: 'DEFAULT' },
    create: {
      code: 'DEFAULT',
      name: 'Default weighted matching',
      versions: {
        create: {
          version: 1,
          weights: defaultMatchingWeights,
          minScore: 40,
          publishedAt: new Date(),
        },
      },
    },
    update: {},
  });

  await prisma.featureFlag.upsert({
    where: { key: 'ai_enabled' },
    create: {
      key: 'ai_enabled',
      enabled: false,
      description: 'Global switch for external AI processing',
    },
    update: {},
  });

  await prisma.featureFlag.upsert({
    where: { key: 'semantic_search' },
    create: {
      key: 'semantic_search',
      enabled: false,
      description: 'Enable semantic vendor search (falls back to structured filters)',
    },
    update: {},
  });

  // Seed Admin → System Settings defaults (email/storage/AI/ops are not in .env).
  // Does not overwrite values an administrator already saved.
  const integrationDefaults: Array<{ key: string; value: unknown }> = [
    { key: 'email.provider', value: 'console' },
    { key: 'email.fromName', value: 'Event Matchmaking' },
    { key: 'email.from', value: 'noreply@example.com' },
    { key: 'email.smtpHost', value: '' },
    { key: 'email.smtpPort', value: 587 },
    { key: 'email.smtpSecure', value: false },
    { key: 'email.smtpUser', value: '' },
    { key: 'email.smtpMinIntervalMs', value: 5000 },
    { key: 'email.smtpFallbackHost', value: '' },
    { key: 'email.smtpFallbackPort', value: 587 },
    { key: 'email.smtpFallbackSecure', value: false },
    { key: 'email.smtpFallbackUser', value: '' },
    { key: 'email.smtpFallbackFrom', value: '' },
    { key: 'storage.provider', value: 'local' },    { key: 'storage.localPath', value: './uploads' },
    { key: 'storage.s3Bucket', value: '' },
    { key: 'storage.s3Region', value: '' },
    { key: 'storage.s3Endpoint', value: '' },
    { key: 'ai.enabled', value: false },
    { key: 'ai.primaryProvider', value: 'none' },
    { key: 'ai.secondaryProvider', value: 'none' },
    { key: 'ai.requestTimeoutMs', value: 15000 },
    { key: 'ai.maxRetries', value: 2 },
    { key: 'ops.semanticSearch', value: false },
    { key: 'ops.backupRetentionDays', value: 30 },
    { key: 'ops.rpoHours', value: 24 },
    { key: 'ops.rtoHours', value: 4 },
  ];

  for (const item of integrationDefaults) {
    const existing = await prisma.systemSetting.findUnique({
      where: { key: item.key },
    });
    if (!existing) {
      await prisma.systemSetting.create({
        data: { key: item.key, value: { value: item.value } },
      });
    }
  }

  await prisma.emailTemplate.upsert({
    where: { code_version: { code: 'invitation', version: 1 } },
    create: {
      code: 'invitation',
      version: 1,
      subject: 'You are invited to Event Matchmaking',
      bodyHtml:
        '<p>Hello,</p><p>You have been invited. Register here: {{registrationUrl}}</p>',
      bodyText: 'You have been invited. Register: {{registrationUrl}}',
      isActive: true,
    },
    update: {},
  });

  await prisma.emailTemplate.upsert({
    where: { code_version: { code: 'correction', version: 1 } },
    create: {
      code: 'correction',
      version: 1,
      subject: 'Please update your form answers',
      bodyHtml:
        '<p>Hello,</p><p>Some answers need updates. Open this link and fix only the marked fields:</p><p><a href="{{correctionUrl}}">{{correctionUrl}}</a></p><pre>{{fieldSummary}}</pre>',
      bodyText:
        'Some answers need updates. Open {{correctionUrl}} and fix only the marked fields.\n\n{{fieldSummary}}',
      isActive: true,
    },
    update: {},
  });

  const companyOrg = await prisma.organization.upsert({
    where: { code: 'ACME' },
    create: {
      code: 'ACME',
      name: 'Acme Manufacturing',
      type: 'COMPANY',
      status: 'ACTIVE',
      industry: 'Manufacturing',
      region: 'EU',
      country: 'DE',
      website: 'https://www.acme-manufacturing.example',
      customAttrs: {
        contactEmail: 'buyer@acme-manufacturing.example',
        logoUrl: logoUrlFor('Acme Manufacturing'),
        city: 'Munich',
      },
    },
    update: {},
  });
  await prisma.company.upsert({
    where: { organizationId: companyOrg.id },
    create: {
      organizationId: companyOrg.id,
      requiredCapabilities: ['CNC', 'ISO9001'],
      preferredCategories: ['manufacturing'],
      commercialPrefs: { tags: ['net30'] },
      verificationStatus: 'VERIFIED',
      approvalStatus: 'VERIFIED',
      matchingEligible: true,
    },
    update: {
      matchingEligible: true,
      verificationStatus: 'VERIFIED',
      approvalStatus: 'VERIFIED',
    },
  });

  const vendorOrg = await prisma.organization.upsert({
    where: { code: 'PRECIS' },
    create: {
      code: 'PRECIS',
      name: 'Precision Parts GmbH',
      type: 'VENDOR',
      status: 'APPROVED',
      industry: 'Manufacturing',
      country: 'DE',
      website: 'https://www.precision-parts.example',
      customAttrs: {
        contactEmail: 'sales@precision-parts.example',
        logoUrl: logoUrlFor('Precision Parts'),
      },
    },
    update: { status: 'APPROVED' },
  });
  await prisma.vendor.upsert({
    where: { organizationId: vendorOrg.id },
    create: {
      organizationId: vendorOrg.id,
      displayName: 'Precision Parts',
      categories: ['manufacturing'],
      capabilities: ['CNC', 'ISO9001', 'Welding'],
      operatingRegions: ['EU', 'UK'],
      commercialPrefs: { tags: ['net30'] },
      verificationStatus: 'VERIFIED',
      approvalStatus: 'VERIFIED',
      onboardingComplete: true,
      matchingEligible: true,
    },
    update: {
      approvalStatus: 'VERIFIED',
      verificationStatus: 'VERIFIED',
      onboardingComplete: true,
      matchingEligible: true,
    },
  });

  let companiesUpserted = 0;
  for (const company of demoCompanies()) {
    const org = await prisma.organization.upsert({
      where: { code: company.code },
      create: {
        code: company.code,
        name: company.name,
        type: 'COMPANY',
        status: 'ACTIVE',
        industry: company.industry,
        country: company.country,
        region: company.region,
        address: `${company.city}, ${company.country}`,
        website: company.website,
        sizeBand: company.sizeBand,
        customAttrs: {
          contactEmail: company.email,
          logoUrl: logoUrlFor(company.name),
          city: company.city,
          demo: true,
        },
      },
      update: {
        name: company.name,
        status: 'ACTIVE',
        industry: company.industry,
        country: company.country,
        region: company.region,
        address: `${company.city}, ${company.country}`,
        website: company.website,
        sizeBand: company.sizeBand,
        customAttrs: {
          contactEmail: company.email,
          logoUrl: logoUrlFor(company.name),
          city: company.city,
          demo: true,
        },
      },
    });
    await prisma.company.upsert({
      where: { organizationId: org.id },
      create: {
        organizationId: org.id,
        preferredCategories: company.categories,
        requiredCapabilities: company.capabilities,
        commercialPrefs: { tags: ['net30'], paymentTerms: 'Net 30' },
        verificationStatus: 'VERIFIED',
        approvalStatus: 'VERIFIED',
        matchingEligible: true,
        normalizedProfile: {
          name: company.name,
          industry: company.industry,
          website: company.website,
          logoUrl: logoUrlFor(company.name),
        },
      },
      update: {
        preferredCategories: company.categories,
        requiredCapabilities: company.capabilities,
        verificationStatus: 'VERIFIED',
        approvalStatus: 'VERIFIED',
        matchingEligible: true,
        normalizedProfile: {
          name: company.name,
          industry: company.industry,
          website: company.website,
          logoUrl: logoUrlFor(company.name),
        },
      },
    });
    companiesUpserted += 1;
  }

  let vendorsUpserted = 0;
  for (const vendor of demoVendors(200)) {
    const org = await prisma.organization.upsert({
      where: { code: vendor.code },
      create: {
        code: vendor.code,
        name: vendor.name,
        type: 'VENDOR',
        status: 'APPROVED',
        industry: vendor.industry,
        country: vendor.country,
        region: vendor.region,
        website: vendor.website,
        customAttrs: {
          contactEmail: vendor.email,
          logoUrl: logoUrlFor(vendor.name),
          demo: true,
        },
      },
      update: {
        name: vendor.name,
        status: 'APPROVED',
        industry: vendor.industry,
        country: vendor.country,
        region: vendor.region,
        website: vendor.website,
        customAttrs: {
          contactEmail: vendor.email,
          logoUrl: logoUrlFor(vendor.name),
          demo: true,
        },
      },
    });
    await prisma.vendor.upsert({
      where: { organizationId: org.id },
      create: {
        organizationId: org.id,
        displayName: vendor.displayName,
        categories: vendor.categories,
        services: vendor.services,
        capabilities: vendor.capabilities,
        operatingRegions: vendor.operatingRegions,
        capacityPerDay: vendor.capacityPerDay,
        commercialPrefs: { tags: ['net30'], currency: 'USD' },
        verificationStatus: 'VERIFIED',
        approvalStatus: 'VERIFIED',
        onboardingComplete: true,
        matchingEligible: true,
        normalizedProfile: {
          name: vendor.name,
          industry: vendor.industry,
          website: vendor.website,
          logoUrl: logoUrlFor(vendor.name),
          verified: true,
        },
      },
      update: {
        displayName: vendor.displayName,
        categories: vendor.categories,
        services: vendor.services,
        capabilities: vendor.capabilities,
        operatingRegions: vendor.operatingRegions,
        capacityPerDay: vendor.capacityPerDay,
        verificationStatus: 'VERIFIED',
        approvalStatus: 'VERIFIED',
        onboardingComplete: true,
        matchingEligible: true,
        normalizedProfile: {
          name: vendor.name,
          industry: vendor.industry,
          website: vendor.website,
          logoUrl: logoUrlFor(vendor.name),
          verified: true,
        },
      },
    });
    vendorsUpserted += 1;
  }

  console.log(
    `Seed complete. Login: ${adminEmail}. Demo companies: ${companiesUpserted}. Demo vendors: ${vendorsUpserted}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
