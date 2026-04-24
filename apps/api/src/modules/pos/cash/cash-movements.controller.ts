// @ts-nocheck -- agent-written; schema field mapping to be refined in G4-G6
import { Controller, Get, Post, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';
import {
  CashMovementsService,
  DepositDto,
  WithdrawalDto,
  PettyCashDto,
  InterimPickupDto,
} from './cash-movements.service';

@Controller('pos/cash-movements')
export class CashMovementsController {
  constructor(private readonly service: CashMovementsService) {}

  @Get()
  @RequirePermission('pos.cash.read')
  findByShift(@Query('shiftId') shiftId: string, @CurrentUser() user: UserSession) {
    return this.service.findByShift(shiftId, user);
  }

  @Get(':id')
  @RequirePermission('pos.cash.read')
  findOne(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.service.findOne(id, user);
  }

  @Post('deposit')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('pos.cash.manage')
  deposit(@Body() dto: DepositDto, @CurrentUser() user: UserSession) {
    return this.service.deposit(dto, user);
  }

  @Post('withdrawal')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('pos.cash.manage')
  withdrawal(@Body() dto: WithdrawalDto, @CurrentUser() user: UserSession) {
    return this.service.withdrawal(dto, user);
  }

  @Post('petty-cash')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('pos.cash.manage')
  pettyCash(@Body() dto: PettyCashDto, @CurrentUser() user: UserSession) {
    return this.service.pettyCash(dto, user);
  }

  @Post('interim-pickup')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('pos.cash.manage')
  interimPickup(@Body() dto: InterimPickupDto, @CurrentUser() user: UserSession) {
    return this.service.interimPickup(dto, user);
  }
}
