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
import {
  SuppliersService,
  CreateSupplierDto,
  SetSupplierPriceDto,
  FindSuppliersQuery,
} from './suppliers.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('purchases/suppliers')
export class SuppliersController {
  constructor(private readonly svc: SuppliersService) {}

  @Get()
  @RequirePermission('Supplier', 'read')
  findAll(@CurrentUser() user: UserSession, @Query() query: FindSuppliersQuery) {
    return this.svc.findAll(user.companyId, {
      ...query,
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      isActive:
        typeof query.isActive === 'string'
          ? (query.isActive as any) === 'true'
          : query.isActive,
    });
  }

  @Get('compare')
  @RequirePermission('Supplier', 'read')
  compare(@CurrentUser() user: UserSession, @Query('variantId') variantId: string) {
    return this.svc.comparePricesForVariant(variantId, user.companyId);
  }

  @Get('ap-aging')
  @RequirePermission('VendorInvoice', 'read')
  apAging(@CurrentUser() user: UserSession) {
    return this.svc.getApAgingReport(user.companyId);
  }

  @Get(':id')
  @RequirePermission('Supplier', 'read')
  findOne(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.findOne(id, user.companyId);
  }

  @Get(':id/prices')
  @RequirePermission('Supplier', 'read')
  prices(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.getSupplierPrices(id, user.companyId);
  }

  @Get(':id/scorecard')
  @RequirePermission('Supplier', 'read')
  scorecard(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.scorecard(id, user.companyId);
  }

  @Post()
  @RequirePermission('Supplier', 'create')
  create(@CurrentUser() user: UserSession, @Body() dto: CreateSupplierDto) {
    return this.svc.create(user.companyId, dto, user);
  }

  @Post(':id/prices')
  @RequirePermission('Supplier', 'update')
  setPrice(
    @Param('id') id: string,
    @CurrentUser() user: UserSession,
    @Body() dto: Omit<SetSupplierPriceDto, 'supplierId'>,
  ) {
    return this.svc.setSupplierPrice(user.companyId, { ...dto, supplierId: id }, user);
  }

  @Put(':id')
  @RequirePermission('Supplier', 'update')
  update(
    @Param('id') id: string,
    @CurrentUser() user: UserSession,
    @Body() dto: Partial<CreateSupplierDto>,
  ) {
    return this.svc.update(id, user.companyId, dto, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('Supplier', 'delete')
  remove(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.softDelete(id, user.companyId, user);
  }
}
