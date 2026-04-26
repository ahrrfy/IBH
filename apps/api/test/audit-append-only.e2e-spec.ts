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

  // Row-level triggers only fire when rows exist. Seed one row with FK bypass
  // so the UPDATE/DELETE tests have something to operate on.
  beforeAll(async () => {
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
    await prisma.$executeRawUnsafe(`
      INSERT INTO audit_logs
        ("id","companyId","userId","userEmail","action","entityType","entityId",
         "hash","previousHash","occurredAt")
      VALUES
        (gen_ulid(), gen_ulid()::char(26), gen_ulid()::char(26),
         'seed@test.local', 'TEST_SEED', 'Test', gen_ulid()::char(26),
         repeat('0',64), repeat('0',64), NOW())
      ON CONFLICT DO NOTHING
    `);
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);

    await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
    // stock_ledger (@@map) — not stock_ledger_entries. Required non-null fields:
    // variantId, warehouseId, companyId, qtyChange, balanceAfter, unitCostIqd,
    // totalValueIqd, referenceType, referenceId, createdBy
    await prisma.$executeRawUnsafe(`
      INSERT INTO stock_ledger
        ("id","companyId","variantId","warehouseId",
         "qtyChange","balanceAfter","unitCostIqd","totalValueIqd",
         "referenceType","referenceId","createdBy")
      VALUES
        (gen_ulid(), gen_ulid()::char(26), gen_ulid()::char(26), gen_ulid()::char(26),
         1, 1, 1000, 1000, 'Test', gen_ulid()::char(26), gen_ulid()::char(26))
      ON CONFLICT DO NOTHING
    `);
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
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

  it('DELETE on stock_ledger is rejected by trigger', async () => {
    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM stock_ledger WHERE id IS NOT NULL`),
    ).rejects.toThrow();
  });
});
