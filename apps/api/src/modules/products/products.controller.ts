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
import { ProductsService } from './products.service';
import { PriceListsService } from './price-lists/price-lists.service';
import { CurrentUser } from '../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly priceListsService: PriceListsService,
  ) {}

  // ─── Categories ───────────────────────────────────────────────────────────

  @Get('categories')
  @RequirePermission('Product', 'read')
  async getCategories(@CurrentUser() user: UserSession) {
    return this.productsService.getCategories(user.companyId);
  }

  @Post('categories')
  @RequirePermission('Product', 'create')
  async createCategory(
    @Body() body: { nameAr: string; nameEn?: string; parentId?: string; code?: string },
    @CurrentUser() user: UserSession,
  ) {
    return this.productsService.createCategory(user.companyId, body, user);
  }

  // ─── Attributes ───────────────────────────────────────────────────────────

  @Get('attributes')
  @RequirePermission('Product', 'read')
  async getAttributes(@CurrentUser() user: UserSession) {
    return this.productsService.getAttributes(user.companyId);
  }

  @Post('attributes')
  @RequirePermission('Product', 'create')
  async createAttribute(
    @Body() body: { nameAr: string; nameEn?: string; type?: string; values?: string[] },
    @CurrentUser() user: UserSession,
  ) {
    return this.productsService.createAttribute(user.companyId, body, user);
  }

  // ─── Barcode Lookup ───────────────────────────────────────────────────────

  @Get('barcode/:code')
  @RequirePermission('Product', 'read')
  async lookupBarcode(
    @Param('code') code: string,
    @CurrentUser() user: UserSession,
  ) {
    return this.productsService.lookupBarcode(code, user.companyId);
  }

  // ─── Templates ────────────────────────────────────────────────────────────

  @Get()
  @RequirePermission('Product', 'read')
  async findAll(
    @CurrentUser() user: UserSession,
    @Query('page')        page?: string,
    @Query('limit')       limit?: string,
    @Query('search')      search?: string,
    @Query('categoryId')  categoryId?: string,
    @Query('type')        productType?: string,
  ) {
    return this.productsService.findAllTemplates(user.companyId, {
      page:  page  ? parseInt(page, 10)  : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      search,
      categoryId,
      productType: productType as any,
    });
  }

  @Get(':id')
  @RequirePermission('Product', 'read')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: UserSession,
  ) {
    return this.productsService.findOneTemplate(id, user.companyId);
  }

  @Post()
  @RequirePermission('Product', 'create')
  async create(
    @Body() body: {
      sku: string; nameAr: string; nameEn?: string;
      categoryId: string; baseUnitId: string;
      saleUnitId?: string; purchaseUnitId?: string;
      type?: string; brandId?: string;
      description?: string;
      defaultSalePriceIqd: number;
      defaultPurchasePriceIqd: number;
      minSalePriceIqd: number;
      tags?: string[];
      imageUrls?: string[];
      isPublishedOnline?: boolean;
    },
    @CurrentUser() user: UserSession,
  ) {
    return this.productsService.createTemplate(user.companyId, { ...body, type: body.type as any }, user);
  }

  @Put(':id')
  @RequirePermission('Product', 'update')
  async update(
    @Param('id') id: string,
    @Body() body: {
      nameAr?: string; nameEn?: string; description?: string;
      categoryId?: string; salePrice?: number; minSalePrice?: number; isActive?: boolean;
    },
    @CurrentUser() user: UserSession,
  ) {
    return this.productsService.updateTemplate(id, user.companyId, body, user);
  }

  @Delete(':id')
  @RequirePermission('Product', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: UserSession,
  ) {
    await this.productsService.softDeleteTemplate(id, user.companyId, user);
  }

  // ─── Variants ─────────────────────────────────────────────────────────────

  @Post('variants')
  @RequirePermission('ProductVariant', 'create')
  async createVariant(
    @Body() body: {
      templateId: string; sku: string; nameAr?: string;
      attributeValues: Record<string, string>;
      salePrice?: number; costPrice?: number; imageUrl?: string;
      barcodes?: Array<{ barcode: string; isPrimary?: boolean }>;
    },
    @CurrentUser() user: UserSession,
  ) {
    return this.productsService.createVariant(user.companyId, body, user);
  }

  @Put('variants/:id')
  @RequirePermission('ProductVariant', 'update')
  async updateVariant(
    @Param('id') id: string,
    @Body() body: { nameAr?: string; salePrice?: number; isActive?: boolean; imageUrl?: string },
    @CurrentUser() user: UserSession,
  ) {
    return this.productsService.updateVariant(id, user.companyId, body, user);
  }

  @Post('variants/:id/barcodes')
  @RequirePermission('ProductVariant', 'update')
  async addBarcode(
    @Param('id') id: string,
    @Body() body: { barcode: string; isPrimary?: boolean },
    @CurrentUser() user: UserSession,
  ) {
    return this.productsService.addBarcode(id, user.companyId, body.barcode, body.isPrimary ?? false, user);
  }

  // ─── Price Lists ──────────────────────────────────────────────────────────

  @Get('price-lists')
  @RequirePermission('PriceList', 'read')
  async getPriceLists(@CurrentUser() user: UserSession) {
    return this.priceListsService.findAll(user.companyId);
  }

  @Post('price-lists')
  @RequirePermission('PriceList', 'create')
  async createPriceList(
    @Body() body: { nameAr: string; type?: string; currency?: string; isDefault?: boolean },
    @CurrentUser() user: UserSession,
  ) {
    return this.priceListsService.create(user.companyId, body, user);
  }

  @Get('price-lists/:id/items')
  @RequirePermission('PriceList', 'read')
  async getPriceListItems(
    @Param('id') id: string,
    @CurrentUser() user: UserSession,
    @Query('page')   page?: string,
    @Query('limit')  limit?: string,
    @Query('search') search?: string,
  ) {
    return this.priceListsService.getItems(id, user.companyId, {
      page:  page  ? parseInt(page, 10)  : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      search,
    });
  }

  @Post('price-lists/:id/items')
  @RequirePermission('PriceList', 'update')
  async setPriceListItem(
    @Param('id') id: string,
    @Body() body: {
      variantId: string; priceIqd: number;
      effectiveFrom?: string; effectiveTo?: string; minQty?: number;
    },
    @CurrentUser() user: UserSession,
  ) {
    return this.priceListsService.setPrice(id, user.companyId, {
      variantId:     body.variantId,
      priceIqd:      body.priceIqd,
      effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : undefined,
      effectiveTo:   body.effectiveTo   ? new Date(body.effectiveTo)   : undefined,
    }, user);
  }

  @Post('price-lists/:id/items/bulk')
  @RequirePermission('PriceList', 'update')
  async bulkSetPrices(
    @Param('id') id: string,
    @Body('entries') entries: Array<{ variantId?: string; sku?: string; priceIqd: number; effectiveFrom?: string }>,
    @CurrentUser() user: UserSession,
  ) {
    return this.priceListsService.bulkSetPrices(
      id,
      user.companyId,
      entries.map(e => ({ ...e, effectiveFrom: e.effectiveFrom ? new Date(e.effectiveFrom) : undefined })),
      user,
    );
  }
}
