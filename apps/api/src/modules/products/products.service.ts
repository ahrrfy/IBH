import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { AuditService } from '../../engines/audit/audit.service';
import type { UserSession } from '@erp/shared-types';
import { Prisma, ProductType, BarcodeType } from '@prisma/client';

// ─── Products Service ──────────────────────────────────────────────────────────
// Manages ProductTemplate → ProductVariant → VariantBarcode hierarchy.
// (F3 aligned)
//   Template  = the product concept (name, attributes, type)
//   Variant   = the stockable unit (specific color/size combination)
//   Barcode   = one or more scan codes per variant
//   Stock     = on Variant, handled by M03 InventoryService.

export interface CreateTemplateDto {
  sku:                     string;
  nameAr:                  string;
  nameEn?:                 string;
  categoryId:              string;
  brandId?:                string;
  baseUnitId:              string;
  saleUnitId?:             string;
  purchaseUnitId?:         string;
  type?:                   ProductType;
  description?:            string;
  defaultSalePriceIqd:     number;
  defaultPurchasePriceIqd: number;
  minSalePriceIqd:         number;
  tags?:                   string[];
  imageUrls?:              string[];
  isPublishedOnline?:      boolean;
}

export interface CreateVariantDto {
  templateId:      string;
  sku:             string;
  attributeValues: Record<string, string>;        // e.g. { "اللون": "أزرق" }
  weight?:         number;
  volume?:         number;
  imageUrl?:       string;
  barcodes?:       Array<{ barcode: string; isPrimary?: boolean; type?: BarcodeType }>;
}

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── Units of Measure ─────────────────────────────────────────────────────
  // Read-only lookup for UI pickers. Seeded via prisma/seed.ts (~14 units).

  async getUnits(companyId: string) {
    return this.prisma.unitOfMeasure.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ isBaseUnit: 'desc' }, { abbreviation: 'asc' }],
      select: {
        id: true, abbreviation: true, nameAr: true, nameEn: true,
        isBaseUnit: true,
      },
    });
  }

  // ─── Categories ───────────────────────────────────────────────────────────

  async getCategories(companyId: string) {
    return this.prisma.productCategory.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }, { nameAr: 'asc' }],
    });
  }

  async createCategory(
    companyId: string,
    dto: { nameAr: string; nameEn?: string; parentId?: string; glAccountId?: string; cogsAccountId?: string },
    session: UserSession,
  ) {
    const category = await this.prisma.productCategory.create({
      data: {
        companyId,
        nameAr:         dto.nameAr,
        nameEn:         dto.nameEn,
        parentId:       dto.parentId,
        glAccountId:    dto.glAccountId,
        cogsAccountId:  dto.cogsAccountId,
      },
    });

    await this.audit.log({
      companyId,
      userId:     session.userId,
      userEmail:  session.userId,
      action:     'product_category.create',
      entityType: 'ProductCategory',
      entityId:   category.id,
      after:      { nameAr: dto.nameAr },
    });

    return category;
  }

  // ─── Templates ────────────────────────────────────────────────────────────

  async findAllTemplates(companyId: string, params: {
    page?:        number;
    limit?:       number;
    search?:      string;
    categoryId?:  string;
    productType?: ProductType;
  } = {}) {
    const { page = 1, limit = 20, search, categoryId, productType } = params;

    const where: Prisma.ProductTemplateWhereInput = {
      companyId,
      deletedAt: null,
      ...(search ? {
        OR: [
          { nameAr: { contains: search } },
          { nameEn: { contains: search, mode: Prisma.QueryMode.insensitive } },
          { sku:    { contains: search, mode: Prisma.QueryMode.insensitive } },
        ],
      } : {}),
      ...(categoryId  ? { categoryId } : {}),
      ...(productType ? { type: productType } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.productTemplate.findMany({
        where,
        include: {
          category: { select: { id: true, nameAr: true } },
          _count:   { select: { variants: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.productTemplate.count({ where }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOneTemplate(id: string, companyId: string) {
    const template = await this.prisma.productTemplate.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        category: true,
        variants: {
          where: { deletedAt: null },
          include: {
            barcodes:          true,
            inventoryBalances: { include: { warehouse: { select: { id: true, code: true, nameAr: true } } } },
          },
        },
      },
    });

    if (!template) {
      throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'المنتج غير موجود' });
    }

    return template;
  }

  async createTemplate(
    companyId: string,
    dto: CreateTemplateDto,
    session: UserSession,
  ) {
    // SKU uniqueness per company
    const existing = await this.prisma.productTemplate.findFirst({
      where: { companyId, sku: dto.sku, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'CONFLICT',
        messageAr: `رمز المنتج "${dto.sku}" مستخدم مسبقاً`,
      });
    }

    // Validate category + units belong to this company
    const [category, baseUnit] = await Promise.all([
      this.prisma.productCategory.findFirst({ where: { id: dto.categoryId, companyId }, select: { id: true } }),
      this.prisma.unitOfMeasure.findFirst({    where: { id: dto.baseUnitId,  companyId }, select: { id: true } }),
    ]);
    if (!category)  throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'التصنيف غير موجود' });
    if (!baseUnit)  throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'وحدة القياس غير موجودة' });

    const template = await this.prisma.productTemplate.create({
      data: {
        companyId,
        sku:                      dto.sku.toUpperCase(),
        nameAr:                   dto.nameAr,
        nameEn:                   dto.nameEn,
        categoryId:               dto.categoryId,
        brandId:                  dto.brandId,
        baseUnitId:               dto.baseUnitId,
        saleUnitId:               dto.saleUnitId ?? dto.baseUnitId,
        purchaseUnitId:           dto.purchaseUnitId ?? dto.baseUnitId,
        type:                     dto.type ?? ProductType.storable,
        description:              dto.description,
        defaultSalePriceIqd:      new Prisma.Decimal(dto.defaultSalePriceIqd),
        defaultPurchasePriceIqd:  new Prisma.Decimal(dto.defaultPurchasePriceIqd),
        minSalePriceIqd:          new Prisma.Decimal(dto.minSalePriceIqd),
        tags:                     dto.tags ?? [],
        imageUrls:                dto.imageUrls ?? [],
        isPublishedOnline:        dto.isPublishedOnline ?? false,
        createdBy:                session.userId,
        updatedBy:                session.userId,
      },
    });

    await this.audit.log({
      companyId,
      userId:     session.userId,
      userEmail:  session.userId,
      action:     'product_template.create',
      entityType: 'ProductTemplate',
      entityId:   template.id,
      after:      { sku: template.sku, nameAr: template.nameAr },
    });

    return template;
  }

  async updateTemplate(
    id: string,
    companyId: string,
    dto: Partial<{
      nameAr: string;
      nameEn: string;
      description: string;
      categoryId: string;
      defaultSalePriceIqd: number;
      minSalePriceIqd: number;
      isActive: boolean;
      imageUrls: string[];
      tags: string[];
      isPublishedOnline: boolean;
    }>,
    session: UserSession,
  ) {
    const before = await this.prisma.productTemplate.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!before) {
      throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'المنتج غير موجود' });
    }

    const data: Prisma.ProductTemplateUpdateInput = { updatedBy: { set: session.userId } };
    if (dto.nameAr              !== undefined) data.nameAr              = dto.nameAr;
    if (dto.nameEn              !== undefined) data.nameEn              = dto.nameEn;
    if (dto.description         !== undefined) data.description         = dto.description;
    if (dto.isActive            !== undefined) data.isActive            = dto.isActive;
    if (dto.imageUrls           !== undefined) data.imageUrls           = dto.imageUrls;
    if (dto.tags                !== undefined) data.tags                = dto.tags;
    if (dto.isPublishedOnline   !== undefined) data.isPublishedOnline   = dto.isPublishedOnline;
    if (dto.categoryId          !== undefined) data.category            = { connect: { id: dto.categoryId } };
    if (dto.defaultSalePriceIqd !== undefined) data.defaultSalePriceIqd = new Prisma.Decimal(dto.defaultSalePriceIqd);
    if (dto.minSalePriceIqd     !== undefined) data.minSalePriceIqd     = new Prisma.Decimal(dto.minSalePriceIqd);

    const updated = await this.prisma.productTemplate.update({
      where: { id },
      data,
    });

    await this.audit.log({
      companyId,
      userId:     session.userId,
      userEmail:  session.userId,
      action:     'product_template.update',
      entityType: 'ProductTemplate',
      entityId:   id,
      before,
      after:      dto,
    });

    return updated;
  }

  async softDeleteTemplate(id: string, companyId: string, session: UserSession) {
    const template = await this.prisma.productTemplate.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        variants: {
          where: { deletedAt: null },
          include: { inventoryBalances: true },
        },
      },
    });
    if (!template) {
      throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'المنتج غير موجود' });
    }

    // Block delete if any variant still has stock on hand
    const hasStock = template.variants.some((v) =>
      v.inventoryBalances.some((b) => Number(b.qtyOnHand) > 0),
    );
    if (hasStock) {
      throw new BadRequestException({
        code: 'HAS_STOCK',
        messageAr: 'لا يمكن حذف منتج له رصيد في المخزون',
      });
    }

    await this.prisma.productTemplate.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: session.userId, isActive: false },
    });

    await this.audit.log({
      companyId,
      userId:     session.userId,
      userEmail:  session.userId,
      action:     'product_template.delete',
      entityType: 'ProductTemplate',
      entityId:   id,
    });
  }

  // ─── Variants ─────────────────────────────────────────────────────────────

  async createVariant(
    companyId: string,
    dto: CreateVariantDto,
    session: UserSession,
  ) {
    // Ensure template belongs to this company
    const template = await this.prisma.productTemplate.findFirst({
      where: { id: dto.templateId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!template) {
      throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'قالب المنتج غير موجود' });
    }

    // SKU uniqueness per company
    const existing = await this.prisma.productVariant.findFirst({
      where: { companyId, sku: dto.sku, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'CONFLICT',
        messageAr: `SKU "${dto.sku}" مستخدم مسبقاً`,
      });
    }

    // Barcode uniqueness (if provided)
    if (dto.barcodes?.length) {
      const dups = await this.prisma.variantBarcode.findMany({
        where: { companyId, barcode: { in: dto.barcodes.map((b) => b.barcode) } },
        select: { barcode: true },
      });
      if (dups.length) {
        throw new ConflictException({
          code: 'CONFLICT',
          messageAr: `الباركود مستخدم مسبقاً: ${dups.map((d) => d.barcode).join(', ')}`,
        });
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.create({
        data: {
          companyId,
          templateId:      dto.templateId,
          sku:             dto.sku.toUpperCase(),
          attributeValues: dto.attributeValues as Prisma.InputJsonValue,
          imageUrl:        dto.imageUrl,
          weight:          dto.weight    !== undefined ? new Prisma.Decimal(dto.weight)    : null,
          volume:          dto.volume    !== undefined ? new Prisma.Decimal(dto.volume)    : null,
          createdBy:       session.userId,
          updatedBy:       session.userId,
          barcodes: dto.barcodes?.length
            ? {
                create: dto.barcodes.map((b, i) => ({
                  companyId,
                  barcode:     b.barcode,
                  barcodeType: b.type ?? BarcodeType.EAN13,
                  isPrimary:   b.isPrimary ?? i === 0,
                })),
              }
            : undefined,
        },
        include: { barcodes: true },
      });

      await this.audit.log({
        companyId,
        userId:     session.userId,
        userEmail:  session.userId,
        action:     'product_variant.create',
        entityType: 'ProductVariant',
        entityId:   variant.id,
        after:      { sku: variant.sku, templateId: dto.templateId },
      });

      return variant;
    });
  }

  async updateVariant(
    id: string,
    companyId: string,
    dto: Partial<{ imageUrl: string; isActive: boolean; weight: number; volume: number }>,
    session: UserSession,
  ) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!variant) {
      throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'المتغير غير موجود' });
    }

    const data: Prisma.ProductVariantUpdateInput = { updatedBy: { set: session.userId } };
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.weight   !== undefined) data.weight   = new Prisma.Decimal(dto.weight);
    if (dto.volume   !== undefined) data.volume   = new Prisma.Decimal(dto.volume);

    return this.prisma.productVariant.update({ where: { id }, data });
  }

  async addBarcode(
    variantId: string,
    companyId: string,
    barcode: string,
    isPrimary: boolean,
    session: UserSession,
  ) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!variant) {
      throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'المتغير غير موجود' });
    }

    const existing = await this.prisma.variantBarcode.findFirst({
      where: { companyId, barcode },
    });
    if (existing) {
      throw new ConflictException({
        code: 'CONFLICT',
        messageAr: `الباركود "${barcode}" مستخدم مسبقاً`,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.variantBarcode.updateMany({
          where: { variantId, isPrimary: true },
          data:  { isPrimary: false },
        });
      }
      const created = await tx.variantBarcode.create({
        data: {
          variantId,
          companyId,
          barcode,
          isPrimary,
          barcodeType: BarcodeType.EAN13,
        },
      });

      await this.audit.log({
        companyId,
        userId:     session.userId,
        userEmail:  session.userId,
        action:     'variant_barcode.create',
        entityType: 'VariantBarcode',
        entityId:   created.id,
        after:      { barcode, variantId, isPrimary },
      });

      return created;
    });
  }

  // ─── Barcode lookup (used by POS) ─────────────────────────────────────────

  async lookupBarcode(barcode: string, companyId: string) {
    const row = await this.prisma.variantBarcode.findFirst({
      where: { companyId, barcode },
      include: {
        variant: {
          include: {
            template:          { select: { id: true, sku: true, nameAr: true, defaultSalePriceIqd: true } },
            inventoryBalances: { select: { warehouseId: true, qtyOnHand: true, qtyReserved: true, avgCostIqd: true } },
          },
        },
      },
    });

    if (!row) {
      throw new NotFoundException({ code: 'BARCODE_NOT_FOUND', messageAr: 'الباركود غير معروف' });
    }

    return {
      variantId:         row.variant.id,
      sku:               row.variant.sku,
      templateNameAr:    row.variant.template.nameAr,
      defaultSalePriceIqd: row.variant.template.defaultSalePriceIqd,
      barcode:           row.barcode,
      inventoryBalances: row.variant.inventoryBalances,
    };
  }

  // ─── Attributes ───────────────────────────────────────────────────────────

  async getAttributes(companyId: string) {
    return this.prisma.productAttribute.findMany({
      where: { companyId, isActive: true },
      include: { values: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { nameAr: 'asc' },
    });
  }

  async createAttribute(
    companyId: string,
    dto: { nameAr: string; nameEn?: string; type?: string; values?: string[] },
    session: UserSession,
  ) {
    const attr = await this.prisma.productAttribute.create({
      data: {
        companyId,
        nameAr: dto.nameAr,
        nameEn: dto.nameEn,
        type:   dto.type ?? 'select',
        values: dto.values?.length
          ? {
              create: dto.values.map((v, i) => ({ valueAr: v, sortOrder: i })),
            }
          : undefined,
      },
      include: { values: true },
    });

    await this.audit.log({
      companyId,
      userId:     session.userId,
      userEmail:  session.userId,
      action:     'product_attribute.create',
      entityType: 'ProductAttribute',
      entityId:   attr.id,
      after:      { nameAr: dto.nameAr },
    });

    return attr;
  }
}
