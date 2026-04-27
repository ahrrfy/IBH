import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';

/**
 * T51 acceptance — public job board apply happy path.
 *
 * The public endpoint must:
 *   1. Reject a non-existent slug with 404,
 *   2. Accept a Zod-valid POST against an OPEN posting,
 *   3. Persist an Application linked to the posting with a numeric autoScreenScore,
 *   4. Run without authentication (no Authorization header attached).
 *
 * Test isolation: creates one disposable JobPosting in `open` state, runs the
 * apply flow, then cleans up the application + posting it created. No other
 * tenant data is touched.
 */
describe('HR Recruitment — public apply (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
  });

  async function buildContext() {
    const company = await prisma.company.findFirst();
    if (!company) return null;
    const owner = await prisma.user.findFirst({
      where: { companyId: company.id, isSystemOwner: true },
    });
    if (!owner) return null;
    return { companyId: company.id, userId: owner.id };
  }

  it('rejects an unknown slug with 404', async () => {
    const ctx = await buildContext();
    if (!ctx) return;
    await request(app.getHttpServer())
      .post('/api/public/jobs/this-slug-does-not-exist/apply')
      .send({
        applicantName: 'Test Candidate',
        applicantEmail: 'test@example.com',
        yearsExperience: 1,
      })
      .expect(404);
  });

  it('accepts a valid application against an open posting and computes a score', async () => {
    const ctx = await buildContext();
    if (!ctx) return;

    const slug = `e2e-recruitment-${Date.now()}`;
    const posting = await prisma.jobPosting.create({
      data: {
        companyId: ctx.companyId,
        slug,
        titleAr: 'مطوّر اختبار',
        descriptionAr: 'وظيفة اختبار للقبول الآلي.',
        keywords: 'react,typescript',
        minYearsExperience: 2,
        status: 'open',
        openedAt: new Date(),
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    try {
      const res = await request(app.getHttpServer())
        .post(`/api/public/jobs/${slug}/apply`)
        .send({
          applicantName: 'Public Applicant',
          applicantEmail: `e2e+${Date.now()}@example.com`,
          applicantPhone: '+9647700000099',
          yearsExperience: 4,
          cvText: 'Senior react typescript engineer with 4 years experience.',
          coverLetter: 'I love building reliable systems.',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        id: expect.any(String),
        status: expect.stringMatching(/^(new|screened)$/),
      });
      expect(typeof res.body.autoScreenScore).toBe('number');
      expect(res.body.autoScreenScore).toBeGreaterThanOrEqual(0);
      expect(res.body.autoScreenScore).toBeLessThanOrEqual(100);

      const persisted = await prisma.application.findUnique({ where: { id: res.body.id } });
      expect(persisted).not.toBeNull();
      expect(persisted!.jobPostingId).toBe(posting.id);
      expect(persisted!.companyId).toBe(ctx.companyId);

      // cleanup
      await prisma.application.delete({ where: { id: res.body.id } }).catch(() => undefined);
    } finally {
      await prisma.jobPosting.delete({ where: { id: posting.id } }).catch(() => undefined);
    }
  });
});
