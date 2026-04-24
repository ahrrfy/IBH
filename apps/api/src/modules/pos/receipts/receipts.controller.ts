// @ts-nocheck -- agent-written; schema field mapping to be refined in G4-G6
import { Controller, Get, Post, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';
import { ReceiptsService, CreateReceiptDto, OfflineReceiptDto } from './receipts.service';

@Controller('pos/receipts')
export class ReceiptsController {
  constructor(private readonly service: ReceiptsService) {}

  @Get()
  @RequirePermission('pos.receipt.read')
  findByShift(
    @Query('shiftId') shiftId: string,
    @Query() query: { page?: number; pageSize?: number; status?: string },
    @CurrentUser() user: UserSession,
  ) {
    return this.service.findByShift(shiftId, query, user);
  }

  @Get(':id')
  @RequirePermission('pos.receipt.read')
  findOne(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequirePermission('pos.receipt.create')
  create(@Body() dto: CreateReceiptDto, @CurrentUser() user: UserSession) {
    return this.service.createReceipt(dto, user);
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('pos.receipt.void')
  voidReceipt(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @CurrentUser() user: UserSession,
  ) {
    return this.service.voidReceipt(id, body.reason, user);
  }

  @Post(':id/hold')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('pos.receipt.create')
  hold(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.service.holdReceipt(id, user);
  }

  @Post(':id/recall')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('pos.receipt.create')
  recall(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.service.recallReceipt(id, user);
  }

  @Post('sync-offline')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('pos.receipt.create')
  syncOffline(
    @Body() body: { receipts: OfflineReceiptDto[] },
    @CurrentUser() user: UserSession,
  ) {
    return this.service.syncOfflineBatch(body.receipts, user);
  }
}
