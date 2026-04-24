import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('hr/departments')
export class DepartmentsController {
  constructor(private readonly svc: DepartmentsService) {}

  @Post()
  @RequirePermission('Department', 'create')
  create(@Body() dto: any, @CurrentUser() user: UserSession) {
    return this.svc.create(dto, user);
  }

  @Get()
  @RequirePermission('Department', 'read')
  findAll(@CurrentUser() user: UserSession, @Query('isActive') isActive?: string) {
    return this.svc.findAll(user.companyId, { isActive: isActive === undefined ? undefined : isActive === 'true' });
  }

  @Get('tree')
  @RequirePermission('Department', 'read')
  tree(@CurrentUser() user: UserSession) {
    return this.svc.getTree(user.companyId);
  }

  @Get(':id')
  @RequirePermission('Department', 'read')
  findOne(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.findOne(id, user.companyId);
  }

  @Patch(':id')
  @RequirePermission('Department', 'update')
  update(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: UserSession) {
    return this.svc.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission('Department', 'delete')
  remove(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.remove(id, user);
  }
}
