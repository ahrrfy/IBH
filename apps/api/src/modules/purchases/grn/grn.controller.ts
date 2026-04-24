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
import { GRNService, CreateGRNDto, FindGRNsQuery } from './grn.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('purchases/grn')
export class GRNController {
  constructor(private readonly svc: GRNService) {}

  @Get()
  @RequirePermission('GRN', 'read')
  findAll(@CurrentUser() user: UserSession, @Query() query: FindGRNsQuery) {
    return this.svc.findAll(user.companyId, query);
  }

  @Get(':id')
  @RequirePermission('GRN', 'read')
  findOne(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.findOne(id, user.companyId);
  }

  @Post()
  @RequirePermission('GRN', 'create')
  create(@CurrentUser() user: UserSession, @Body() dto: CreateGRNDto) {
    return this.svc.create(user.companyId, dto, user);
  }

  @Post(':id/approve-quality')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('GRN', 'approve')
  approveQuality(
    @Param('id') id: string,
    @CurrentUser() user: UserSession,
    @Body() body: { qualityNotes: string },
  ) {
    return this.svc.approveQuality(id, user.companyId, body.qualityNotes, user);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('GRN', 'approve')
  reject(
    @Param('id') id: string,
    @CurrentUser() user: UserSession,
    @Body() body: { rejectionReason: string },
  ) {
    return this.svc.reject(id, user.companyId, body.rejectionReason, user);
  }
}
