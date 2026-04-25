import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';

/**
 * Audit log is append-only (F2). DB triggers must reject any UPDATE
 * or DELETE on `audit_logs`, regardless of who issues the command.
 */
describe('AuditLog — Append-Only (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('UPDATE on audit_logs is rejected by trigger', async () => {
    await expect(
      prisma.$executeRawUnsafe(`UPDATE audit_logs SET action = 'tampered' WHERE id IS NOT NULL`),
    ).rejects.toThrow();
  });

  it('DELETE on audit_logs is rejected by trigger', async () => {
    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM audit_logs WHERE id IS NOT NULL`),
    ).rejects.toThrow();
  });

  it('DELETE on stock_ledger_entries is rejected by trigger', async () => {
    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM stock_ledger_entries WHERE id IS NOT NULL`),
    ).rejects.toThrow();
  });
});
