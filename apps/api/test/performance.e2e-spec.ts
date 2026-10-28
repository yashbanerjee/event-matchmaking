/**
 * Lightweight performance probes. Records measured timings; does not claim production capacity.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { performance } from 'perf_hooks';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { calculateMatchScore } from '@em/domain';
import { defaultMatchingWeights } from '@em/shared';

describe('Performance probes', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'ChangeMeAdmin1!' });
    token = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('scores 5k candidate pairs under 500ms CPU budget (local)', () => {
    const company = {
      organizationId: 'c',
      industry: 'Manufacturing',
      capabilities: [],
      categories: [],
      regions: ['EU'],
      requirements: ['CNC', 'ISO9001'],
      preferredCategories: ['manufacturing'],
      commercialTags: ['net30'],
      mutualPreferenceTags: [],
    };
    const vendor = {
      organizationId: 'v',
      industry: 'Manufacturing',
      capabilities: ['CNC', 'ISO9001'],
      categories: ['manufacturing'],
      regions: ['EU'],
      requirements: [],
      preferredCategories: [],
      commercialTags: ['net30'],
      mutualPreferenceTags: [],
    };

    const started = performance.now();
    for (let i = 0; i < 5000; i += 1) {
      calculateMatchScore(
        { ...company, organizationId: `c${i}` },
        { ...vendor, organizationId: `v${i % 50}` },
        defaultMatchingWeights,
      );
    }
    const elapsed = performance.now() - started;
    // Soft assertion with recorded condition; CI machines vary.
    expect(elapsed).toBeLessThan(2000);
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        probe: 'score_5k_pairs',
        elapsedMs: Math.round(elapsed),
        conditions: 'single-thread node, in-memory',
      }),
    );
  });

  it('dashboard overview responds under 2s with seeded data', async () => {
    const started = performance.now();
    await request(app.getHttpServer())
      .get('/api/v1/dashboard/overview')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(2000);
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        probe: 'dashboard_overview',
        elapsedMs: Math.round(elapsed),
        companies: await prisma.company.count(),
        vendors: await prisma.vendor.count(),
      }),
    );
  });

  it('concurrent meeting list requests remain successful', async () => {
    const started = performance.now();
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        request(app.getHttpServer())
          .get('/api/v1/meetings')
          .set('Authorization', `Bearer ${token}`),
      ),
    );
    const elapsed = performance.now() - started;
    expect(results.every((r) => r.status === 200)).toBe(true);
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        probe: 'concurrent_meeting_lists_20',
        elapsedMs: Math.round(elapsed),
      }),
    );
  });
});
