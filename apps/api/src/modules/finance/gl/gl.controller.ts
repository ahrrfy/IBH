import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { GLService, CreateAccountDto, UpdateAccountDto } from './gl.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('finance/gl')
export class GLController {
  constructor(private readonly gl: GLService) {}

  // ─── Chart of Accounts ─────────────────────────────────────────────────────

  @Get('accounts')
  @RequirePermission('GL', 'read')
  listAccounts(
    @CurrentUser() session: UserSession,
    @Query('category') category?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.gl.listAccounts(session.companyId, {
      category,
      activeOnly: activeOnly === 'true',
    });
  }

  @Get('accounts/:id')
  @RequirePermission('GL', 'read')
  getAccount(@Param('id') id: string, @CurrentUser() session: UserSession) {
    return this.gl.getAccount(id, session.companyId);
  }

  @Post('accounts')
  @RequirePermission('GL', 'create')
  createAccount(@Body() dto: CreateAccountDto, @CurrentUser() session: UserSession) {
    return this.gl.createAccount(session.companyId, dto, session);
  }

  @Put('accounts/:id')
  @RequirePermission('GL', 'update')
  updateAccount(
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
    @CurrentUser() session: UserSession,
  ) {
    return this.gl.updateAccount(id, session.companyId, dto, session);
  }

  @Get('trial-balance')
  @RequirePermission('GL', 'read')
  trialBalance(
    @CurrentUser() session: UserSession,
    @Query('asOf') asOf?: string,
  ) {
    const at = asOf ? new Date(asOf) : new Date();
    return this.gl.trialBalance(session.companyId, at);
  }

  @Get('general-ledger')
  @RequirePermission('GL', 'read')
  generalLedger(
    @CurrentUser() session: UserSession,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('costCenterId') costCenterId?: string,
  ) {
    return this.gl.generalLedger(session.companyId, {
      from: new Date(from),
      to: new Date(to),
      costCenterId,
    });
  }

  @Get('account/:id/ledger')
  @RequirePermission('GL', 'read')
  accountLedger(
    @CurrentUser() session: UserSession,
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.gl.accountLedger(session.companyId, id, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Get('account/:id/balance')
  @RequirePermission('GL', 'read')
  accountBalance(@Param('id') id: string, @Query('asOf') asOf?: string) {
    return this.gl.accountBalance(id, asOf ? new Date(asOf) : new Date());
  }

  @Get('entries/:id')
  @RequirePermission('GL', 'read')
  voucher(@Param('id') id: string) {
    return this.gl.voucher(id);
  }

  // I047 — Web `/finance/journal-entries` page calls /finance/gl/entries
  // (without :id) for the list view. Was 404. Returns the most recent
  // entries for the current company, paginated.
  @Get('entries')
  @RequirePermission('GL', 'read')
  listEntries(
    @CurrentUser() session: UserSession,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.gl.listEntries(session.companyId, {
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }
}
