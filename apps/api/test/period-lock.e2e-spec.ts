import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';
import { PostingService } from '../src/engines/posting/posting.service';

/**
 * Period Lock (F2): once an AccountingPeriod is closed, no new
 * journal entry may be posted into its date range. PostingService
 * must reject the attempt before any DB write.
 */
describe('Posting — Period Lock (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let posting: PostingService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    posting = app.get(PostingService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects posting into a closed period', async () => {
    const company = await prisma.company.findFirst();
    if (!company) return;

    const period = await prisma.accountingPeriod.findFirst({
      where: { companyId: company.id, status: 'closed' },
    });
    if (!period) return;

    await expect(
      posting.postJournalEntry(
        {
          companyId: company.id,
          entryDate: period.startDate,
          refType: 'Test',
          refId: '01HZZZZZZZZZZZZZZZZZZZZZZZ',
          description: 'should be rejected — closed period',
          lines: [
            { accountCode: '2411', debit: 1000, description: 'd' },
            { accountCode: '511',  credit: 1000, description: 'c' },
          ],
        },
        { userId: '01HZZZZZZZZZZZZZZZZZZZZZZZ', companyId: company.id } as any,
      ),
    ).rejects.toThrow();
  });
});
