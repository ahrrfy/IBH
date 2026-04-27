/**
 * T45 — Omnichannel Order Inbox service.
 *
 * Receives normalized inbound messages from messaging channels (WhatsApp,
 * Facebook, Instagram), extracts intent (Tier 3), drafts a sales order when
 * confidence ≥ 0.6, and supports human approve/reject workflows.
 *
 * Approve creates a real SalesOrder using the existing SalesOrdersService
 * (so all stock-reservation, credit-check, audit and posting flows kick in).
 */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { UserSession } from '@erp/shared-types';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { SalesOrdersService } from '../orders/sales-orders.service';
import { IntentExtractorService } from './intent-extractor.service';
import { emitRealtime } from '../../../platform/realtime/emit-realtime';

export type OmnichannelStatus = 'new' | 'drafted' | 'approved' | 'rejected' | 'spam';
export type OmnichannelChannel = 'whatsapp' | 'facebook' | 'instagram';

export interface IngestInput {
  companyId: string;
  channel: OmnichannelChannel;
  externalId: string;
  fromHandle: string;
  body: string;
}

export interface ApproveInput {
  customerId: string;
  warehouseId: string;
  items?: Array<{ variantId: string; qty: number; unitPriceIqd: number }>;
  notes?: string;
}

const DRAFT_THRESHOLD = 0.6;

@Injectable()
export class OmnichannelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly extractor: IntentExtractorService,
    private readonly salesOrders: SalesOrdersService,
  ) {}

  /**
   * Idempotent message ingestion. If (channel, externalId) was already
   * recorded, returns the existing row unchanged.
   */
  async ingestMessage(input: IngestInput) {
    const existing = await this.prisma.omnichannelMessage.findUnique({
      where: { channel_externalId: { channel: input.channel, externalId: input.externalId } },
    });
    if (existing) return existing;

    const intent = await this.extractor.extract(input.companyId, input.body);

    const created = await this.prisma.$transaction(async (tx) => {
      const msg = await tx.omnichannelMessage.create({
        data: {
          companyId:   input.companyId,
          channel:     input.channel,
          externalId:  input.externalId,
          fromHandle:  input.fromHandle,
          body:        input.body,
          status:      'new',
          processedAt: new Date(),
        },
      });
      if (intent.confidence >= DRAFT_THRESHOLD && intent.items.length > 0) {
        const draft = await tx.omnichannelDraftOrder.create({
          data: {
            messageId:  msg.id,
            items:      intent.items as unknown as Prisma.InputJsonValue,
            confidence: intent.confidence,
          },
        });
        return tx.omnichannelMessage.update({
          where: { id: msg.id },
          data:  { status: 'drafted', draftOrderId: draft.id },
        });
      }
      return msg;
    });

    emitRealtime(this.events, 'omnichannel.message.received', {
      companyId: input.companyId,
      messageId: created.id,
      channel:   created.channel,
      status:    created.status,
    });

    return created;
  }

  async findAll(
    companyId: string,
    opts: { page?: number; limit?: number; status?: OmnichannelStatus; channel?: OmnichannelChannel } = {},
  ) {
    const page  = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 50, 200);
    const where: Prisma.OmnichannelMessageWhereInput = { companyId };
    if (opts.status)  where.status  = opts.status;
    if (opts.channel) where.channel = opts.channel;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.omnichannelMessage.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { receivedAt: 'desc' },
        include: { draftOrder: true },
      }),
      this.prisma.omnichannelMessage.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async findOne(id: string, companyId: string) {
    const m = await this.prisma.omnichannelMessage.findFirst({
      where: { id, companyId },
      include: { draftOrder: true },
    });
    if (!m) {
      throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'الرسالة غير موجودة' });
    }
    return m;
  }

  async approveDraft(id: string, companyId: string, dto: ApproveInput, session: UserSession) {
    const msg = await this.findOne(id, companyId);
    if (msg.status === 'approved') {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', messageAr: 'تمت الموافقة مسبقاً' });
    }
    if (msg.status === 'rejected') {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', messageAr: 'الرسالة مرفوضة' });
    }
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'يجب إضافة بند واحد على الأقل',
      });
    }

    const order = await this.salesOrders.create(
      companyId,
      {
        customerId:  dto.customerId,
        warehouseId: dto.warehouseId,
        channel:     'online',
        notes:       dto.notes ?? `Omnichannel ${msg.channel} · ${msg.fromHandle}`,
        lines: dto.items.map((i) => ({
          variantId:    i.variantId,
          qty:          i.qty,
          unitPriceIqd: i.unitPriceIqd,
        })),
      },
      session,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      if (msg.draftOrderId) {
        await tx.omnichannelDraftOrder.update({
          where: { id: msg.draftOrderId },
          data: {
            customerId: dto.customerId,
            items: dto.items as unknown as Prisma.InputJsonValue,
            approvedAt: new Date(),
          },
        });
      }
      return tx.omnichannelMessage.update({
        where: { id: msg.id },
        data:  { status: 'approved', processedAt: new Date() },
      });
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      action: 'omnichannel.approve',
      entityType: 'OmnichannelMessage',
      entityId: msg.id,
      metadata: { salesOrderId: order.id, channel: msg.channel },
    });

    emitRealtime(this.events, 'omnichannel.message.updated', {
      companyId,
      messageId: msg.id,
      status:    'approved',
    });

    return { message: updated, salesOrder: order };
  }

  async rejectDraft(id: string, companyId: string, reason: string, session: UserSession) {
    const msg = await this.findOne(id, companyId);
    if (msg.status === 'approved') {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', messageAr: 'تمت الموافقة مسبقاً' });
    }
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', messageAr: 'سبب الرفض مطلوب' });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (msg.draftOrderId) {
        await tx.omnichannelDraftOrder.update({
          where: { id: msg.draftOrderId },
          data:  { rejectedReason: reason.slice(0, 500) },
        });
      }
      return tx.omnichannelMessage.update({
        where: { id: msg.id },
        data:  { status: 'rejected', processedAt: new Date() },
      });
    });

    await this.audit.log({
      companyId,
      userId: session.userId,
      action: 'omnichannel.reject',
      entityType: 'OmnichannelMessage',
      entityId: msg.id,
      reason,
    });

    emitRealtime(this.events, 'omnichannel.message.updated', {
      companyId,
      messageId: msg.id,
      status:    'rejected',
    });

    return updated;
  }
}
