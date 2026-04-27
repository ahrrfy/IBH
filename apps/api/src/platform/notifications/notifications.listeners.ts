import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from './notifications.service';

/**
 * Bridges select domain events to the notification engine (T46).
 *
 * Listeners are intentionally narrow: each one extracts the minimal payload
 * it needs and calls `NotificationsService.dispatch()`. If the source event
 * isn't being emitted yet by its owning module, the listener simply never
 * fires — no manufactured events.
 *
 * Expected payload shape on each event:
 *   { companyId, userId, ...event-specific fields }
 *
 * Where `userId` is the user that should receive the notification (often the
 * branch manager / accountant rather than the actor that triggered the event).
 */
interface InvoiceOverduePayload {
  companyId: string;
  userId: string;
  invoiceId: string;
  invoiceNumber?: string;
  amount?: number;
  daysOverdue?: number;
}

interface StockLowPayload {
  companyId: string;
  userId: string;
  variantId: string;
  productNameAr?: string;
  warehouseId?: string;
  qty?: number;
}

interface DeliveryStatusChangedPayload {
  companyId: string;
  userId: string;
  deliveryId: string;
  status: string;
  orderId?: string;
}

@Injectable()
export class NotificationListeners {
  private readonly logger = new Logger(NotificationListeners.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent('invoice.overdue', { async: true, promisify: true })
  async onInvoiceOverdue(p: InvoiceOverduePayload): Promise<void> {
    if (!p?.companyId || !p?.userId) return;
    await this.safeDispatch({
      companyId: p.companyId,
      userId: p.userId,
      eventType: 'invoice.overdue',
      title: 'فاتورة متأخرة السداد',
      body: p.invoiceNumber
        ? `الفاتورة ${p.invoiceNumber} متأخرة${
            p.daysOverdue ? ` بـ ${p.daysOverdue} يوم` : ''
          }`
        : 'لديك فاتورة متأخرة السداد',
      data: { ...p },
    });
  }

  @OnEvent('stock.low', { async: true, promisify: true })
  async onStockLow(p: StockLowPayload): Promise<void> {
    if (!p?.companyId || !p?.userId) return;
    await this.safeDispatch({
      companyId: p.companyId,
      userId: p.userId,
      eventType: 'stock.low',
      title: 'مخزون منخفض',
      body: p.productNameAr
        ? `المنتج ${p.productNameAr} وصل لحد إعادة الطلب`
        : 'أحد المنتجات وصل لحد إعادة الطلب',
      data: { ...p },
    });
  }

  @OnEvent('delivery.status.changed', { async: true, promisify: true })
  async onDeliveryStatusChanged(
    p: DeliveryStatusChangedPayload,
  ): Promise<void> {
    if (!p?.companyId || !p?.userId) return;
    await this.safeDispatch({
      companyId: p.companyId,
      userId: p.userId,
      eventType: 'delivery.status.changed',
      title: 'تحديث حالة التوصيل',
      body: `تغيرت حالة التوصيل إلى: ${p.status}`,
      data: { ...p },
    });
  }

  private async safeDispatch(
    args: Parameters<NotificationsService['dispatch']>[0],
  ): Promise<void> {
    try {
      await this.notifications.dispatch(args);
    } catch (err) {
      this.logger.warn(
        `dispatch failed for ${args.eventType}/${args.userId}: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
    }
  }
}
