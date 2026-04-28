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
import { SalesReturnsService } from './sales-returns.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

// I047 — Web uses /api/v1/sales/returns.
@Controller('sales/returns')
export class SalesReturnsController {
  constructor(private readonly svc: SalesReturnsService) {}

  @Get()
  @RequirePermission('SalesReturn', 'read')
  async findAll(
    @CurrentUser() user: UserSession,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.svc.findAll(user.companyId, {
      page: page ? +page : 1,
      limit: limit ? +limit : 50,
      status,
    });
  }

  @Get(':id')
  @RequirePermission('SalesReturn', 'read')
  async findOne(@CurrentUser() user: UserSession, @Param('id') id: string) {
    return this.svc.findOne(id, user.companyId);
  }

  @Post()
  @RequirePermission('SalesReturn', 'create')
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: UserSession, @Body() dto: any) {
    return this.svc.create(user.companyId, dto, user);
  }

  @Post(':id/approve')
  @RequirePermission('SalesReturn', 'post')
  async approve(@CurrentUser() user: UserSession, @Param('id') id: string) {
    return this.svc.approve(id, user.companyId, user);
  }

  @Post(':id/reject')
  @RequirePermission('SalesReturn', 'update')
  async reject(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() dto: { reason: string },
  ) {
    return this.svc.reject(id, user.companyId, dto.reason, user);
  }
}
