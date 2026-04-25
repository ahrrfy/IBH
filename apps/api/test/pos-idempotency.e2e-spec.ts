import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';

/**
 * POS receipts use `clientUlid` for offline-safe dedup. The DB
 * unique index on clientUlid must reject a second insert with the
 * same value, guaranteeing idempotency for retried sync requests.
 */
describe('POSReceipt — clientUlid idempotency (e2e)', () => {
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

  it('DB rejects duplicate clientUlid via unique index', async () => {
    const dup = '01HZZZZZZZZZZZZZZZTESTDUP1';
    await expect(
      prisma.$executeRawUnsafe(`
        INSERT INTO pos_receipts
          ("id", "companyId", "branchId", "shiftId", "number",
           "warehouseId", "subtotalIqd", "totalIqd", "clientUlid", "createdBy")
        VALUES
          (gen_ulid(), gen_ulid()::char(26), gen_ulid()::char(26),
           gen_ulid()::char(26), 'TEST-DUP-A', gen_ulid()::char(26),
           1000, 1000, '${dup}', gen_ulid()::char(26)),
          (gen_ulid(), gen_ulid()::char(26), gen_ulid()::char(26),
           gen_ulid()::char(26), 'TEST-DUP-B', gen_ulid()::char(26),
           1000, 1000, '${dup}', gen_ulid()::char(26))
      `),
    ).rejects.toThrow();
  });
});
