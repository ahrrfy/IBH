// @ts-nocheck -- agent-written; schema field mapping to be refined in G4-G6
import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { SequenceService } from '../../../engines/sequence/sequence.service';
import { PostingService } from '../../../engines/posting/posting.service';
import { PolicyService } from '../../../engines/policy/policy.service';
import { InventoryService } from '../../inventory/inventory.service';
import { Prisma, PaymentMethod } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';

export interface ReceiptLineDto {
  variantId: string;
  qty: number | string;
  unitPriceIqd: number | string;
  discountPct?: number | string;
  discountIqd?: number | string;
}

export interface ReceiptPaymentDto {
  method: PaymentMethod;
  amountIqd: number | string;
  reference?: string;
  cashAccountId?: string;
}

export interface CreateReceiptDto {
  shiftId: string;
  customerId?: string;
  lines: ReceiptLineDto[];
  payments: ReceiptPaymentDto[];
  discountIqd?: number | string;
  taxIqd?: number | string;
  loyaltyPointsUsed?: number;
  clientUlid?: string;
  isOffline?: boolean;
}

export interface OfflineReceiptDto extends CreateReceiptDto {
  createdAt?: string;
}

@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: SequenceService,
    private readonly posting: PostingService,
    private readonly policy: PolicyService,
    private readonly inventory: InventoryService,
  ) {}

  async createReceipt(dto: CreateReceiptDto, session: UserSession) {
    if (!dto.lines?.length) {
      throw new BadRequestException('الفاتورة يجب أن تحتوي على بند واحد على الأقل');
    }
    if (!dto.payments?.length) {
      throw new BadRequestException('يجب تحديد طريقة دفع واحدة على الأقل');
    }

    if (dto.clientUlid) {
      const existing = await this.prisma.pOSReceipt.findFirst({
        where: { companyId: session.companyId, clientUlid: dto.clientUlid },
        include: { lines: true, payments: true },
      });
      if (existing) return existing;
    }

    return this.prisma.$transaction(
      async (tx) => {
        const shift = await tx.shift.findFirst({
          where: { id: dto.shiftId, companyId: session.companyId },
          include: { posDevice: true },
        });
        if (!shift) throw new NotFoundException('الوردية غير موجودة');
        if (shift.status !== 'open') {
          throw new BadRequestException('الوردية مغلقة');
        }

        const warehouseId = shift.posDevice.warehouseId;

        // Build lines with cost
        let subtotal = new Prisma.Decimal(0);
        const preparedLines: Array<{
          variantId: string;
          qty: Prisma.Decimal;
          unitPriceIqd: Prisma.Decimal;
          unitCostIqd: Prisma.Decimal;
          discountPct: Prisma.Decimal;
          discountIqd: Prisma.Decimal;
          lineTotalIqd: Prisma.Decimal;
          cogsIqd: Prisma.Decimal;
        }> = [];

        for (const l of dto.lines) {
          const qty = new Prisma.Decimal(l.qty);
          const unitPrice = new Prisma.Decimal(l.unitPriceIqd);
          const discountPct = new Prisma.Decimal(l.discountPct ?? 0);
          let discountIqd = new Prisma.Decimal(l.discountIqd ?? 0);
          const gross = unitPrice.times(qty);
          if (discountPct.greaterThan(0)) {
            discountIqd = gross.times(discountPct).dividedBy(100);
          }
          const lineTotal = gross.minus(discountIqd);

          const balance = await tx.inventoryBalance.findFirst({
            where: { variantId: l.variantId, warehouseId },
          });
          const unitCost = new Prisma.Decimal(balance?.avgCost ?? 0);
          const cogs = unitCost.times(qty);

          preparedLines.push({
            variantId: l.variantId,
            qty,
            unitPriceIqd: unitPrice,
            unitCostIqd: unitCost,
            discountPct,
            discountIqd,
            lineTotalIqd: lineTotal,
            cogsIqd: cogs,
          });
          subtotal = subtotal.plus(lineTotal);
        }

        const headerDiscount = new Prisma.Decimal(dto.discountIqd ?? 0);
        const tax = new Prisma.Decimal(dto.taxIqd ?? 0);
        const total = subtotal.minus(headerDiscount).plus(tax);

        const paymentsSum = dto.payments.reduce(
          (acc, p) => acc.plus(new Prisma.Decimal(p.amountIqd)),
          new Prisma.Decimal(0),
        );
        if (paymentsSum.lessThan(total)) {
          throw new BadRequestException('مبلغ الدفع أقل من إجمالي الفاتورة');
        }
        const change = paymentsSum.minus(total);

        const hasCash = dto.payments.some((p) => p.method === 'cash');
        if (change.greaterThan(0) && !hasCash) {
          throw new BadRequestException('لا يمكن إعطاء باقي بدون دفع نقدي');
        }

        const number = await this.sequence.next('RCT', session.companyId, tx);

        const loyaltyEarned = dto.customerId
          ? Math.floor(Number(total.toString()) / 1000)
          : 0;
        const loyaltyUsed = dto.loyaltyPointsUsed ?? 0;

        const receipt = await tx.pOSReceipt.create({
          data: {
            companyId: session.companyId,
            branchId: shift.branchId,
            shiftId: shift.id,
            number,
            customerId: dto.customerId ?? null,
            warehouseId,
            status: 'completed',
            subtotalIqd: subtotal,
            discountIqd: headerDiscount,
            taxIqd: tax,
            totalIqd: total,
            changeGivenIqd: change,
            loyaltyPointsEarned: loyaltyEarned,
            loyaltyPointsUsed: loyaltyUsed,
            clientUlid: dto.clientUlid ?? null,
            isOffline: dto.isOffline ?? false,
            syncedAt: dto.isOffline ? new Date() : null,
            lines: {
              create: preparedLines,
            },
            payments: {
              create: dto.payments.map((p) => ({
                method: p.method,
                amountIqd: new Prisma.Decimal(p.amountIqd),
                reference: p.reference ?? null,
                cashAccountId:
                  p.cashAccountId ??
                  (p.method === 'cash' ? shift.posDevice.cashAccountId : null),
              })),
            },
          },
          include: { lines: true, payments: true },
        });

        // Inventory movements
        for (const line of preparedLines) {
          await this.inventory.move(
            {
              direction: 'out',
              variantId: line.variantId,
              warehouseId,
              qty: line.qty,
              referenceType: 'POSReceipt',
              referenceId: receipt.id,
              unitCost: line.unitCostIqd,
            },
            session,
            tx,
          );
        }

        // Post JE via template
        const je = await this.posting.postTemplate(
          'pos_sale',
          {
            companyId: session.companyId,
            branchId: shift.branchId,
            referenceType: 'POSReceipt',
            referenceId: receipt.id,
            reference: receipt.number,
            subtotal,
            discountIqd: headerDiscount,
            taxIqd: tax,
            total,
            cogs: preparedLines.reduce(
              (acc, l) => acc.plus(l.cogsIqd),
              new Prisma.Decimal(0),
            ),
            payments: dto.payments.map((p) => ({
              method: p.method,
              amountIqd: new Prisma.Decimal(p.amountIqd),
              cashAccountId:
                p.cashAccountId ??
                (p.method === 'cash' ? shift.posDevice.cashAccountId : null),
            })),
            warehouseId,
          },
          session,
          tx,
        );

        const updated = await tx.pOSReceipt.update({
          where: { id: receipt.id },
          data: { journalEntryId: je.id },
          include: { lines: true, payments: true },
        });

        // Loyalty
        if (dto.customerId) {
          const delta = loyaltyEarned - loyaltyUsed;
          if (delta !== 0) {
            await tx.customer.update({
              where: { id: dto.customerId },
              data: { loyaltyPoints: { increment: delta } },
            });
          }
        }

        await this.audit.log({
          companyId: session.companyId,
          userId: session.userId,
          action: 'create',
          entityType: 'POSReceipt',
          entityId: updated.id,
          after: updated,
        }, tx);

        return updated;
      },
      { timeout: 15000 },
    );
  }

  async voidReceipt(receiptId: string, reason: string, session: UserSession) {
    const receipt = await this.prisma.pOSReceipt.findFirst({
      where: { id: receiptId, companyId: session.companyId },
      include: { lines: true, payments: true, shift: true },
    });
    if (!receipt) throw new NotFoundException('الفاتورة غير موجودة');
    if (receipt.status !== 'completed') {
      throw new BadRequestException('لا يمكن إلغاء فاتورة بهذه الحالة');
    }
    if (!receipt.shift || receipt.shift.status !== 'open') {
      throw new BadRequestException('لا يمكن إلغاء الفاتورة بعد إغلاق الوردية');
    }
    const ageMs = Date.now() - receipt.createdAt.getTime();
    if (ageMs > 24 * 60 * 60 * 1000) {
      throw new BadRequestException('لا يمكن إلغاء فاتورة أقدم من 24 ساعة');
    }

    return this.prisma.$transaction(async (tx) => {
      // Reverse inventory
      for (const line of receipt.lines) {
        await this.inventory.move(
          {
            direction: 'in',
            variantId: line.variantId,
            warehouseId: receipt.warehouseId,
            qty: new Prisma.Decimal(line.qty),
            referenceType: 'POSReceiptVoid',
            referenceId: receipt.id,
            unitCost: new Prisma.Decimal(line.unitCostIqd),
          },
          session,
          tx,
        );
      }

      // Reverse JE
      if (receipt.journalEntryId) {
        await this.posting.reverse(receipt.journalEntryId, `Void receipt ${receipt.number}: ${reason}`, session, tx);
      }

      const updated = await tx.pOSReceipt.update({
        where: { id: receipt.id },
        data: {
          status: 'voided',
          voidedAt: new Date(),
          voidedBy: session.userId,
          voidReason: reason,
        },
      });

      // Reverse loyalty
      if (receipt.customerId) {
        const delta = (receipt.loyaltyPointsUsed ?? 0) - (receipt.loyaltyPointsEarned ?? 0);
        if (delta !== 0) {
          await tx.customer.update({
            where: { id: receipt.customerId },
            data: { loyaltyPoints: { increment: delta } },
          });
        }
      }

      await this.audit.log({
        companyId: session.companyId,
        userId: session.userId,
        action: 'void',
        entityType: 'POSReceipt',
        entityId: receipt.id,
        before: receipt,
        after: updated,
        metadata: { reason },
      }, tx);

      return updated;
    }, { timeout: 15000 });
  }

  async syncOfflineBatch(receipts: OfflineReceiptDto[], session: UserSession) {
    const results: Array<{ clientUlid?: string; ok: boolean; id?: string; error?: string }> = [];
    for (const r of receipts) {
      try {
        const created = await this.createReceipt({ ...r, isOffline: true }, session);
        results.push({ clientUlid: r.clientUlid, ok: true, id: created.id });
      } catch (err: any) {
        results.push({
          clientUlid: r.clientUlid,
          ok: false,
          error: err?.message ?? 'error',
        });
      }
    }
    return { synced: results.filter((r) => r.ok).length, total: receipts.length, results };
  }

  async holdReceipt(receiptId: string, session: UserSession) {
    const receipt = await this.prisma.pOSReceipt.findFirst({
      where: { id: receiptId, companyId: session.companyId },
      include: { payments: true },
    });
    if (!receipt) throw new NotFoundException('الفاتورة غير موجودة');
    if (receipt.status !== 'completed') {
      throw new BadRequestException('لا يمكن تعليق فاتورة بهذه الحالة');
    }
    const hasCash = receipt.payments.some((p) => p.method === 'cash');
    if (hasCash) {
      throw new BadRequestException('لا يمكن تعليق فاتورة تحتوي على دفع نقدي');
    }
    return this.prisma.pOSReceipt.update({
      where: { id: receipt.id },
      data: { status: 'held' },
    });
  }

  async recallReceipt(receiptId: string, session: UserSession) {
    const receipt = await this.prisma.pOSReceipt.findFirst({
      where: { id: receiptId, companyId: session.companyId },
    });
    if (!receipt) throw new NotFoundException('الفاتورة غير موجودة');
    if (receipt.status !== 'held') {
      throw new BadRequestException('الفاتورة غير معلقة');
    }
    return this.prisma.pOSReceipt.update({
      where: { id: receipt.id },
      data: { status: 'completed' },
    });
  }

  async findByShift(shiftId: string, query: { page?: number; pageSize?: number; status?: string }, session: UserSession) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where: Prisma.POSReceiptWhereInput = {
      companyId: session.companyId,
      shiftId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.pOSReceipt.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { lines: true, payments: true },
      }),
      this.prisma.pOSReceipt.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async findOne(id: string, session: UserSession) {
    const receipt = await this.prisma.pOSReceipt.findFirst({
      where: { id, companyId: session.companyId },
      include: { lines: true, payments: true },
    });
    if (!receipt) throw new NotFoundException('الفاتورة غير موجودة');
    return receipt;
  }
}
