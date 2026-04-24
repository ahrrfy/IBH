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
import { DeliveryService } from './delivery.service';
import { CurrentUser } from '../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';
import { DeliveryStatus } from '@prisma/client';

@Controller('delivery')
export class DeliveryController {
  constructor(private readonly svc: DeliveryService) {}

  @Get()
  @RequirePermission('Delivery', 'read')
  findAll(
    @CurrentUser() user: UserSession,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: DeliveryStatus,
    @Query('driverId') driverId?: string,
    @Query('customerId') customerId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.findAll(user.companyId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status,
      driverId,
      customerId,
      from,
      to,
    });
  }

  @Get('my')
  @RequirePermission('Delivery', 'read')
  myDeliveries(
    @CurrentUser() user: UserSession,
    @Query('status') status?: DeliveryStatus,
  ) {
    return this.svc.myDeliveries(user.userId, user.companyId, { status });
  }

  @Get('cod-report')
  @RequirePermission('Delivery', 'read')
  codReport(
    @CurrentUser() user: UserSession,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('driverId') driverId?: string,
  ) {
    return this.svc.codReport(user.companyId, driverId, { from, to });
  }

  @Get('driver/:driverId/report')
  @RequirePermission('Delivery', 'read')
  driverReport(
    @CurrentUser() user: UserSession,
    @Param('driverId') driverId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.svc.driverPerformanceReport(driverId, user.companyId, from, to);
  }

  @Get(':id')
  @RequirePermission('Delivery', 'read')
  findOne(@CurrentUser() user: UserSession, @Param('id') id: string) {
    return this.svc.findOne(id, user.companyId);
  }

  @Post()
  @RequirePermission('Delivery', 'create')
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: UserSession, @Body() dto: any) {
    return this.svc.create(user.companyId, dto, user);
  }

  @Post(':id/assign')
  @RequirePermission('Delivery', 'update')
  @HttpCode(HttpStatus.OK)
  assign(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() body: { driverId: string },
  ) {
    return this.svc.assign(id, user.companyId, body.driverId, user);
  }

  @Post(':id/dispatch')
  @RequirePermission('Delivery', 'update')
  @HttpCode(HttpStatus.OK)
  dispatch(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() body: { lat?: number; lng?: number },
  ) {
    return this.svc.dispatch(id, user.companyId, body ?? {}, user);
  }

  @Post(':id/delivered')
  @RequirePermission('Delivery', 'update')
  @HttpCode(HttpStatus.OK)
  markDelivered(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body()
    body: {
      proofImageUrl?: string;
      proofSignatureUrl?: string;
      proofOtpCode?: string;
      lat?: number;
      lng?: number;
      codCollectedIqd?: number | string;
    },
  ) {
    return this.svc.markDelivered(id, user.companyId, body ?? {}, user);
  }

  @Post(':id/failed')
  @RequirePermission('Delivery', 'update')
  @HttpCode(HttpStatus.OK)
  markFailed(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() body: { reason: string; lat?: number; lng?: number },
  ) {
    return this.svc.markFailed(id, user.companyId, body.reason, body.lat, body.lng, user);
  }

  @Post(':id/returned')
  @RequirePermission('Delivery', 'update')
  @HttpCode(HttpStatus.OK)
  markReturned(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() body: { restockWarehouseId: string },
  ) {
    return this.svc.markReturned(
      id,
      user.companyId,
      { restockWarehouseId: body.restockWarehouseId },
      user,
    );
  }

  @Post(':id/cancel')
  @RequirePermission('Delivery', 'update')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.svc.cancel(id, user.companyId, body?.reason ?? '', user);
  }

  @Post(':id/cod-deposit')
  @RequirePermission('Delivery', 'approve')
  @HttpCode(HttpStatus.OK)
  depositCod(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() body: { cashAccountId: string; bankAccountId: string },
  ) {
    return this.svc.depositCod(id, user.companyId, body, user);
  }

  @Post(':id/location')
  @RequirePermission('Delivery', 'update')
  @HttpCode(HttpStatus.OK)
  updateLocation(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() body: { lat: number; lng: number },
  ) {
    return this.svc.updateLocation(id, user.companyId, body.lat, body.lng, user);
  }
}
