import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import type { Queue } from 'bull';
import { AutopilotEngineService } from './autopilot.service';

// ─── T71 — Autopilot Scheduler ──────────────────────────────────────────────
// Wires every cron-scheduled AutopilotJob onto a single BullMQ repeatable
// job. We chose a single shared queue (vs one queue per job) because:
//   * BullMQ repeatables are keyed by (name, cron) — collisions are detected;
//   * a single processor keeps the worker concurrency contract simple;
//   * job ids (e.g. 'sales.overdue-reminder') are passed as the bull job
//     `name` and surfaced in the run log without extra plumbing.
//
// Event-driven jobs (schedule === 'event-driven') are NOT registered here —
// they wait for an `autopilot.trigger` event handled by the engine.

export const AUTOPILOT_QUEUE = 'autopilot:scheduler';

interface BullJob<T> {
  name: string;
  data: T;
}

interface RepeatablePayload {
  jobId: string;
}

@Injectable()
export class AutopilotScheduler implements OnModuleInit {
  private readonly logger = new Logger(AutopilotScheduler.name);

  constructor(
    private readonly engine: AutopilotEngineService,
    @InjectQueue(AUTOPILOT_QUEUE) private readonly queue: Queue,
  ) {}

  /**
   * On module init, register every cron-scheduled job as a BullMQ repeatable.
   * Existing repeatables with the same id are removed first so cron-string
   * changes between deployments take effect.
   */
  async onModuleInit(): Promise<void> {
    console.log(`[BOOT] ${new Date().toISOString()} AutopilotScheduler.onModuleInit start`);
    // I046 — emergency disable for incident recovery. Set AUTOPILOT_DISABLED=1
    // in the api .env to skip the 50-job registration loop while we triage
    // a bootstrap hang. Existing repeatables stay scheduled in Redis until
    // a healthy boot reconciles them, so this is safe for short-term use.
    if (process.env.AUTOPILOT_DISABLED === '1') {
      console.log(`[BOOT] ${new Date().toISOString()} AutopilotScheduler skipped (AUTOPILOT_DISABLED=1)`);
      return;
    }
    let registered = 0;
    const meta = this.engine.catalogue();
    console.log(`[BOOT] ${new Date().toISOString()} AutopilotScheduler.onModuleInit catalogue=${meta.length} jobs`);

    // Best-effort cleanup of stale repeatables (cron strings that changed
    // between deploys). We match by job name; any repeatable whose name is
    // no longer in the catalogue or whose cron string has changed is removed.
    try {
      const existing = await this.queue.getRepeatableJobs();
      for (const rep of existing) {
        const match = meta.find((m) => m.id === rep.name);
        if (!match || match.schedule !== rep.cron) {
          await this.queue.removeRepeatableByKey(rep.key).catch(() => {});
        }
      }
    } catch (err) {
      // Redis may not be available in unit tests — log and continue without
      // scheduling so other DI consumers can still resolve the engine.
      this.logger.warn(
        `[T71] could not enumerate existing repeatables: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
      return;
    }

    for (const job of meta) {
      if (job.schedule === 'event-driven') continue;
      try {
        await this.queue.add(
          job.id,
          { jobId: job.id } satisfies RepeatablePayload,
          {
            repeat: { cron: job.schedule },
            removeOnComplete: 200,
            removeOnFail: 50,
            jobId: `repeat:${job.id}`,
          },
        );
        registered++;
      } catch (err) {
        this.logger.warn(
          `[T71] failed to schedule '${job.id}': ${
            err instanceof Error ? err.message : 'unknown'
          }`,
        );
      }
    }

    console.log(`[BOOT] ${new Date().toISOString()} AutopilotScheduler.onModuleInit done registered=${registered}`);
    this.logger.log(`[T71] registered ${registered} cron-scheduled jobs`);
  }
}

@Processor(AUTOPILOT_QUEUE)
export class AutopilotProcessor {
  private readonly logger = new Logger(AutopilotProcessor.name);

  constructor(private readonly engine: AutopilotEngineService) {}

  /**
   * Process tick. The bull `name` is the autopilot job id. We fan the tick
   * across every active company; per-company failures are isolated by the
   * engine's `runJob`.
   */
  @Process()
  async handle(job: BullJob<RepeatablePayload>): Promise<void> {
    const jobId = job.data?.jobId ?? job.name;
    if (!this.engine.has(jobId)) {
      this.logger.warn(`[T71] tick for unknown job '${jobId}'`);
      return;
    }
    const result = await this.engine.runJobForAllCompanies(jobId);
    this.logger.log(
      `[T71] tick=${jobId} companies=${result.companies} ` +
        `completed=${result.completed} failed=${result.failed}`,
    );
  }
}
