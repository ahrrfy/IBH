import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DeliveryCompanyType } from '@prisma/client';
import { DeliveryCompaniesService } from './delivery-companies.service';
import { DeliveryZonesService } from './delivery-zones.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('delivery/companies')
export class DeliveryCompaniesController {
  constructor(
    private readonly companies: DeliveryCompaniesService,
    private readonly zones: DeliveryZonesService,
  ) {}

  // ─── Companies ─────────────────────────────────────────────

  @Get()
  @RequirePermission('Delivery', 'read')
  list(
    @CurrentUser() user: UserSession,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: DeliveryCompanyType,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
  ) {
    return this.companies.findAll(user.companyId, {
      page:     page ? Number(page) : undefined,
      limit:    limit ? Number(limit) : undefined,
      type,
      isActive: isActive === undefined ? undefined : isActive === 'true',
      search,
    });
  }

  @Get(':id')
  @RequirePermission('Delivery', 'read')
  findOne(@CurrentUser() user: UserSession, @Param('id') id: string) {
    return this.companies.findOne(id, user.companyId);
  }

  @Get(':id/scorecard')
  @RequirePermission('Delivery', 'read')
  scorecard(@CurrentUser() user: UserSession, @Param('id') id: string) {
    return this.companies.scorecard(id, user.companyId);
  }

  @Post()
  @RequirePermission('Delivery', 'create')
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: UserSession,
    @Body() body: {
      code: string;
      nameAr: string;
      nameEn?: string;
      type?: DeliveryCompanyType;
      contactPerson?: string;
      phone?: string;
      whatsapp?: string;
      email?: string;
      address?: string;
      commissionPct?: number | string;
      flatFeePerOrderIqd?: number | string;
      supportsCod?: boolean;
      codHoldingDays?: number;
      minOrderValueIqd?: number | string;
      maxOrderValueIqd?: number | string;
      notes?: string;
    },
  ) {
    return this.companies.create(user.companyId, body, user);
  }

  @Put(':id')
  @RequirePermission('Delivery', 'update')
  update(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.companies.update(id, user.companyId, body, user);
  }

  @Post(':id/deactivate')
  @RequirePermission('Delivery', 'update')
  @HttpCode(HttpStatus.OK)
  deactivate(@CurrentUser() user: UserSession, @Param('id') id: string) {
    return this.companies.deactivate(id, user.companyId, user);
  }

  @Delete(':id')
  @RequirePermission('Delivery', 'delete')
  remove(@CurrentUser() user: UserSession, @Param('id') id: string) {
    return this.companies.softDelete(id, user.companyId, user);
  }

  // ─── Zones (nested under companies controller for cohesion) ────

  @Get('/zones/list')
  @RequirePermission('Delivery', 'read')
  listZones(
    @CurrentUser() user: UserSession,
    @Query('parentId') parentId?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.zones.listZones(user.companyId, {
      parentId: parentId === '' || parentId === 'null' ? null : parentId,
      isActive: isActive === undefined ? undefined : isActive === 'true',
    });
  }

  @Get('/zones/:id')
  @RequirePermission('Delivery', 'read')
  findZone(@CurrentUser() user: UserSession, @Param('id') id: string) {
    return this.zones.findZone(id, user.companyId);
  }

  @Post('/zones')
  @RequirePermission('Delivery', 'create')
  @HttpCode(HttpStatus.CREATED)
  createZone(
    @CurrentUser() user: UserSession,
    @Body() body: {
      code: string;
      nameAr: string;
      nameEn?: string;
      parentId?: string;
      level?: number;
      city?: string;
      notes?: string;
    },
  ) {
    return this.zones.createZone(user.companyId, body, user);
  }

  @Put('/zones/:id')
  @RequirePermission('Delivery', 'update')
  updateZone(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.zones.updateZone(id, user.companyId, body, user);
  }

  @Delete('/zones/:id')
  @RequirePermission('Delivery', 'delete')
  deleteZone(@CurrentUser() user: UserSession, @Param('id') id: string) {
    return this.zones.deleteZone(id, user.companyId, user);
  }

  // ─── Rates ────────────────────────────────────────────────

  @Get('/rates/list')
  @RequirePermission('Delivery', 'read')
  listRates(
    @CurrentUser() user: UserSession,
    @Query('deliveryCompanyId') deliveryCompanyId?: string,
    @Query('deliveryZoneId') deliveryZoneId?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.zones.listRates(user.companyId, {
      deliveryCompanyId,
      deliveryZoneId,
      isActive: isActive === undefined ? undefined : isActive === 'true',
    });
  }

  @Post('/rates')
  @RequirePermission('Delivery', 'update')
  upsertRate(
    @CurrentUser() user: UserSession,
    @Body() body: {
      deliveryCompanyId: string;
      deliveryZoneId: string;
      baseFeeIqd: number | string;
      perKgIqd?: number | string;
      minFeeIqd?: number | string;
      maxFeeIqd?: number | string;
      estimatedHours?: number;
      validFrom?: string;
      validUntil?: string;
    },
  ) {
    return this.zones.upsertRate(user.companyId, body, user);
  }

  @Put('/rates/:id')
  @RequirePermission('Delivery', 'update')
  updateRate(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.zones.updateRate(id, user.companyId, body, user);
  }

  @Delete('/rates/:id')
  @RequirePermission('Delivery', 'delete')
  deleteRate(@CurrentUser() user: UserSession, @Param('id') id: string) {
    return this.zones.deleteRate(id, user.companyId, user);
  }
}
