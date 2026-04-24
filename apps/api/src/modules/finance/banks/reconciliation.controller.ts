import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ReconciliationService,
  StartRecoDto,
  AddAdjustmentDto,
} from './reconciliation.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('finance/banks/reconciliation')
export class ReconciliationController {
  constructor(private readonly svc: ReconciliationService) {}

  @Post('start')
  @RequirePermission('BankAccount', 'reconcile')
  start(@Body() dto: StartRecoDto, @CurrentUser() session: UserSession) {
    return this.svc.start(dto, session);
  }

  @Get()
  @RequirePermission('BankAccount', 'read')
  list(
    @CurrentUser() session: UserSession,
    @Query('bankAccountId') bankAccountId?: string,
  ) {
    return this.svc.findAll(session.companyId, bankAccountId);
  }

  @Get(':id')
  @RequirePermission('BankAccount', 'read')
  findOne(@Param('id') id: string, @CurrentUser() session: UserSession) {
    return this.svc.findOne(id, session.companyId);
  }

  @Get(':id/discrepancy')
  @RequirePermission('BankAccount', 'read')
  discrepancy(@Param('id') id: string, @CurrentUser() session: UserSession) {
    return this.svc.discrepancyReport(id, session.companyId);
  }

  @Post('items/:itemId/match')
  @RequirePermission('BankAccount', 'reconcile')
  match(
    @Param('itemId') itemId: string,
    @Body() body: { journalEntryLineId?: string },
    @CurrentUser() session: UserSession,
  ) {
    return this.svc.matchItem(itemId, body.journalEntryLineId ?? null, session);
  }

  @Post('items/:itemId/unmatch')
  @RequirePermission('BankAccount', 'reconcile')
  unmatch(@Param('itemId') itemId: string) {
    return this.svc.unmatch(itemId);
  }

  @Post('adjustment')
  @RequirePermission('BankAccount', 'reconcile')
  addAdjustment(
    @Body() dto: AddAdjustmentDto,
    @CurrentUser() session: UserSession,
  ) {
    return this.svc.addAdjustment(dto, session);
  }

  @Post(':id/complete')
  @RequirePermission('BankAccount', 'reconcile')
  complete(@Param('id') id: string, @CurrentUser() session: UserSession) {
    return this.svc.complete(id, session);
  }
}
