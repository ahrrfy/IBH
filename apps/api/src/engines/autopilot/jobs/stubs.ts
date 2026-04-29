import { Injectable } from '@nestjs/common';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

// ─── T71 — Scaffolded Job Roadmap ───────────────────────────────────────────
// Each entry below is a placeholder for one of the 47 remaining autonomous
// jobs in the T71 catalogue. They register their metadata so the manager UI
// can render the full roadmap (and the `/autopilot/catalogue` endpoint
// returns the complete list), but `execute()` raises NotImplementedError —
// implement each one in a follow-up PR using the same contract as the three
// reference jobs (sales.overdue-reminder, inventory.auto-reorder,
// license.auto-renewal).
//
// All scheduling here is *intentional*: each cron string was chosen to spread
// load across the 24h cycle and to honor business meaning (e.g. reports go
// out Sunday morning, settlements run after midnight). When a stub is
// implemented for real, simply replace the class body — the schedule and
// id stay stable so existing run-history queries keep working.

class NotImplementedError extends Error {
  constructor(jobId: string) {
    super(`scaffold — implement in follow-up (job=${jobId})`);
    this.name = 'NotImplementedError';
  }
}

interface StubSpec {
  meta: AutopilotJobMeta;
}

// All 50 jobs are now fully implemented — stubs list is empty.
// Each job has its own dedicated file in this directory.
const SCAFFOLDS: StubSpec[] = [];

@Injectable()
export class AutopilotJobScaffolds {
  /**
   * Returns one AutopilotJob per scaffold spec. Each job's `execute()` throws
   * a NotImplementedError so the engine logs a clean failure row in
   * autopilot_job_runs without polluting business data.
   */
  buildAll(): AutopilotJob[] {
    return SCAFFOLDS.map((spec) => ({
      meta: spec.meta,
      execute: async (
        _ctx: AutopilotJobContext,
      ): Promise<AutopilotJobResult> => {
        throw new NotImplementedError(spec.meta.id);
      },
    }));
  }

  count(): number {
    return SCAFFOLDS.length;
  }
}
