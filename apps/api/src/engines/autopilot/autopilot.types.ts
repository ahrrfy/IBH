// ─── T71 — Autonomous Operations Engine: Public Types ──────────────────────
// Shared interfaces between AutopilotEngine, individual AutopilotJob
// implementations, and the manager-facing controller.
//
// F4: every job is a deterministic Tier-3 rule. AI scoring is out of scope
// for the engine itself — individual jobs may consult Tier-2 services later.
// F2/F3: jobs MUST NEVER bypass posting / stock-ledger constraints; they
// delegate to existing services that already enforce double-entry and
// append-only stock movements.

export type AutopilotDomain =
  | 'sales'
  | 'inventory'
  | 'finance'
  | 'hr'
  | 'crm'
  | 'delivery'
  | 'procurement'
  | 'license';

export type AutopilotSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AutopilotJobMeta {
  /** Stable, namespaced id, e.g. 'sales.overdue-reminder'. */
  id: string;
  domain: AutopilotDomain;
  /**
   * Either a 5-field cron expression (`0 9 * * *`) for time-driven jobs, or
   * the literal string `'event-driven'` for jobs activated by domain events.
   */
  schedule: string;
  /** Whether the engine should iterate per-company before invoking execute(). */
  companyScoped: boolean;
  /** Short human-readable label (Arabic). */
  titleAr: string;
  /** Short human-readable label (English). */
  titleEn: string;
  /** Optional description for the catalogue endpoint. */
  description?: string;
}

export interface AutopilotJobContext {
  /** Company being processed (null for global jobs). */
  companyId: string;
  /** When the engine started this run — for run logging. */
  startedAt: Date;
  /** "cron" | "event" | "manual" — informational only. */
  trigger: 'cron' | 'event' | 'manual';
}

export interface AutopilotJobResult {
  status: 'completed' | 'exception_raised' | 'no_op' | 'failed';
  itemsProcessed: number;
  exceptionsRaised: number;
  details?: Record<string, unknown>;
}

export interface AutopilotJob {
  meta: AutopilotJobMeta;
  execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult>;
}

export interface RaiseExceptionInput {
  jobId: string;
  domain: AutopilotDomain;
  companyId: string;
  severity: AutopilotSeverity;
  title: string;
  description: string;
  suggestedAction?: string;
  payload?: Record<string, unknown>;
}
