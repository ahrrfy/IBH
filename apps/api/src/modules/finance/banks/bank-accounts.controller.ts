import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { BankAccountsService, CreateBankAccountDto } from './bank-accounts.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('finance/banks')
export class BankAccountsController {
  constructor(private readonly svc: BankAccountsService) {}

  @Post()
  @RequirePermission('BankAccount', 'create')
  create(@Body() dto: CreateBankAccountDto, @CurrentUser() session: UserSession) {
    return this.svc.create(dto, session);
  }

  @Get()
  @RequirePermission('BankAccount', 'read')
  findAll(@CurrentUser() session: UserSession) {
    return this.svc.findAll(session.companyId);
  }

  @Get(':id')
  @RequirePermission('BankAccount', 'read')
  findOne(@Param('id') id: string, @CurrentUser() session: UserSession) {
    return this.svc.findOne(id, session.companyId);
  }

  @Patch(':id')
  @RequirePermission('BankAccount', 'create')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateBankAccountDto>,
    @CurrentUser() session: UserSession,
  ) {
    return this.svc.update(id, dto, session);
  }

  @Delete(':id')
  @RequirePermission('BankAccount', 'create')
  deactivate(@Param('id') id: string, @CurrentUser() session: UserSession) {
    return this.svc.deactivate(id, session);
  }

  @Get(':id/balance')
  @RequirePermission('BankAccount', 'read')
  balance(@Param('id') id: string, @Query('asOf') asOf?: string) {
    return this.svc.getBalance(id, asOf ? new Date(asOf) : undefined);
  }

  @Post(':id/recalculate')
  @RequirePermission('BankAccount', 'create')
  recalc(@Param('id') id: string) {
    return this.svc.recalculateBalance(id);
  }
}
