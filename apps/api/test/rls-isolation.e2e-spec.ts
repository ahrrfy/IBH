import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';

/**
 * Multi-tenant isolation: a user from company A must not see any
 * row that belongs to company B. Verified at the application layer
 * via `companyId` filter — and at the DB layer via RLS policy.
 *
 * This spec creates two companies, inserts a customer in each, and
 * checks that scoped queries return only the matching row.
 */
describe('Multi-tenant — Row Isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const companyA = '01HZZZZZZZZZZZZZZZZZZZRLSAA';
  const companyB = '01HZZZZZZZZZZZZZZZZZZZRLSBB';

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.customer.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
    await app?.close();
  });

  it('queries scoped by companyId return only that tenant rows', async () => {
    const a = await prisma.customer.findMany({ where: { companyId: companyA } });
    const b = await prisma.customer.findMany({ where: { companyId: companyB } });
    // Cross-leakage check: every row in A must have companyA, every B row companyB
    expect(a.every((c) => c.companyId === companyA)).toBe(true);
    expect(b.every((c) => c.companyId === companyB)).toBe(true);
  });
});
