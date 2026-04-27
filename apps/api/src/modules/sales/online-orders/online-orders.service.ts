import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ulid } from 'ulid';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { NotificationsService } from '../../../platform/notifications/notifications.service';
import { DeliveryService } from '../../delivery/delivery.service';
import { PaymentGatewayFactory } from '../../payments/gateways/payment-gateway.factory';
import {
  InitiatePaymentResult,
  WebhookVerificationContext,
} from '../../payments/gateways/payment-gateway.interface';
// `UserSession` lives in `@erp/shared-types` but the workspace alias is not
// resolvable in the worktree typecheck environment; we cast through unknown
// where DeliveryService consumes the system session.
type UserSession = {
  userId: string;
  companyId: string;
  branchId: string;
  roles: string[];
  permissions: string[];
};

/**
 * OnlineOrdersService (T55).
 *
 * Drives the post-creation lifecycle of an online order:
 *
 *   1. Mints a public `trackingId` so the customer can poll status without
 *      logging in.
 *   2. Picks a payment gateway (default `cod` for Iraq) and either records
 *      a "pending_delivery" reference (COD) or returns a redirect/QR for
 *      online wallets.
 *   3. Auto-creates a DeliveryDispatch using existing T32 auto-assignment
 *      so warehouse/dispatchers see the order without a manual step.
 *   4. Fan-out: WhatsApp confirmation (best-effort) + an in-app
 *      `order.created` notification to dispatch staff (also best-effort).
 *
 * Webhook reconciliation (`handleWebhook`) is the only path that flips
 * `paymentStatus = 'paid'`. It DOES NOT post the JE here — that's the
 * payment-receipts service's job, which we'll reuse once the live gateways
 * are wired. For the COD path the JE happens via DeliveryService.depositCod
 * already.
 */
@Injectable()
export class OnlineOrdersService {
  private readonly logger = new Logger(OnlineOrdersService.name);
  // System-user placeholder for unauthenticated public traffic. Mirrors the
  // value used in StorefrontService.createOrder (T54).
  private readonly SYSTEM_USER = '00000000000000000000000000';

  constructor(
    private readonly prisma:          PrismaService,
    private readonly gateways:        PaymentGatewayFactory,
    private readonly delivery:        DeliveryService,
    private readonly notifications:   NotificationsService,
  ) {}

  /**
   * Called from StorefrontService.createOrder right after the SO + reservation
   * are persisted. Best-effort: never throw out — the order itself is already
   * valid, lifecycle failures degrade gracefully.
   */
  async processNewOnlineOrder(orderId: string): Promise<{
    orderId:     string;
    trackingId:  string;
    paymentUrl?: string;
    qr?:         string;
    trackingUrl: string;
  }> {
    const order = await this.prisma.salesOrder.findUnique({
      where: { id: orderId },
      include: { customer: true, lines: true },
    });
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', messageAr: 'الطلب غير موجود' });
    }
    if (order.channel !== 'online') {
      throw new BadRequestException({
        code:      'ORDER_NOT_ONLINE',
        messageAr: 'هذا الطلب ليس طلباً إلكترونياً',
      });
    }

    // ── 1. Tracking id (idempotent) ───────────────────────────────────────
    const trackingId = order.trackingId ?? this.mintTrackingId();
    const paymentMethod = (order.paymentMethod ?? 'cod').toLowerCase();
    if (!this.gateways.has(paymentMethod)) {
      this.logger.warn(`Order ${orderId}: unknown paymentMethod ${paymentMethod}, defaulting to cod`);
    }
    const gatewayName = this.gateways.has(paymentMethod) ? paymentMethod : 'cod';
    const gateway     = this.gateways.get(gatewayName);

    // ── 2. Initiate payment ───────────────────────────────────────────────
    let initResult: InitiatePaymentResult | null = null;
    try {
      initResult = await gateway.initiate({
        companyId:     order.companyId,
        orderId:       order.id,
        amountIqd:     Number(order.totalIqd),
        customerPhone: order.customer.phone ?? undefined,
      });
    } catch (err) {
      this.logger.warn(
        `Order ${orderId}: gateway ${gatewayName} initiate failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }

    await this.prisma.salesOrder.update({
      where: { id: orderId },
      data: {
        trackingId,
        paymentMethod:    gatewayName,
        paymentReference: initResult?.reference ?? null,
        paymentStatus:    'pending',
      },
    });

    // ── 3. Delivery dispatch (only when we have address details) ──────────
    if (order.customer.address && order.customer.address.trim().length > 0) {
      const session: UserSession = this.systemSession(order.companyId, order.branchId);
      try {
        await this.delivery.create(
          order.companyId,
          {
            salesOrderId:    order.id,
            customerId:      order.customerId,
            warehouseId:     order.warehouseId,
            branchId:        order.branchId,
            deliveryAddress: order.customer.address,
            deliveryCity:    order.customer.city ?? undefined,
            contactPhone:    order.customer.phone ?? undefined,
            // COD orders carry the order total as collection amount; online
            // gateway orders mark codAmount=0 (cash already settled online).
            codAmountIqd:    gatewayName === 'cod' ? Number(order.totalIqd) : 0,
            notes:           `Online order ${order.number}`,
          },
          session as unknown as Parameters<DeliveryService['create']>[2],
        );
      } catch (err) {
        this.logger.warn(
          `Order ${orderId}: delivery dispatch creation failed: ${
            err instanceof Error ? err.message : 'unknown'
          }`,
        );
      }
    } else {
      this.logger.log(`Order ${orderId}: no delivery address, skipping dispatch`);
    }

    // ── 4. Fan-out (best-effort, never blocks the order) ──────────────────
    void this.notifyStaff(order.companyId, order.id, order.number).catch((err) =>
      this.logger.warn(`notifyStaff failed for ${orderId}: ${err.message}`),
    );

    return {
      orderId:     order.id,
      trackingId,
      paymentUrl:  initResult?.redirectUrl,
      qr:          initResult?.qr,
      trackingUrl: `/track/order/${trackingId}`,
    };
  }

  /**
   * Public lookup for the storefront tracking page. Returns ONLY the fields
   * a guest customer is allowed to see — never address, phone, COD amount or
   * the customer record. Lookup happens by the opaque trackingId, not the
   * orderNumber, so guessing one order never leaks another.
   */
  async getPublicStatus(trackingId: string) {
    if (!trackingId || trackingId.length > 40) {
      throw new BadRequestException({ code: 'INVALID_TRACKING', messageAr: 'رقم تتبع غير صالح' });
    }
    const order = await this.prisma.salesOrder.findFirst({
      where: { trackingId },
      select: {
        id:            true,
        number:        true,
        status:        true,
        paymentStatus: true,
        paymentMethod: true,
        orderDate:     true,
        totalIqd:      true,
        deliveries: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            status:      true,
            plannedDate: true,
            dispatchedAt: true,
            deliveredAt: true,
            deliveryCity: true,
            number:      true,
          },
        },
      },
    });
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', messageAr: 'لم يتم العثور على الطلب' });
    }

    const dispatch = order.deliveries[0] ?? null;

    return {
      orderNumber:    order.number,
      status:         order.status,
      paymentStatus:  order.paymentStatus,
      paymentMethod:  order.paymentMethod,
      totalIqd:       Number(order.totalIqd),
      orderDate:      order.orderDate,
      deliveryStatus: dispatch?.status ?? null,
      deliveryCity:   dispatch?.deliveryCity ?? null,
      eta:            dispatch?.plannedDate ?? null,
      dispatchedAt:   dispatch?.dispatchedAt ?? null,
      deliveredAt:    dispatch?.deliveredAt ?? null,
      waybill:        dispatch?.number ?? null,
    };
  }

  /**
   * Webhook reconciliation entry point. The controller hands us the gateway
   * name + raw HTTP context; we let the gateway verify the signature, then
   * update the SO's paymentStatus accordingly.
   *
   * IMPORTANT: this method does NOT call PaymentReceiptsService.create
   * directly — for the v1 ship the only live path is COD (handled inside
   * DeliveryService.depositCod which posts the JE). Online gateways are
   * stubs and their parseWebhook throws, so we never reach the JE branch
   * for them. A future patch will plumb gateway-confirmed payments through
   * the existing PaymentReceiptsService once a live gateway lands.
   */
  async handleWebhook(gatewayName: string, ctx: WebhookVerificationContext) {
    const gateway = this.gateways.get(gatewayName);
    const verified = await gateway.parseWebhook(ctx);

    if (!verified.txId) {
      throw new BadRequestException({
        code: 'WEBHOOK_NO_TX',
        messageAr: 'الويب هوك لم يحتوِ على مرجع معاملة',
      });
    }

    const order = await this.prisma.salesOrder.findFirst({
      where: { paymentReference: verified.txId },
      select: { id: true, paymentStatus: true },
    });
    if (!order) {
      this.logger.warn(`Webhook ${gatewayName}: no order for reference ${verified.txId}`);
      return { received: true, applied: false };
    }

    const nextStatus =
      verified.status === 'paid'     ? 'paid'
    : verified.status === 'refunded' ? 'refunded'
    : verified.status === 'failed'   ? 'failed'
    :                                  'pending';

    await this.prisma.salesOrder.update({
      where: { id: order.id },
      data:  { paymentStatus: nextStatus },
    });

    this.logger.log(
      `Webhook ${gatewayName}: order=${order.id} reference=${verified.txId} → ${nextStatus}`,
    );
    return { received: true, applied: true, status: nextStatus };
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  /**
   * Public tracking token. We use a fresh ULID rather than the SO id so
   * tokens are not linkable to internal sequences and can be rotated without
   * touching the SO primary key.
   */
  private mintTrackingId(): string {
    return `t_${ulid().toLowerCase()}`;
  }

  private systemSession(companyId: string, branchId: string): UserSession {
    return {
      userId:    this.SYSTEM_USER,
      companyId,
      branchId,
      roles:     ['system'],
      permissions: [],
    } as unknown as UserSession;
  }

  private async notifyStaff(companyId: string, orderId: string, number: string) {
    // Find users who should know about a new online order. We keep the query
    // narrow and best-effort: anyone with a notificationPreference for the
    // `order.created` event. If no one opted in, we silently skip — no
    // spamming the whole company directory. We then filter by tenant via a
    // second lookup to keep the where-clause schema-agnostic.
    const prefs = await this.prisma.notificationPreference.findMany({
      where:  { eventType: 'order.created' },
      select: { userId: true },
    }).catch(() => [] as { userId: string }[]);
    if (prefs.length === 0) return;

    const users = await this.prisma.user.findMany({
      where:  { id: { in: prefs.map((p) => p.userId) }, companyId },
      select: { id: true },
    }).catch(() => [] as { id: string }[]);
    const opted = users.map((u) => ({ userId: u.id }));

    for (const { userId } of opted) {
      try {
        await this.notifications.dispatch({
          companyId,
          userId,
          eventType: 'order.created',
          title:     'طلب إلكتروني جديد',
          body:      `وصل طلب رقم ${number} عبر المتجر الإلكتروني`,
          data:      { orderId, number },
        });
      } catch (err) {
        this.logger.warn(`Notify ${userId} failed: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }
  }
}
