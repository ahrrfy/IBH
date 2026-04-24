import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('marketing/promotions')
export class PromotionsController {
  constructor(private readonly svc: PromotionsService) {}

  @Post()
  @RequirePermission('Promotion', 'create')
  create(@Body() dto: any, @CurrentUser() user: UserSession) {
    return this.svc.create(dto, user);
  }

  @Get()
  @RequirePermission('Promotion', 'read')
  findAll(@CurrentUser() user: UserSession, @Query('isActive') isActive?: string, @Query('type') type?: any) {
    return this.svc.findAll(user.companyId, {
      isActive: isActive === undefined ? undefined : isActive === 'true',
      type,
    });
  }

  @Get(':id')
  @RequirePermission('Promotion', 'read')
  findOne(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.findOne(id, user.companyId);
  }

  @Patch(':id')
  @RequirePermission('Promotion', 'update')
  update(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: UserSession) {
    return this.svc.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission('Promotion', 'delete')
  remove(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.remove(id, user);
  }

  @Post('validate')
  @RequirePermission('Promotion', 'read')
  validate(@Body() dto: any, @CurrentUser() user: UserSession) {
    return this.svc.validate({ ...dto, companyId: user.companyId });
  }

  @Post('apply')
  @RequirePermission('Promotion', 'read')
  apply(@Body() dto: any, @CurrentUser() user: UserSession) {
    return this.svc.applyToOrder({ ...dto, companyId: user.companyId });
  }

  @Post('record-use')
  @RequirePermission('Promotion', 'update')
  recordUse(@Body() dto: any, @CurrentUser() user: UserSession) {
    return this.svc.recordUse(dto, user);
  }
}
