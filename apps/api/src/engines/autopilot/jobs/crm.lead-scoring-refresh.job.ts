import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

// ─── T71 Job: crm.lead-scoring-refresh ──────────────────────────────────────
// Cron: 02:00 UTC daily.
// Goal: Recompute a deterministic rule-based score for every open lead so
// that sales reps can prioritise outreach without manual sorting.
//
// Scoring rules (Tier-3: no AI, no ML):
//   +10  — lead has a phone number
//   +10  — lead has an email address
//   +20  — at least one activity in the last 7 days (hot lead)
//   +10  — at least one activity in the last 30 days (warm lead)
//   +15  — source = 'referral'
//   +2   — per activity recorded (max +20 bonus cap)
//
// The score is written to Lead.score (INT 0-100 soft cap in DB, no hard constraint).
// Leads with status 'converted', 'lost', or 'closed' are skipped.

const OPEN_LEAD_STATUSES_EXCLUDED = ['converted', 'lost', 'closed'];
const BATCH_SIZE = 200;
const SCORE_ACTIVITY_CAP = 20;

@Injectable()
export class CrmLeadScoringRefreshJob implements AutopilotJob {
  private readonly logger = new Logger(CrmLeadScoringRefreshJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'crm.lead-scoring-refresh',
    domain: 'crm',
    schedule: '0 2 * * *',
    companyScoped: true,
    titleAr: 'تحديث تقييم العملاء المحتملين',
    titleEn: 'Lead Scoring Refresh',
    description:
      'Daily 02:00 sweep — recomputes a rule-based score for every open lead ' +
      'so sales reps have a ranked list for next-day outreach.',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let cursor: string | undefined;
    let totalProcessed = 0;

    // Paginate to handle large datasets without loading everything into memory.
    for (;;) {
      const leads = await this.prisma.lead.findMany({
        where: {
          companyId: ctx.companyId,
          status: { notIn: OPEN_LEAD_STATUSES_EXCLUDED as any[] },
        },
        select: {
          id: true,
          phone: true,
          email: true,
          source: true,
          activities: {
            select: { id: true, createdAt: true },
          },
        },
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      });

      if (leads.length === 0) break;
      cursor = leads[leads.length - 1]!.id;

      // Compute and persist score for each lead in this page.
      for (const lead of leads) {
        const score = this.computeScore(lead, sevenDaysAgo, thirtyDaysAgo);

        try {
          await this.prisma.lead.update({
            where: { id: lead.id },
            data: { score },
          });
          totalProcessed++;
        } catch (err) {
          this.logger.warn(
            `[crm.lead-scoring-refresh] failed to update lead=${lead.id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }

      // Stop if we received fewer rows than the batch size (last page).
      if (leads.length < BATCH_SIZE) break;
    }

    this.logger.log(
      `[crm.lead-scoring-refresh] company=${ctx.companyId} — updated ${totalProcessed} leads`,
    );

    return {
      status: 'completed',
      itemsProcessed: totalProcessed,
      exceptionsRaised: 0,
      details: { leadsRescored: totalProcessed },
    };
  }

  /**
   * Rule-based lead score calculation.
   * Returns an integer 0–100 (soft cap — no hard DB constraint).
   *
   * @param lead           - Lead with phone, email, source, and activities
   * @param sevenDaysAgo   - Cutoff for "hot" activity (last 7 days)
   * @param thirtyDaysAgo  - Cutoff for "warm" activity (last 30 days)
   */
  private computeScore(
    lead: {
      phone: string | null;
      email: string | null;
      source: string | null;
      activities: Array<{ id: string; createdAt: Date }>;
    },
    sevenDaysAgo: Date,
    thirtyDaysAgo: Date,
  ): number {
    let score = 0;

    // Contact completeness
    if (lead.phone) score += 10;
    if (lead.email) score += 10;

    // Referral source bonus
    if (lead.source === 'referral') score += 15;

    // Activity recency bonus
    const hasHotActivity = lead.activities.some(
      (a) => a.createdAt >= sevenDaysAgo,
    );
    const hasWarmActivity = lead.activities.some(
      (a) => a.createdAt >= thirtyDaysAgo,
    );
    if (hasHotActivity) {
      score += 20;
    } else if (hasWarmActivity) {
      score += 10;
    }

    // Activity count bonus (capped at +20)
    const activityBonus = Math.min(lead.activities.length * 2, SCORE_ACTIVITY_CAP);
    score += activityBonus;

    return Math.min(score, 100);
  }
}
