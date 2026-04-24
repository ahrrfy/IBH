import { Controller, Get, Param, Query } from '@nestjs/common';
import { GLService } from './gl.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('finance/gl')
export class GLController {
  constructor(private readonly gl: GLService) {}

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
}
