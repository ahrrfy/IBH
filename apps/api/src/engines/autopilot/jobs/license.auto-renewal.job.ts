import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AutopilotEngineService } from '../autopilot.service';
import {
  AutopilotJob,
  AutopilotJobContext,
  AutopilotJobMeta,
  AutopilotJobResult,
} from '../autopilot.types';

// ─── T71 Job: license.auto-renewal ──────────────────────────────────────────
// Trigger: event-driven on `license.trial.terminated` (any module fires this
// event when a Subscription transitions out of `trial`). The engine routes
// the event to this job via `AutopilotEngineService.onTrigger`.
//
// Goal: when the company has a stored payment method, attempt to extend the
// subscription period in-place; otherwise raise an exception so an admin can
// reach out for billing details.
//
// F2: this job NEVER posts journal entries. The actual revenue recognition
// for a renewal happens in the existing finance module (Wave 4) when payment
// settlement is confirmed — autopilot only flips the subscription status.

@Injectable()
export class LicenseAutoRenewalJob implements AutopilotJob {
  private readonly logger = new Logger(LicenseAutoRenewalJob.name);

  readonly meta: AutopilotJobMeta = {
    id: 'license.auto-renewal',
    domain: 'license',
    schedule: 'event-driven',
    companyScoped: true,
    titleAr: 'تجديد الاشتراك التلقائي',
    titleEn: 'License Auto-Renewal',
    description:
      'Event-driven on license.trial.terminated — auto-extends subscriptions with stored payment method; raises an exception otherwise.',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutopilotEngineService,
  ) {}

  async execute(ctx: AutopilotJobContext): Promise<AutopilotJobResult> {
    // Find the trial subscription that just terminated (or any expired/grace
    // subscription) for this company. We pick the most recent matching row.
    const sub = await this.prisma.subscription.findFirst({
      where: {
        companyId: ctx.companyId,
        status: { in: ['trial', 'expired', 'grace'] },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        status: true,
        billingCycle: true,
        trialEndsAt: true,
        currentPeriodEndAt: true,
        priceIqd: true,
      },
    });

    if (!sub) {
      return {
        status: 'no_op',
        itemsProcessed: 0,
        exceptionsRaised: 0,
      };
    }

    // We don't yet have a stored-payment-method table; for the foreseeable
    // future this is "no payment on file" so we always escalate. The interface
    // is kept ready for when the billing module lands a payment-method store.
    const hasStoredPayment = false;

    if (!hasStoredPayment) {
      await this.engine.raiseException({
        jobId: this.meta.id,
        domain: 'license',
        companyId: ctx.companyId,
        severity: 'critical',
        title: 'انتهاء التجربة — يلزم تجديد يدوي',
        description: `اشتراك الشركة في حالة ${sub.status} ولا توجد طريقة دفع محفوظة. مطلوب تواصل مع العميل لإكمال التجديد.`,
        suggestedAction: 'التواصل مع العميل وتفعيل خطة مدفوعة',
        payload: {
          subscriptionId: sub.id,
          billingCycle: sub.billingCycle,
          priceIqd: Number(sub.priceIqd),
          trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
        },
      });

      return {
        status: 'exception_raised',
        itemsProcessed: 0,
        exceptionsRaised: 1,
        details: { subscriptionId: sub.id, reason: 'no_stored_payment' },
      };
    }

    // Future path: when stored-payment exists, extend the subscription in
    // place and emit a domain event so the finance module posts the entry.
    // For now this branch is unreachable; once the payment-method store
    // lands, replace `hasStoredPayment` above with the actual lookup.
    return {
      status: 'completed',
      itemsProcessed: 1,
      exceptionsRaised: 0,
      details: { subscriptionId: sub.id, autoRenewed: true },
    };
  }
}
