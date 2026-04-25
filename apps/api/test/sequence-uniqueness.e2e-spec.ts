import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';
import { SequenceService } from '../src/engines/sequence/sequence.service';

/**
 * SequenceService must produce strictly monotonic, unique numbers
 * per (companyId, branchId, prefix, year). Concurrent calls must
 * never collide — guaranteed by row-level lock + unique index.
 */
describe('SequenceService — Uniqueness (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sequence: SequenceService;
  const companyId = '01HZZZZZZZZZZZZZZZZZZZZZZZ';

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    sequence = app.get(SequenceService);
  });

  afterAll(async () => {
    await prisma.documentSequence.deleteMany({ where: { companyId, prefix: 'TEST' } });
    await app?.close();
  });

  it('produces unique numbers under concurrency', async () => {
    const N = 50;
    const results = await Promise.all(
      Array.from({ length: N }, () => sequence.next(companyId, 'TEST')),
    );
    const unique = new Set(results);
    expect(unique.size).toBe(N);
  });
});
