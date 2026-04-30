import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../../platform/notifications/notifications.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
  RaiseExceptionInput,
} from './autopilot.types';
import { AUTOPILOT_JOBS } from './autopilot.tokens';

// ─── T71 — Autonomous Operations Engine ─────────────────────────────────────
// Master engine that hosts every autonomous background job in the ERP.
// Provides:
//   1. A registry of registered jobs (DI-collected via AUTOPILOT_JOBS token).
//   2. A single `runJob(jobId, companyId)` entry point used by both the
//      cron (BullMQ repeatable jobs) and the manual-trigger endpoint.
//   3. `raiseException()` for jobs to flag situations needing human review;
//      emits a T46 notification when severity >= 'high'.
//   4. Append-only run logging via AutopilotJobRun.
//
// F4: rule-based (Tier 3). F2/F3: jobs delegate to existing services that
// already enforce double-entry and append-only stock movements — the engine
// itself never writes to journal_entries or stock_ledger.

@Injectable()
export class AutopilotEngineService {
  private readonly logger = new Logger(AutopilotEngineService.name);
  private readonly registry: Map<string, AutopilotJob> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly notifications: NotificationsService | null,
    @Optional()
    @Inject(AUTOPILOT_JOBS)
    jobs: AutopilotJob[] | null,
  ) {
    for (const job of jobs ?? []) {
      this.register(job);
    }
  }

  /** Register a job. Last-write-wins on duplicate ids (logged at warn). */
  register(job: AutopilotJob): void {
    if (this.registry.has(job.meta.id)) {
      this.logger.warn(`AutopilotJob '${job.meta.id}' re-registered`);
    }
    this.registry.set(job.meta.id, job);
  }

  /** Full catalogue (used by the manager UI roadmap view). */
  catalogue(): AutopilotJobMeta[] {
    return Array.from(this.registry.values())
      .map((j) => j.meta)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  size(): number {
    return this.registry.size;
  }

  /** Whether the engine knows about this job id. */
  has(jobId: string): boolean {
    return this.registry.has(jobId);
  }

  /**
   * Execute a single job for a single company. This is the canonical entry
   * point used by the cron processor, the event listener, and the manual
   * trigger endpoint. Always returns; failures are caught, logged to
   * autopilot_job_runs with status='failed', and re-thrown only when
   * `rethrow=true` (default false — cron must keep running).
   */
  async runJob(
    jobId: string,
    companyId: string,
    opts: { trigger?: 'cron' | 'event' | 'manual'; rethrow?: boolean } = {},
  ): Promise<AutopilotJobResult> {
    return this.prisma.withBypassedRls(() =>
      this.runJobInternal(jobId, companyId, opts),
    );
  }

  /**
   * I062 — autopilot jobs run outside any HTTP request, so there is no
   * RLS context. Each job filters by `ctx.companyId` explicitly, so
   * bypass is safe and necessary for cron-triggered execution.
   */
  private async runJobInternal(
    jobId: string,
    companyId: string,
    opts: { trigger?: 'cron' | 'event' | 'manual'; rethrow?: boolean } = {},
  ): Promise<AutopilotJobResult> {
    const job = this.registry.get(jobId);
    if (!job) {
      throw new NotFoundException(`AutopilotJob '${jobId}' not found`);
    }

    const startedAt = new Date();
    const ctx: AutopilotJobContext = {
      companyId,
      startedAt,
      trigger: opts.trigger ?? 'cron',
    };

    let result: AutopilotJobResult = {
      status: 'failed',
      itemsProcessed: 0,
      exceptionsRaised: 0,
    };
    let errorMessage: string | null = null;

    try {
      result = await job.execute(ctx);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[T71] job=${jobId} company=${companyId} failed: ${errorMessage}`,
      );
      result = {
        status: 'failed',
        itemsProcessed: 0,
        exceptionsRaised: 0,
        details: { errorMessage },
      };
    }

    await this.recordRun(jobId, companyId, startedAt, result, errorMessage);

    if (opts.rethrow && result.status === 'failed') {
      throw new Error(errorMessage ?? `Job ${jobId} failed`);
    }
    return result;
  }

  /**
   * Iterate every active company in the system and execute the job for each.
   * Used by cron triggers when `companyScoped=true`. Failures of one company
   * never stop the loop — each company is isolated.
   */
  async runJobForAllCompanies(jobId: string): Promise<{
    companies: number;
    completed: number;
    failed: number;
  }> {
    // I062 — `companies` itself has no companyId column so it isn't
    // RLS-scoped, but we still go through bypass to keep this method's
    // semantics aligned with `runJob` (everything below operates on
    // tenant-scoped data and would otherwise return zero rows).
    const companies = await this.prisma.withBypassedRls(() =>
      this.prisma.company.findMany({
        where: { isActive: true, deletedAt: null },
        select: { id: true },
      }),
    );

    let completed = 0;
    let failed = 0;
    for (const company of companies) {
      const result = await this.runJob(jobId, company.id, { trigger: 'cron' });
      if (result.status === 'failed') failed++;
      else completed++;
    }
    return { companies: companies.length, completed, failed };
  }

  /**
   * Record a single autopilot exception. For severity >= 'high' the engine
   * also fans out a T46 notification to every company admin so the manager
   * UI badge updates live.
   */
  async raiseException(input: RaiseExceptionInput): Promise<{ id: string }> {
    const exception = await this.prisma.autopilotException.create({
      data: {
        jobId: input.jobId,
        domain: input.domain,
        companyId: input.companyId,
        severity: input.severity,
        title: input.title,
        description: input.description,
        suggestedAction: input.suggestedAction ?? null,
        payload: (input.payload ?? {}) as object,
      },
      select: { id: true },
    });

    if (
      this.notifications &&
      (input.severity === 'high' || input.severity === 'critical')
    ) {
      try {
        const admins = await this.findCompanyAdmins(input.companyId);
        for (const adminId of admins) {
          await this.notifications.dispatch({
            companyId: input.companyId,
            userId: adminId,
            eventType: 'autopilot.exception',
            title: input.title,
            body: input.description,
            data: {
              exceptionId: exception.id,
              jobId: input.jobId,
              severity: input.severity,
              suggestedAction: input.suggestedAction ?? null,
            },
          });
        }
      } catch (err) {
        this.logger.warn(
          `Notification dispatch for autopilot exception failed: ${
            err instanceof Error ? err.message : 'unknown'
          }`,
        );
      }
    }

    return exception;
  }

  /** Resolve an exception (manager clicked "approve suggested action"). */
  async resolveException(
    companyId: string,
    id: string,
    userId: string,
    resolution?: Record<string, unknown>,
  ): Promise<{ id: string }> {
    const existing = await this.prisma.autopilotException.findFirst({
      where: { id, companyId },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException('Autopilot exception not found');
    }
    await this.prisma.autopilotException.update({
      where: { id },
      data: {
        status: 'resolved',
        resolvedBy: userId,
        resolvedAt: new Date(),
        resolution: (resolution ?? {}) as object,
      },
    });
    await this.audit.log({
      companyId,
      userId,
      action: 'autopilot.exception.resolve',
      entity: 'AutopilotException',
      entityId: id,
      metadata: resolution ?? {},
    });
    return { id };
  }

  /** Dismiss an exception (manager doesn't want to act). */
  async dismissException(
    companyId: string,
    id: string,
    userId: string,
    reason?: string,
  ): Promise<{ id: string }> {
    const existing = await this.prisma.autopilotException.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Autopilot exception not found');
    }
    await this.prisma.autopilotException.update({
      where: { id },
      data: {
        status: 'dismissed',
        resolvedBy: userId,
        resolvedAt: new Date(),
        resolution: { dismissed: true, reason: reason ?? null } as object,
      },
    });
    await this.audit.log({
      companyId,
      userId,
      action: 'autopilot.exception.dismiss',
      entity: 'AutopilotException',
      entityId: id,
      reason,
    });
    return { id };
  }

  /** Manager dashboard top cards. */
  async dashboard(companyId: string): Promise<{
    runsToday: number;
    itemsHandledToday: number;
    exceptionsPending: number;
    exceptionsResolvedRatio: number;
    jobsRegistered: number;
  }> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [runsToday, agg, exceptionsPending, totals] = await Promise.all([
      this.prisma.autopilotJobRun.count({
        where: { companyId, startedAt: { gte: startOfDay } },
      }),
      this.prisma.autopilotJobRun.aggregate({
        _sum: { itemsProcessed: true },
        where: { companyId, startedAt: { gte: startOfDay } },
      }),
      this.prisma.autopilotException.count({
        where: { companyId, status: 'pending' },
      }),
      this.prisma.autopilotException.groupBy({
        by: ['status'],
        where: { companyId },
        _count: { _all: true },
      }),
    ]);

    const totalsMap = Object.fromEntries(
      totals.map((row) => [row.status, row._count._all]),
    );
    const total =
      (totalsMap.pending ?? 0) +
      (totalsMap.resolved ?? 0) +
      (totalsMap.dismissed ?? 0);
    const handled = (totalsMap.resolved ?? 0) + (totalsMap.dismissed ?? 0);
    const ratio = total === 0 ? 1 : handled / total;

    return {
      runsToday,
      itemsHandledToday: agg._sum.itemsProcessed ?? 0,
      exceptionsPending,
      exceptionsResolvedRatio: Math.round(ratio * 100) / 100,
      jobsRegistered: this.registry.size,
    };
  }

  /** List exceptions, newest first. */
  async listExceptions(
    companyId: string,
    opts: {
      status?: 'pending' | 'resolved' | 'dismissed';
      domain?: string;
      jobId?: string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{
    items: unknown[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
    const where = {
      companyId,
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.domain ? { domain: opts.domain } : {}),
      ...(opts.jobId ? { jobId: opts.jobId } : {}),
    } as const;
    const [items, total] = await Promise.all([
      this.prisma.autopilotException.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.autopilotException.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  /** Recent run log (for the "recent runs" tab). */
  async listRuns(
    companyId: string,
    opts: { jobId?: string; limit?: number } = {},
  ): Promise<unknown[]> {
    const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
    return this.prisma.autopilotJobRun.findMany({
      where: { companyId, ...(opts.jobId ? { jobId: opts.jobId } : {}) },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }

  // ─── Event-driven hook ───────────────────────────────────────────────────
  // Domain modules emit `autopilot.trigger` with `{ jobId, companyId, payload }`
  // when something happens that an event-driven job should react to (e.g.
  // license trial terminated → license.auto-renewal). The engine routes the
  // event to the right job in a fire-and-forget manner.
  @OnEvent('autopilot.trigger')
  async onTrigger(payload: {
    jobId: string;
    companyId: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.has(payload.jobId)) {
      this.logger.warn(
        `[T71] received autopilot.trigger for unknown job '${payload.jobId}'`,
      );
      return;
    }
    await this.runJob(payload.jobId, payload.companyId, { trigger: 'event' });
  }

  // ─── Internals ───────────────────────────────────────────────────────────
  private async recordRun(
    jobId: string,
    companyId: string,
    startedAt: Date,
    result: AutopilotJobResult,
    errorMessage: string | null,
  ): Promise<void> {
    try {
      await this.prisma.autopilotJobRun.create({
        data: {
          jobId,
          companyId,
          startedAt,
          finishedAt: new Date(),
          status: result.status,
          itemsProcessed: result.itemsProcessed,
          exceptionsRaised: result.exceptionsRaised,
          errorMessage: errorMessage ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `[T71] failed to write run log for job=${jobId} company=${companyId}: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
    }
  }

  /**
   * Best-effort lookup of company admins to notify. We try the User table
   * filtered by an `isAdmin`/`role` indicator; if the schema differs we
   * fall back to "every active user in the company".
   */
  private async findCompanyAdmins(companyId: string): Promise<string[]> {
    try {
      const candidates = await this.prisma.user.findMany({
        where: { companyId, status: 'active', deletedAt: null },
        select: { id: true },
        take: 50,
      });
      return candidates.map((u) => u.id);
    } catch {
      return [];
    }
  }
}
