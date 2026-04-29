import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SalesInvoicesService } from './sales-invoices.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

// I047 — exposed at BOTH paths. Old callers used /sales-invoices; new web
// pages use /sales/invoices. Array form keeps backward compat.
@Controller(['sales-invoices', 'sales/invoices'])
export class SalesInvoicesController {
  constructor(private readonly svc: SalesInvoicesService) {}

  @Get()
  @RequirePermission('SalesInvoice', 'read')
  async findAll(
    @CurrentUser() user: UserSession,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('overdueOnly') overdueOnly?: string,
  ) {
    return this.svc.findAll(user.companyId, {
      page: page ? +page : 1,
      limit: limit ? +limit : 50,
      status,
      customerId,
      overdueOnly: overdueOnly === 'true',
    });
  }

  @Get('overdue')
  @RequirePermission('SalesInvoice', 'read')
  async overdue(@CurrentUser() user: UserSession) {
    return this.svc.getOverdue(user.companyId);
  }

  @Get(':id')
  @RequirePermission('SalesInvoice', 'read')
  async findOne(@CurrentUser() user: UserSession, @Param('id') id: string) {
    return this.svc.findOne(id, user.companyId);
  }

  @Post('from-order/:orderId')
  @RequirePermission('SalesInvoice', 'create')
  @HttpCode(HttpStatus.CREATED)
  async fromOrder(
    @CurrentUser() user: UserSession,
    @Param('orderId') orderId: string,
    @Body() dto: any,
  ) {
    return this.svc.createFromOrder(orderId, user.companyId, dto, user);
  }

  @Post()
  @RequirePermission('SalesInvoice', 'create')
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: UserSession, @Body() dto: any) {
    return this.svc.createStandalone(user.companyId, dto, user);
  }

  @Post(':id/post')
  @RequirePermission('SalesInvoice', 'post')
  async post(@CurrentUser() user: UserSession, @Param('id') id: string) {
    return this.svc.post(id, user.companyId, user);
  }

  @Post(':id/payments')
  @RequirePermission('SalesInvoice', 'update')
  async pay(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.svc.recordPayment(id, user.companyId, dto, user);
  }

  @Post(':id/reverse')
  @RequirePermission('SalesInvoice', 'post')
  async reverse(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() dto: { reason: string },
  ) {
    return this.svc.reverse(id, user.companyId, dto.reason, user);
  }
}
