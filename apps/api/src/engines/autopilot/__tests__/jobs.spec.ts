/**
 * Unit tests for T71 — the 3 reference Autopilot jobs.
 *
 * Each job is exercised twice:
 *   - Happy path: the job completes silently (status=completed or no_op).
 *   - Exception path: the job raises an AutopilotException and reports it
 *     in its JobResult.
 *
 * Prisma + AutoReorderService + NotificationsService are stubbed in-memory.
 */
import { SalesOverdueReminderJob } from '../jobs/sales.overdue-reminder.job';
import { InventoryAutoReorderJob } from '../jobs/inventory.auto-reorder.job';
import { LicenseAutoRenewalJob } from '../jobs/license.auto-renewal.job';
import { AutopilotEngineService } from '../autopilot.service';

function makeEngineMock() {
  const exceptions: Array<{ jobId: string; severity: string }> = [];
  return {
    exceptions,
    raiseException: jest.fn(async (input: any) => {
      exceptions.push({ jobId: input.jobId, severity: input.severity });
      return { id: `ex_${exceptions.length}` };
    }),
  } as unknown as AutopilotEngineService & { exceptions: typeof exceptions };
}

function ctx(companyId = 'C1') {
  return { companyId, startedAt: new Date(), trigger: 'cron' as const };
}

// ── sales.overdue-reminder ─────────────────────────────────────────────────
describe('sales.overdue-reminder', () => {
  it('happy path: no overdue invoices → no_op-ish completed run', async () => {
    const prisma = {
      salesInvoice: { findMany: jest.fn(async () => []) },
      notification: { findFirst: jest.fn(async () => null) },
    };
    const notifications = { dispatch: jest.fn(async () => ({ id: 'n' })) };
    const engine = makeEngineMock();
    const job = new SalesOverdueReminderJob(
      prisma as any,
      notifications as any,
      engine as any,
    );
    const result = await job.execute(ctx());
    expect(result.status).toBe('completed');
    expect(result.itemsProcessed).toBe(0);
    expect(result.exceptionsRaised).toBe(0);
    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('exception path: invoice >30 days overdue and >5M IQD raises high exception', async () => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() - 45); // 45 days overdue
    const prisma = {
      salesInvoice: {
        findMany: jest.fn(async () => [
          {
            id: 'INV1',
            number: '1001',
            customerId: 'CUS1',
            balanceIqd: 7_000_000,
            totalIqd: 7_000_000,
            dueDate,
            createdBy: 'U1',
            customer: { nameAr: 'عميل' },
          },
        ]),
      },
      notification: { findFirst: jest.fn(async () => null) },
    };
    const notifications = { dispatch: jest.fn(async () => ({ id: 'n' })) };
    const engine = makeEngineMock();
    const job = new SalesOverdueReminderJob(
      prisma as any,
      notifications as any,
      engine as any,
    );
    const result = await job.execute(ctx());
    expect(result.status).toBe('exception_raised');
    expect(result.exceptionsRaised).toBe(1);
    expect(notifications.dispatch).toHaveBeenCalledTimes(1);
    expect(engine.exceptions[0].severity).toBe('high');
  });

  it('cooldown: skips invoices with a reminder in the last 7 days', async () => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() - 5);
    const prisma = {
      salesInvoice: {
        findMany: jest.fn(async () => [
          {
            id: 'INV2',
            number: '1002',
            customerId: 'CUS1',
            balanceIqd: 100_000,
            totalIqd: 100_000,
            dueDate,
            createdBy: 'U1',
            customer: { nameAr: 'X' },
          },
        ]),
      },
      notification: { findFirst: jest.fn(async () => ({ id: 'recent' })) },
    };
    const notifications = { dispatch: jest.fn(async () => ({ id: 'n' })) };
    const engine = makeEngineMock();
    const job = new SalesOverdueReminderJob(
      prisma as any,
      notifications as any,
      engine as any,
    );
    const result = await job.execute(ctx());
    expect(result.itemsProcessed).toBe(0);
    expect(notifications.dispatch).not.toHaveBeenCalled();
  });
});

// ── inventory.auto-reorder ─────────────────────────────────────────────────
describe('inventory.auto-reorder', () => {
  it('happy path: AutoReorderService creates draft POs, no exception', async () => {
    const reorder = {
      run: jest.fn(async () => ({
        runId: 'R1',
        scannedSkus: 10,
        flagsCreated: 2,
        flagsResolved: 0,
        draftPosCreated: 2,
        draftPos: [
          { supplierId: 'S1', warehouseId: 'W1', poNumber: 'PO-1', lineCount: 3, totalIqd: 10000 },
          { supplierId: 'S2', warehouseId: 'W1', poNumber: 'PO-2', lineCount: 2, totalIqd: 20000 },
        ],
        durationMs: 100,
      })),
    };
    const engine = makeEngineMock();
    const job = new InventoryAutoReorderJob(reorder as any, engine as any);
    const result = await job.execute(ctx());
    expect(result.status).toBe('completed');
    expect(result.itemsProcessed).toBe(2);
    expect(engine.exceptions).toHaveLength(0);
  });

  it('exception path: shortages detected but no draft POs → raises medium exception', async () => {
    const reorder = {
      run: jest.fn(async () => ({
        runId: 'R2',
        scannedSkus: 5,
        flagsCreated: 3,
        flagsResolved: 0,
        draftPosCreated: 0,
        draftPos: [],
        durationMs: 50,
      })),
    };
    const engine = makeEngineMock();
    const job = new InventoryAutoReorderJob(reorder as any, engine as any);
    const result = await job.execute(ctx());
    expect(result.status).toBe('exception_raised');
    expect(result.exceptionsRaised).toBe(1);
    expect(engine.exceptions[0].severity).toBe('medium');
  });
});

// ── license.auto-renewal ───────────────────────────────────────────────────
describe('license.auto-renewal', () => {
  it('no_op when there is no terminating subscription', async () => {
    const prisma = { subscription: { findFirst: jest.fn(async () => null) } };
    const engine = makeEngineMock();
    const job = new LicenseAutoRenewalJob(prisma as any, engine as any);
    const result = await job.execute(ctx());
    expect(result.status).toBe('no_op');
    expect(engine.exceptions).toHaveLength(0);
  });

  it('raises critical exception when no stored payment method exists', async () => {
    const prisma = {
      subscription: {
        findFirst: jest.fn(async () => ({
          id: 'SUB1',
          status: 'expired',
          billingCycle: 'monthly',
          trialEndsAt: new Date(),
          currentPeriodEndAt: new Date(),
          priceIqd: 50000,
        })),
      },
    };
    const engine = makeEngineMock();
    const job = new LicenseAutoRenewalJob(prisma as any, engine as any);
    const result = await job.execute(ctx());
    expect(result.status).toBe('exception_raised');
    expect(engine.exceptions[0].severity).toBe('critical');
  });
});
