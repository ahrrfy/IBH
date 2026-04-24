import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  AssetsService,
  CreateAssetDto,
  RecordMaintenanceDto,
  DisposeAssetDto,
} from './assets.service';
import { DepreciationService } from './depreciation.service';
import { CurrentUser } from '../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('assets')
export class AssetsController {
  constructor(
    private readonly svc: AssetsService,
    private readonly depreciation: DepreciationService,
  ) {}

  @Post()
  @RequirePermission('FixedAsset', 'create')
  create(@Body() dto: CreateAssetDto, @CurrentUser() session: UserSession) {
    return this.svc.create(dto, session);
  }

  @Get()
  @RequirePermission('FixedAsset', 'read')
  findAll(
    @CurrentUser() session: UserSession,
    @Query('status') status?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.svc.findAll(session.companyId, { status, branchId });
  }

  @Get(':id')
  @RequirePermission('FixedAsset', 'read')
  findOne(@Param('id') id: string, @CurrentUser() session: UserSession) {
    return this.svc.findOne(id, session.companyId);
  }

  @Patch(':id')
  @RequirePermission('FixedAsset', 'update')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateAssetDto>,
    @CurrentUser() session: UserSession,
  ) {
    return this.svc.update(id, dto, session);
  }

  @Post(':id/maintenance')
  @RequirePermission('FixedAsset', 'update')
  maintenance(
    @Param('id') id: string,
    @Body() dto: Omit<RecordMaintenanceDto, 'assetId'>,
    @CurrentUser() session: UserSession,
  ) {
    return this.svc.recordMaintenance({ ...dto, assetId: id }, session);
  }

  @Post(':id/dispose')
  @RequirePermission('FixedAsset', 'dispose')
  dispose(
    @Param('id') id: string,
    @Body() dto: Omit<DisposeAssetDto, 'assetId'>,
    @CurrentUser() session: UserSession,
  ) {
    return this.svc.dispose({ ...dto, assetId: id }, session);
  }

  @Post(':id/transfer')
  @RequirePermission('FixedAsset', 'update')
  transfer(
    @Param('id') id: string,
    @Body() body: { toBranchId: string },
    @CurrentUser() session: UserSession,
  ) {
    return this.svc.transfer(id, body.toBranchId, session);
  }

  @Get(':id/depreciation-schedule')
  @RequirePermission('FixedAsset', 'read')
  schedule(@Param('id') id: string, @CurrentUser() session: UserSession) {
    return this.depreciation.depreciationSchedule(id, session.companyId);
  }

  @Post('depreciation/generate')
  @RequirePermission('Depreciation', 'post')
  generate(
    @Body() body: { year: number; month: number },
    @CurrentUser() session: UserSession,
  ) {
    return this.depreciation.generateMonthlyDepreciation(
      session.companyId,
      body.year,
      body.month,
      session,
    );
  }

  @Post(':id/depreciation/:year/:month/reverse')
  @RequirePermission('Depreciation', 'post')
  reverse(
    @Param('id') id: string,
    @Param('year') year: string,
    @Param('month') month: string,
    @Body() body: { reason: string },
    @CurrentUser() session: UserSession,
  ) {
    return this.depreciation.reverseDepreciation(
      id,
      Number(year),
      Number(month),
      body.reason,
      session,
    );
  }
}
