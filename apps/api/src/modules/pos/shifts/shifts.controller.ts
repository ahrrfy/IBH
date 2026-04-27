import { Controller, Get, Post, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';
import { ShiftsService, OpenShiftDto, CloseShiftDto, ShiftsQuery, DenominationCount } from './shifts.service';

@Controller('pos/shifts')
export class ShiftsController {
  constructor(private readonly service: ShiftsService) {}

  @Get()
  @RequirePermission('pos.shift.read')
  findAll(@Query() query: ShiftsQuery, @CurrentUser() user: UserSession) {
    return this.service.findAll(query, user);
  }

  @Get('open/me')
  @RequirePermission('pos.shift.operate')
  findOpenByMe(@CurrentUser() user: UserSession) {
    return this.service.findOpenByCashier(user.userId, user.companyId);
  }

  @Get(':id')
  @RequirePermission('pos.shift.read')
  findOne(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.service.findOne(id, user);
  }

  @Post('open')
  @RequirePermission('pos.shift.operate')
  openShift(@Body() dto: OpenShiftDto, @CurrentUser() user: UserSession) {
    return this.service.openShift(dto, user);
  }

  /**
   * Blind cash count preview. The cashier submits their denomination tally
   * without ever seeing the expected drawer total on screen. The server
   * returns expected vs counted vs variance, plus whether the variance
   * exceeds tolerance and therefore needs manager approval.
   */
  @Post(':id/close/preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('pos.shift.operate')
  previewBlindClose(
    @Param('id') id: string,
    @Body() body: { denominationCounts: DenominationCount[] },
    @CurrentUser() user: UserSession,
  ) {
    return this.service.previewBlindClose(id, body.denominationCounts ?? [], user);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('pos.shift.operate')
  closeShift(
    @Param('id') id: string,
    @Body() dto: CloseShiftDto,
    @CurrentUser() user: UserSession,
  ) {
    return this.service.closeShift(id, dto, user);
  }

  @Post(':id/x-report')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('pos.shift.operate')
  xReport(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.service.xReport(id, user);
  }

  @Post(':id/z-report')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('pos.shift.operate')
  zReport(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.service.zReport(id, user);
  }

  @Post(':id/handover')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('pos.shift.operate')
  handover(
    @Param('id') id: string,
    @Body() body: { nextShiftId: string },
    @CurrentUser() user: UserSession,
  ) {
    return this.service.handover(id, body.nextShiftId, user);
  }
}
