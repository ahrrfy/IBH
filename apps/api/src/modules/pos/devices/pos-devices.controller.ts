// @ts-nocheck -- agent-written; schema field mapping to be refined in G4-G6
import { Controller, Get, Post, Put, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';
import { POSDevicesService, CreatePOSDeviceDto, UpdatePOSDeviceDto } from './pos-devices.service';

@Controller('pos/devices')
export class POSDevicesController {
  constructor(private readonly service: POSDevicesService) {}

  @Get()
  @RequirePermission('pos.device.read')
  findAll(@CurrentUser() user: UserSession, @Query('branchId') branchId?: string) {
    return this.service.findAll(user, branchId);
  }

  @Get(':id')
  @RequirePermission('pos.device.read')
  findOne(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequirePermission('pos.device.manage')
  create(@Body() dto: CreatePOSDeviceDto, @CurrentUser() user: UserSession) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @RequirePermission('pos.device.manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePOSDeviceDto,
    @CurrentUser() user: UserSession,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('pos.device.manage')
  deactivate(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.service.deactivate(id, user);
  }

  @Post(':id/heartbeat')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('pos.device.operate')
  heartbeat(
    @Param('id') id: string,
    @Body() body: { fingerprint: string },
    @CurrentUser() user: UserSession,
  ) {
    return this.service.heartbeat(id, body.fingerprint, user);
  }
}
