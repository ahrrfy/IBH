import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('crm/leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Post()
  @RequirePermission('Lead', 'create')
  create(@Body() dto: any, @CurrentUser() session: UserSession) {
    return this.leads.create(dto, session);
  }

  @Get()
  @RequirePermission('Lead', 'read')
  findAll(@CurrentUser() session: UserSession, @Query() q: any) {
    return this.leads.findAll(session.companyId, {
      page: q.page ? Number(q.page) : 1,
      pageSize: q.pageSize ? Number(q.pageSize) : 50,
      status: q.status,
      assignedTo: q.assignedTo,
      source: q.source,
      search: q.search,
    });
  }

  @Get('report/conversion')
  @RequirePermission('Lead', 'read')
  conversionReport(@CurrentUser() session: UserSession, @Query('from') from: string, @Query('to') to: string) {
    return this.leads.conversionReport(session.companyId, new Date(from), new Date(to));
  }

  @Get('report/sources')
  @RequirePermission('Lead', 'read')
  topSources(@CurrentUser() session: UserSession, @Query('from') from: string, @Query('to') to: string) {
    return this.leads.topSources(session.companyId, new Date(from), new Date(to));
  }

  @Get(':id')
  @RequirePermission('Lead', 'read')
  findOne(@Param('id') id: string, @CurrentUser() session: UserSession) {
    return this.leads.findOne(id, session.companyId);
  }

  @Put(':id')
  @RequirePermission('Lead', 'update')
  update(@Param('id') id: string, @Body() dto: any, @CurrentUser() session: UserSession) {
    return this.leads.update(id, dto, session);
  }

  @Post(':id/status')
  @RequirePermission('Lead', 'update')
  changeStatus(@Param('id') id: string, @Body() dto: { status: any; customerId?: string; lostReason?: string }, @CurrentUser() session: UserSession) {
    return this.leads.changeStatus(id, dto.status, session, { customerId: dto.customerId, lostReason: dto.lostReason });
  }

  @Post(':id/assign')
  @RequirePermission('Lead', 'update')
  assign(@Param('id') id: string, @Body('userId') userId: string, @CurrentUser() session: UserSession) {
    return this.leads.assign(id, userId, session);
  }

  @Post(':id/score')
  @RequirePermission('Lead', 'update')
  score(@Param('id') id: string) {
    return this.leads.calculateScore(id).then((score) => ({ score }));
  }
}
