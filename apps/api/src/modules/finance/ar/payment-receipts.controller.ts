import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  PaymentReceiptsService,
  CreatePaymentReceiptDto,
} from './payment-receipts.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('finance/ar/receipts')
export class PaymentReceiptsController {
  constructor(private readonly svc: PaymentReceiptsService) {}

  @Post()
  @RequirePermission('PaymentReceipt', 'create')
  create(
    @Body() dto: CreatePaymentReceiptDto,
    @CurrentUser() session: UserSession,
  ) {
    return this.svc.create(dto, session);
  }

  @Get()
  @RequirePermission('PaymentReceipt', 'read')
  findAll(
    @CurrentUser() session: UserSession,
    @Query('customerId') customerId?: string,
  ) {
    return this.svc.findAll(session.companyId, customerId);
  }

  @Get(':id')
  @RequirePermission('PaymentReceipt', 'read')
  findOne(@Param('id') id: string, @CurrentUser() session: UserSession) {
    return this.svc.findOne(id, session.companyId);
  }

  @Get(':id/print')
  @RequirePermission('PaymentReceipt', 'read')
  print(@Param('id') id: string, @CurrentUser() session: UserSession) {
    return this.svc.printReceipt(id, session.companyId);
  }

  @Post(':id/apply')
  @RequirePermission('PaymentReceipt', 'create')
  apply(
    @Param('id') id: string,
    @Body() body: { invoiceId: string; amount: string | number },
    @CurrentUser() session: UserSession,
  ) {
    return this.svc.applyToInvoice(id, body, session);
  }

  @Post(':id/refund')
  @RequirePermission('PaymentReceipt', 'create')
  refund(
    @Param('id') id: string,
    @Body() body: { amount: string | number },
    @CurrentUser() session: UserSession,
  ) {
    return this.svc.refundOverpayment(id, body.amount, session);
  }
}
