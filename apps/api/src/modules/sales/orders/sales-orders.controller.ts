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
import { SalesOrdersService } from './sales-orders.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('sales-orders')
export class SalesOrdersController {
  constructor(private readonly svc: SalesOrdersService) {}

  @Get()
  @RequirePermission('SalesOrder', 'read')
  async findAll(
    @CurrentUser() user: UserSession,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.svc.findAll(user.companyId, {
      page: page ? +page : 1,
      limit: limit ? +limit : 50,
      status,
      customerId,
    });
  }

  @Get(':id')
  @RequirePermission('SalesOrder', 'read')
  async findOne(@CurrentUser() user: UserSession, @Param('id') id: string) {
    return this.svc.findOne(id, user.companyId);
  }

  @Post()
  @RequirePermission('SalesOrder', 'create')
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: UserSession, @Body() dto: any) {
    return this.svc.create(user.companyId, dto, user);
  }

  @Post(':id/confirm')
  @RequirePermission('SalesOrder', 'update')
  async confirm(@CurrentUser() user: UserSession, @Param('id') id: string) {
    return this.svc.confirm(id, user.companyId, user);
  }

  @Post(':id/cancel')
  @RequirePermission('SalesOrder', 'update')
  async cancel(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() dto: { reason: string },
  ) {
    return this.svc.cancel(id, user.companyId, dto.reason, user);
  }
}
