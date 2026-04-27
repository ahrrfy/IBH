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
import { CodSettlementStatus } from '@prisma/client';
import { CodSettlementService } from './cod-settlement.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('delivery/settlements')
export class CodSettlementController {
  constructor(private readonly svc: CodSettlementService) {}

  @Get()
  @RequirePermission('Delivery', 'read')
  list(
    @CurrentUser() user: UserSession,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('deliveryCompanyId') deliveryCompanyId?: string,
    @Query('status') status?: CodSettlementStatus,
  ) {
    return this.svc.findAll(user.companyId, {
      page:  page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      deliveryCompanyId,
      status,
    });
  }

  @Get(':id')
  @RequirePermission('Delivery', 'read')
  findOne(@CurrentUser() user: UserSession, @Param('id') id: string) {
    return this.svc.findOne(id, user.companyId);
  }

  @Post('/propose')
  @RequirePermission('Delivery', 'create')
  @HttpCode(HttpStatus.CREATED)
  propose(
    @CurrentUser() user: UserSession,
    @Body() body: {
      deliveryCompanyId: string;
      periodStart: string;
      periodEnd: string;
    },
  ) {
    return this.svc.propose(user.companyId, body, user);
  }

  @Post(':id/approve')
  @RequirePermission('Delivery', 'approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() body: {
      bankAccountCode: string;
      commissionAccountCode: string;
      shippingAccountCode: string;
      receivableAccountCode: string;
    },
  ) {
    return this.svc.approve(id, user.companyId, body, user);
  }

  @Post(':id/mark-paid')
  @RequirePermission('Delivery', 'approve')
  @HttpCode(HttpStatus.OK)
  markPaid(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() body: { paymentRef?: string },
  ) {
    return this.svc.markPaid(id, user.companyId, body, user);
  }

  @Post(':id/cancel')
  @RequirePermission('Delivery', 'update')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return this.svc.cancel(id, user.companyId, body.reason, user);
  }

  @Post('/scorecard/refresh')
  @RequirePermission('Delivery', 'update')
  @HttpCode(HttpStatus.OK)
  refreshScorecard(
    @CurrentUser() user: UserSession,
    @Body() body: { deliveryCompanyId?: string },
  ) {
    return this.svc.refreshScorecard(user.companyId, body?.deliveryCompanyId);
  }
}
