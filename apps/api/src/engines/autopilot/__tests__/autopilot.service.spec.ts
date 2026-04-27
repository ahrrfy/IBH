/**
 * Unit tests for T71 — AutopilotEngineService.
 *
 * Validates the core engine contract:
 *   1. Job registration via the AUTOPILOT_JOBS multi-token.
 *   2. runJob returns the JobResult and writes a run-log row (success path).
 *   3. runJob catches thrown errors, writes status='failed', does not rethrow.
 *   4. raiseException persists a row and dispatches a notification when
 *      severity >= 'high', stays silent otherwise.
 *   5. resolveException / dismissException update the row + audit.
 *   6. dashboard aggregates correctly.
 */
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobResult,
} from '../autopilot.types';

interface ExceptionRow {
  id: string;
  jobId: string;
  domain: string;
  companyId: string;
  severity: string;
  status: 'pending' | 'resolved' | 'dismissed';
  title: string;
  description: string;
  payload: unknown;
  suggestedAction: string | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  resolution: unknown;
  createdAt: Date;
}

interface RunRow {
  id: string;
  jobId: string;
  companyId: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: string;
  itemsProcessed: number;
  exceptionsRaised: number;
  errorMessage: string | null;
}

function makePrisma() {
  const exceptions: ExceptionRow[] = [];
  const runs: RunRow[] = [];
  const companies = [{ id: 'C1', isActive: true, deletedAt: null }];
  const users: Array<{ id: string; companyId: string; status: string; deletedAt: null }> = [
    { id: 'U_ADMIN', companyId: 'C1', status: 'active', deletedAt: null },
  ];
  let seq = 0;
  const newId = () => `id_${++seq}`;

  return {
    _exceptions: exceptions,
    _runs: runs,
    autopilotException: {
      create: jest.fn(async ({ data, select }: any) => {
        const row: ExceptionRow = {
          id: newId(),
          jobId: data.jobId,
          domain: data.domain,
          companyId: data.companyId,
          severity: data.severity,
          status: data.status ?? 'pending',
          title: data.title,
          description: data.description,
          payload: data.payload ?? {},
          suggestedAction: data.suggestedAction ?? null,
          resolvedBy: null,
          resolvedAt: null,
          resolution: null,
          createdAt: new Date(),
        };
        exceptions.push(row);
        return select?.id ? { id: row.id } : row;
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        const row = exceptions.find(
          (e) => e.id === where.id && e.companyId === where.companyId,
        );
        return row ? { id: row.id, status: row.status } : null;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = exceptions.find((e) => e.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return row;
      }),
      count: jest.fn(async ({ where }: any) => {
        return exceptions.filter((e) =>
          (!where.status || e.status === where.status) &&
          (!where.companyId || e.companyId === where.companyId),
        ).length;
      }),
      groupBy: jest.fn(async ({ where }: any) => {
        const rows = exceptions.filter((e) => e.companyId === where.companyId);
        const map: Record<string, number> = {};
        for (const r of rows) map[r.status] = (map[r.status] ?? 0) + 1;
        return Object.entries(map).map(([status, c]) => ({
          status,
          _count: { _all: c },
        }));
      }),
      findMany: jest.fn(async () => exceptions),
    },
    autopilotJobRun: {
      create: jest.fn(async ({ data }: any) => {
        const row: RunRow = {
          id: newId(),
          jobId: data.jobId,
          companyId: data.companyId,
          startedAt: data.startedAt,
          finishedAt: data.finishedAt ?? null,
          status: data.status,
          itemsProcessed: data.itemsProcessed ?? 0,
          exceptionsRaised: data.exceptionsRaised ?? 0,
          errorMessage: data.errorMessage ?? null,
        };
        runs.push(row);
        return row;
      }),
      count: jest.fn(async ({ where }: any) =>
        runs.filter((r) => r.companyId === where.companyId).length,
      ),
      aggregate: jest.fn(async () => ({
        _sum: {
          itemsProcessed: runs.reduce((s, r) => s + r.itemsProcessed, 0),
        },
      })),
      findMany: jest.fn(async ({ where }: any) =>
        runs.filter((r) => r.companyId === where.companyId),
      ),
    },
    company: {
      findMany: jest.fn(async () => companies),
    },
    user: {
      findMany: jest.fn(async ({ where }: any) =>
        users.filter((u) => u.companyId === where.companyId),
      ),
    },
  };
}

function makeAudit() {
  return { log: jest.fn(async () => undefined) };
}

function makeNotifications() {
  return { dispatch: jest.fn(async () => ({ id: 'n1' })) };
}

class StubJob implements AutopilotJob {
  readonly meta = {
    id: 'test.job',
    domain: 'sales' as const,
    schedule: '0 9 * * *',
    companyScoped: true,
    titleAr: 'اختبار',
    titleEn: 'Test',
  };
  constructor(private readonly impl: (ctx: AutopilotJobContext) => Promise<AutopilotJobResult>) {}
  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    return this.impl(ctx);
  }
}

describe('AutopilotEngineService — T71', () => {
  it('registers jobs from the multi-token and exposes them in the catalogue', () => {
    const prisma = makePrisma();
    const audit = makeAudit();
    const job = new StubJob(async () => ({
      status: 'completed',
      itemsProcessed: 0,
      exceptionsRaised: 0,
    }));
    const engine = new AutopilotEngineService(prisma as any, audit as any, null, [job]);
    expect(engine.size()).toBe(1);
    expect(engine.has('test.job')).toBe(true);
    const catalogue = engine.catalogue();
    expect(catalogue).toHaveLength(1);
    expect(catalogue[0].id).toBe('test.job');
  });

  it('runJob writes a successful run log and returns the JobResult', async () => {
    const prisma = makePrisma();
    const audit = makeAudit();
    const job = new StubJob(async () => ({
      status: 'completed',
      itemsProcessed: 7,
      exceptionsRaised: 0,
    }));
    const engine = new AutopilotEngineService(prisma as any, audit as any, null, [job]);
    const result = await engine.runJob('test.job', 'C1');
    expect(result.status).toBe('completed');
    expect(result.itemsProcessed).toBe(7);
    expect(prisma._runs).toHaveLength(1);
    expect(prisma._runs[0].status).toBe('completed');
    expect(prisma._runs[0].itemsProcessed).toBe(7);
  });

  it('runJob catches thrown errors and writes status=failed without rethrow', async () => {
    const prisma = makePrisma();
    const audit = makeAudit();
    const job = new StubJob(async () => {
      throw new Error('kaboom');
    });
    const engine = new AutopilotEngineService(prisma as any, audit as any, null, [job]);
    const result = await engine.runJob('test.job', 'C1');
    expect(result.status).toBe('failed');
    expect(prisma._runs[0].status).toBe('failed');
    expect(prisma._runs[0].errorMessage).toContain('kaboom');
  });

  it('raiseException persists row and notifies admins for severity high', async () => {
    const prisma = makePrisma();
    const audit = makeAudit();
    const notifs = makeNotifications();
    const engine = new AutopilotEngineService(prisma as any, audit as any, notifs as any, []);
    await engine.raiseException({
      jobId: 'test.job',
      domain: 'sales',
      companyId: 'C1',
      severity: 'high',
      title: 'T',
      description: 'D',
    });
    expect(prisma._exceptions).toHaveLength(1);
    expect(prisma._exceptions[0].severity).toBe('high');
    expect(notifs.dispatch).toHaveBeenCalledTimes(1);
  });

  it('raiseException stays silent for severity low (no notification)', async () => {
    const prisma = makePrisma();
    const audit = makeAudit();
    const notifs = makeNotifications();
    const engine = new AutopilotEngineService(prisma as any, audit as any, notifs as any, []);
    await engine.raiseException({
      jobId: 'test.job',
      domain: 'sales',
      companyId: 'C1',
      severity: 'low',
      title: 'T',
      description: 'D',
    });
    expect(prisma._exceptions).toHaveLength(1);
    expect(notifs.dispatch).not.toHaveBeenCalled();
  });

  it('resolveException flips status to resolved and writes audit', async () => {
    const prisma = makePrisma();
    const audit = makeAudit();
    const engine = new AutopilotEngineService(prisma as any, audit as any, null, []);
    const { id } = await engine.raiseException({
      jobId: 'test.job',
      domain: 'sales',
      companyId: 'C1',
      severity: 'medium',
      title: 'T',
      description: 'D',
    });
    await engine.resolveException('C1', id, 'U1', { ok: true });
    expect(prisma._exceptions[0].status).toBe('resolved');
    expect(audit.log).toHaveBeenCalled();
  });

  it('dismissException flips status to dismissed', async () => {
    const prisma = makePrisma();
    const audit = makeAudit();
    const engine = new AutopilotEngineService(prisma as any, audit as any, null, []);
    const { id } = await engine.raiseException({
      jobId: 'test.job',
      domain: 'sales',
      companyId: 'C1',
      severity: 'medium',
      title: 'T',
      description: 'D',
    });
    await engine.dismissException('C1', id, 'U1', 'not relevant');
    expect(prisma._exceptions[0].status).toBe('dismissed');
  });

  it('dashboard returns counts and a sane resolved ratio', async () => {
    const prisma = makePrisma();
    const audit = makeAudit();
    const engine = new AutopilotEngineService(prisma as any, audit as any, null, []);
    // Seed: 2 pending, 1 resolved.
    await engine.raiseException({
      jobId: 'j', domain: 'sales', companyId: 'C1',
      severity: 'low', title: 't', description: 'd',
    });
    await engine.raiseException({
      jobId: 'j', domain: 'sales', companyId: 'C1',
      severity: 'low', title: 't', description: 'd',
    });
    const r = await engine.raiseException({
      jobId: 'j', domain: 'sales', companyId: 'C1',
      severity: 'low', title: 't', description: 'd',
    });
    await engine.resolveException('C1', r.id, 'U1');
    const dash = await engine.dashboard('C1');
    expect(dash.exceptionsPending).toBe(2);
    expect(dash.exceptionsResolvedRatio).toBeGreaterThan(0);
    expect(dash.exceptionsResolvedRatio).toBeLessThanOrEqual(1);
  });

  it('runJob throws NotFoundException for unknown job ids', async () => {
    const prisma = makePrisma();
    const audit = makeAudit();
    const engine = new AutopilotEngineService(prisma as any, audit as any, null, []);
    await expect(engine.runJob('does.not.exist', 'C1')).rejects.toThrow(/not found/);
  });
});
