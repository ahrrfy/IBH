import { ContractsService } from '../contracts.service';

/**
 * Renewal sweep (T52). Mocks Prisma + notifications and verifies:
 *   1. Only contracts with endDate inside the next 30 days are notified.
 *   2. `renewalNotifiedAt` is set after dispatch (idempotency).
 *   3. Already-notified rows are skipped (filter excludes them).
 */
describe('ContractsService.runRenewalSweep (T52)', () => {
  const now = new Date('2026-04-27T00:00:00Z');

  const dispatch = jest.fn().mockResolvedValue({ id: 'n1' });
  const prismaMock: any = {
    employmentContract: {
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const audit: any = { log: jest.fn() };
  const notifications: any = { dispatch };

  const svc = new ContractsService(prismaMock, audit, notifications);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('notifies contracts whose endDate is within next 30 days', async () => {
    prismaMock.employmentContract.findMany.mockResolvedValue([
      {
        id: 'c1',
        companyId: 'co',
        contractNo: 'C-001',
        createdBy: 'u1',
        endDate: new Date('2026-05-10T00:00:00Z'),
      },
      {
        id: 'c2',
        companyId: 'co',
        contractNo: 'C-002',
        createdBy: 'u2',
        endDate: new Date('2026-05-20T00:00:00Z'),
      },
    ]);

    const r = await svc.runRenewalSweep(now);

    expect(prismaMock.employmentContract.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'active',
          renewalNotifiedAt: null,
        }),
      }),
    );
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(prismaMock.employmentContract.update).toHaveBeenCalledTimes(2);
    expect(r.notified).toBe(2);
  });

  it('returns 0 when no contracts are due', async () => {
    prismaMock.employmentContract.findMany.mockResolvedValue([]);
    const r = await svc.runRenewalSweep(now);
    expect(r.notified).toBe(0);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('uses a 30-day horizon from `now`', async () => {
    prismaMock.employmentContract.findMany.mockResolvedValue([]);
    await svc.runRenewalSweep(now);
    const arg = prismaMock.employmentContract.findMany.mock.calls[0][0];
    const expectedHorizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    expect(arg.where.endDate.lte.getTime()).toBe(expectedHorizon.getTime());
    expect(arg.where.endDate.gte.getTime()).toBe(now.getTime());
  });
});
