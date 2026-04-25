import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/prisma/prisma.service';

/**
 * For every PayrollLine: gross = net + totalDeduct (within rounding).
 * For every PayrollRun: sum of line.netIqd == totalNetIqd.
 */
describe('HR — payroll math balances (e2e)', () => {
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

  it('every line: gross = net + totalDeduct', async () => {
    const lines = await prisma.payrollLine.findMany({ take: 50 });
    for (const l of lines) {
      const gross = Number(l.grossIqd);
      const net = Number(l.netIqd);
      const ded = Number(l.totalDeductIqd);
      expect(Math.abs(gross - (net + ded))).toBeLessThan(0.01);
    }
  });

  it('every run: sum(line.net) = totalNetIqd', async () => {
    const runs = await prisma.payrollRun.findMany({
      where: { status: { in: ['approved', 'posted', 'paid'] } },
      take: 10,
    });
    for (const run of runs) {
      const agg = await prisma.payrollLine.aggregate({
        where: { payrollRunId: run.id },
        _sum: { netIqd: true },
      });
      expect(Math.abs(Number(agg._sum.netIqd ?? 0) - Number(run.totalNetIqd))).toBeLessThan(0.01);
    }
  });
});
