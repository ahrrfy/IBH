import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';
import { AccountMappingService } from '../src/modules/finance/account-mapping/account-mapping.service';

/**
 * T48 — Account Mapping safety net.
 *
 * Verifies that:
 *  - getAccountForEvent returns the configured code when present
 *  - Returns null (not throws) when missing — so callers can fall back
 *    to legacy literals and never break a balanced JE (F2).
 */
describe('AccountMappingService (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: AccountMappingService;
  let companyId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    service = app.get(AccountMappingService);

    const company = await prisma.company.findFirst({ where: { code: 'RUA' } });
    expect(company).toBeTruthy();
    companyId = company!.id;

    // Ensure the sale.cash mapping exists (may not be in bootstrap seed).
    const cashAccount = await prisma.chartOfAccount.findFirst({
      where: { companyId, code: '2411', isActive: true },
    });
    if (cashAccount) {
      await prisma.accountMapping.upsert({
        where: { companyId_eventType: { companyId, eventType: 'sale.cash' } },
        update: { accountCode: '2411' },
        create: { companyId, eventType: 'sale.cash', accountCode: '2411', description: 'e2e-seed' },
      });
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns the seeded code for sale.cash', async () => {
    const code = await service.getAccountForEvent(companyId, 'sale.cash');
    // Seeded as 2411 (Main Branch Cash)
    expect(code).toBe('2411');
  });

  it('returns null for an unknown event (caller falls back to literal)', async () => {
    const code = await service.getAccountForEvent(companyId, 'nonexistent.event.xyz');
    expect(code).toBeNull();
  });

  it('rejects upsert with a non-existent CoA code', async () => {
    await expect(
      service.upsert(companyId, 'sale.cash', '99999'),
    ).rejects.toThrow();
  });

  it('upsert + cache invalidation reflects new value within the same call', async () => {
    // Pick any seeded postable account
    const acc = await prisma.chartOfAccount.findFirst({
      where: { companyId, isActive: true, allowDirectPosting: true, code: '2411' },
    });
    expect(acc).toBeTruthy();
    await service.upsert(companyId, 't48.test.event', acc!.code, 'test');
    const code = await service.getAccountForEvent(companyId, 't48.test.event');
    expect(code).toBe(acc!.code);
    // cleanup
    await prisma.accountMapping.deleteMany({ where: { companyId, eventType: 't48.test.event' } });
  });
});
