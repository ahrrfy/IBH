/**
 * T70 — Super-admin billing endpoints (multi-tenant invoice & payment recording).
 * All routes gated by RequirePermission('License','admin') — same gate as T63.
 */
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  BillingService,
  type InvoiceStatus,
  type PaymentMethod,
} from './billing.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('admin/billing')
@RequirePermission('License', 'admin')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('invoices')
  list(@Query() q: any) {
    return this.billing.listInvoices({
      companyId: q.companyId,
      status: q.status as InvoiceStatus | undefined,
      dateFrom: q.from,
      dateTo: q.to,
      page: q.page ? Number(q.page) : undefined,
      limit: q.limit ? Number(q.limit) : undefined,
    });
  }

  @Get('invoices/:id')
  get(@Param('id') id: string) {
    return this.billing.getInvoice(id);
  }

  @Post('invoices/:id/mark-paid')
  markPaid(
    @Param('id') id: string,
    @Body() body: { method: PaymentMethod; reference?: string; notes?: string },
    @CurrentUser() session: UserSession,
  ) {
    return this.billing.markPaid(id, body, session.userId);
  }

  @Post('invoices/:id/mark-failed')
  markFailed(
    @Param('id') id: string,
    @Body() body: { notes?: string },
    @CurrentUser() session: UserSession,
  ) {
    return this.billing.markFailed(id, { notes: body?.notes }, session.userId);
  }

  @Post('invoices/:id/retry')
  retry(@Param('id') id: string, @CurrentUser() session: UserSession) {
    return this.billing.retryFailedInvoice(id, session.userId);
  }

  @Post('invoices/:id/void')
  void(
    @Param('id') id: string,
    @Body() body: { notes?: string },
    @CurrentUser() session: UserSession,
  ) {
    return this.billing.voidInvoice(id, { notes: body?.notes }, session.userId);
  }

  @Post('generate')
  generate(@Body() body: { asOf?: string }) {
    return this.billing.generatePeriodInvoices(
      body?.asOf ? new Date(body.asOf) : undefined,
    );
  }
}
