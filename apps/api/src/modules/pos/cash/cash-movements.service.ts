import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { AuditService } from '../../../engines/audit/audit.service';
import { PostingService } from '../../../engines/posting/posting.service';
import { Prisma } from '@prisma/client';
import type { UserSession } from '@erp/shared-types';

export interface DepositDto {
  shiftId?: string;
  fromAccountId: string;
  toAccountId: string;
  amountIqd: number | string;
  reference?: string;
  notes?: string;
}

export interface WithdrawalDto extends DepositDto {}

export interface PettyCashDto {
  amountIqd: number | string;
  reason: string;
  accountId: string;
  shiftId?: string;
}

export interface InterimPickupDto {
  shiftId: string;
  amountIqd: number | string;
  managerId: string;
  toAccountId: string;
  notes?: string;
}

@Injectable()
export class CashMovementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly posting: PostingService,
  ) {}

  private async createMovementWithJE(
    data: {
      shiftId?: string | null;
      fromAccountId: string | null;
      toAccountId: string | null;
      amountIqd: Prisma.Decimal;
      movementType: string;
      reference?: string | null;
      branchId?: string | null;
    },
    session: UserSession,
  ) {
    if (data.amountIqd.lessThanOrEqualTo(0)) {
      throw new BadRequestException('المبلغ يجب أن يكون أكبر من صفر');
    }

    return this.prisma.$transaction(async (tx) => {
      const movement = await tx.cashMovement.create({
        data: {
          companyId: session.companyId,
          shiftId: data.shiftId ?? null,
          fromAccountId: data.fromAccountId,
          toAccountId: data.toAccountId,
          amountIqd: data.amountIqd,
          movementType: data.movementType as any,
          reference: data.reference ?? null,
          createdBy: session.userId,
        },
      });

      const je = await this.posting.postTemplate(
        'cash_movement',
        {
          companyId: session.companyId,
          branchId: data.branchId ?? null,
          referenceType: 'CashMovement',
          referenceId: movement.id,
          reference: data.reference ?? movement.id,
          fromAccountId: data.fromAccountId,
          toAccountId: data.toAccountId,
          amount: data.amountIqd,
          movementType: data.movementType,
        },
        session,
        tx,
      );

      const updated = await tx.cashMovement.update({
        where: { id: movement.id },
        data: { journalEntryId: je.id },
      });

      await this.audit.log({
        companyId: session.companyId,
        userId: session.userId,
        action: 'create',
        entityType: 'CashMovement',
        entityId: updated.id,
        after: updated,
      }, tx);

      return updated;
    });
  }

  async deposit(dto: DepositDto, session: UserSession) {
    return this.createMovementWithJE(
      {
        shiftId: dto.shiftId ?? null,
        fromAccountId: dto.fromAccountId,
        toAccountId: dto.toAccountId,
        amountIqd: new Prisma.Decimal(dto.amountIqd),
        movementType: 'deposit',
        reference: dto.reference,
      },
      session,
    );
  }

  async withdrawal(dto: WithdrawalDto, session: UserSession) {
    return this.createMovementWithJE(
      {
        shiftId: dto.shiftId ?? null,
        fromAccountId: dto.fromAccountId,
        toAccountId: dto.toAccountId,
        amountIqd: new Prisma.Decimal(dto.amountIqd),
        movementType: 'withdrawal',
        reference: dto.reference,
      },
      session,
    );
  }

  async pettyCash(dto: PettyCashDto, session: UserSession) {
    return this.createMovementWithJE(
      {
        shiftId: dto.shiftId ?? null,
        fromAccountId: dto.accountId,
        toAccountId: null,
        amountIqd: new Prisma.Decimal(dto.amountIqd),
        movementType: 'petty_cash',
        reference: dto.reason,
      },
      session,
    );
  }

  async interimPickup(dto: InterimPickupDto, session: UserSession) {
    const shift = await this.prisma.shift.findFirst({
      where: { id: dto.shiftId, companyId: session.companyId },
      include: { posDevice: true },
    });
    if (!shift) throw new NotFoundException('الوردية غير موجودة');
    if (shift.status !== 'open') {
      throw new BadRequestException('الوردية غير مفتوحة');
    }

    return this.createMovementWithJE(
      {
        shiftId: shift.id,
        fromAccountId: shift.posDevice.cashAccountId,
        toAccountId: dto.toAccountId,
        amountIqd: new Prisma.Decimal(dto.amountIqd),
        movementType: 'interim_pickup',
        reference: `${shift.shiftNumber}/pickup`,
        branchId: shift.branchId,
      },
      {
        ...session,
        userId: dto.managerId,
      } as UserSession,
    );
  }

  async findByShift(shiftId: string, session: UserSession) {
    return this.prisma.cashMovement.findMany({
      where: { companyId: session.companyId, shiftId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string, session: UserSession) {
    const movement = await this.prisma.cashMovement.findFirst({
      where: { id, companyId: session.companyId },
    });
    if (!movement) throw new NotFoundException('الحركة النقدية غير موجودة');
    return movement;
  }
}
