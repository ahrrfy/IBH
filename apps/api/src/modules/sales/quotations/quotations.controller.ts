import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('quotations')
export class QuotationsController {
  constructor(private readonly svc: QuotationsService) {}

  @Get()
  @RequirePermission('Quotation', 'read')
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
  @RequirePermission('Quotation', 'read')
  async findOne(@CurrentUser() user: UserSession, @Param('id') id: string) {
    return this.svc.findOne(id, user.companyId);
  }

  @Post()
  @RequirePermission('Quotation', 'create')
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: UserSession, @Body() dto: any) {
    return this.svc.create(user.companyId, dto, user);
  }

  @Put(':id')
  @RequirePermission('Quotation', 'update')
  async update(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.svc.update(id, user.companyId, dto, user);
  }

  @Post(':id/send')
  @RequirePermission('Quotation', 'update')
  async send(@CurrentUser() user: UserSession, @Param('id') id: string) {
    return this.svc.send(id, user.companyId, user);
  }

  @Post(':id/accept')
  @RequirePermission('Quotation', 'update')
  async accept(@CurrentUser() user: UserSession, @Param('id') id: string) {
    return this.svc.accept(id, user.companyId, user);
  }

  @Post(':id/reject')
  @RequirePermission('Quotation', 'update')
  async reject(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() dto: { reason: string },
  ) {
    return this.svc.reject(id, user.companyId, dto.reason, user);
  }

  @Post(':id/convert')
  @RequirePermission('Quotation', 'update')
  async convert(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() dto: { warehouseId: string },
  ) {
    return this.svc.convertToOrder(id, user.companyId, dto.warehouseId, user);
  }
}
