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
import { Prisma } from '@prisma/client';
import { ulid } from 'ulid';

// ─── Products Service ──────────────────────────────────────────────────────────
// Manages ProductTemplate → ProductVariant → VariantBarcode hierarchy.
//
// Architecture (F3 aligned):
//   Template  = the product concept (name, attributes, type)
//   Variant   = the stockable unit (specific color/size combination)
//   Barcode   = one or more scan codes per variant
//   Stock     = lives on Variant, not Template (in M03 InventoryService)
//
// Key invariants:
//   - Templates without variants are invalid for POS/sales
//   - Barcode must be unique within a company
//   - Deleting a variant with stock is forbidden (soft-delete only)

export interface CreateTemplateDto {
  code:           string;
  nameAr:         string;
  nameEn?:        string;
  categoryId?:    string;
  unitId:         string;
  productType:    string;
  description?:   string;
  salePrice?:     number;
  costPrice?:     number;
  minSalePrice?:  number;
  trackStock:     boolean;
  attributes?:    Array<{ attributeId: string; values: string[] }>;
}

export interface CreateVariantDto {
  templateId:     string;
  sku:            string;
  nameAr?:        string;
  attributeValues: Record<string, string>; // { "color": "red", "size": "L" }
  salePrice?:     number;
  costPrice?:     number;
  imageUrl?:      string;
  barcodes?:      Array<{ barcode: string; isPrimary?: boolean }>;
}

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── Categories ───────────────────────────────────────────────────────────

  async getCategories(companyId: string) {
    return this.prisma.productCategory.findMany({
      where: { companyId, deletedAt: null },
      orderBy: [{ parentId: 'asc' }, { nameAr: 'asc' }],
    });
  }

  async createCategory(
    companyId: string,
    dto: { nameAr: string; nameEn?: string; parentId?: string; code?: string },
    session: UserSession,
  ) {
    return this.prisma.productCategory.create({
      data: { ...dto, companyId, createdBy: session.userId },
    });
  }

  // ─── Templates ────────────────────────────────────────────────────────────

  async findAllTemplates(companyId: string, params: {
    page?: number;
    limit?: number;
    search?: string;
    categoryId?: string;
    productType?: string;
  } = {}) {
    const { page = 1, limit = 20, search, categoryId, productType } = params;

    const where: Prisma.ProductTemplateWhereInput = {
      companyId,
      deletedAt: null,
      ...(search ? {
        OR: [
          { nameAr:  { contains: search } },
          { nameEn:  { contains: search, mode: 'insensitive' } },
          { code:    { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(productType ? { productType } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.productTemplate.findMany({
        where,
        include: {
          category:   { select: { id: true, nameAr: true } },
          unit:       { select: { id: true, code: true, nameAr: true } },
          _count: { select: { variants: true } },
        },
        orderBy: { nameAr: 'asc' },
        skip:  (page - 1) * limit,
        take:  limit,
      }),
      this.prisma.productTemplate.count({ where }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOneTemplate(id: string, companyId: string) {
    const template = await this.prisma.productTemplate.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        category:   true,
        unit:       true,
        attributes: { include: { attribute: true, values: true } },
        variants: {
          where: { deletedAt: null },
          include: {
            barcodes: true,
            inventoryBalances: {
              select: {
                warehouseId: true,
                qtyOnHand:   true,
                qtyReserved: true,
                avgCostIqd:  true,
              },
            },
          },
        },
      },
    });

    if (!template) {
      throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'الصنف غير موجود' });
    }

    return template;
  }

  async createTemplate(companyId: string, dto: CreateTemplateDto, session: UserSession) {
    // Check code uniqueness within company
    const existing = await this.prisma.productTemplate.findFirst({
      where: { code: dto.code.toUpperCase(), companyId, deletedAt: null },
    });

    if (existing) {
      throw new ConflictException({
        code: 'CONFLICT',
        messageAr: `كود الصنف ${dto.code} مستخدم مسبقاً`,
      });
    }

    // Validate category belongs to company
    if (dto.categoryId) {
      await this.prisma.productCategory.findFirstOrThrow({
        where: { id: dto.categoryId, companyId },
      }).catch(() => {
        throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'التصنيف غير موجود' });
      });
    }

    // Validate unit belongs to company
    await this.prisma.unitOfMeasure.findFirstOrThrow({
      where: { id: dto.unitId, companyId },
    }).catch(() => {
      throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'وحدة القياس غير موجودة' });
    });

    const template = await this.prisma.productTemplate.create({
      data: {
        code:           dto.code.toUpperCase(),
        nameAr:         dto.nameAr,
        nameEn:         dto.nameEn,
        categoryId:     dto.categoryId,
        unitId:         dto.unitId,
        productType:    dto.productType,
        description:    dto.description,
        salePriceIqd:   dto.salePrice    ? new Prisma.Decimal(dto.salePrice)    : null,
        costPriceIqd:   dto.costPrice    ? new Prisma.Decimal(dto.costPrice)    : null,
        minSalePriceIqd: dto.minSalePrice ? new Prisma.Decimal(dto.minSalePrice) : null,
        trackStock:     dto.trackStock,
        companyId,
        createdBy:      session.userId,
        isActive:       true,
      },
      include: { category: true, unit: true },
    });

    await this.audit.log({
      companyId,
      userId:     session.userId,
      userEmail:  session.userId,
      action:     'product.create',
      entityType: 'ProductTemplate',
      entityId:   template.id,
      after:      { code: template.code, nameAr: template.nameAr },
    });

    return template;
  }

  async updateTemplate(
    id: string,
    companyId: string,
    dto: Partial<{
      nameAr: string; nameEn: string; description: string;
      categoryId: string; salePrice: number; minSalePrice: number;
      isActive: boolean;
    }>,
    session: UserSession,
  ) {
    const template = await this.prisma.productTemplate.findFirstOrThrow({
      where: { id, companyId, deletedAt: null },
    }).catch(() => {
      throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'الصنف غير موجود' });
    });

    const updated = await this.prisma.productTemplate.update({
      where: { id },
      data: {
        ...(dto.nameAr       ? { nameAr: dto.nameAr }                             : {}),
        ...(dto.nameEn       ? { nameEn: dto.nameEn }                             : {}),
        ...(dto.description  ? { description: dto.description }                   : {}),
        ...(dto.categoryId   ? { categoryId: dto.categoryId }                     : {}),
        ...(dto.salePrice    ? { salePriceIqd: new Prisma.Decimal(dto.salePrice) } : {}),
        ...(dto.minSalePrice ? { minSalePriceIqd: new Prisma.Decimal(dto.minSalePrice) } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive }               : {}),
        updatedBy: session.userId,
      },
    });

    await this.audit.log({
      companyId,
      userId:     session.userId,
      userEmail:  session.userId,
      action:     'product.update',
      entityType: 'ProductTemplate',
      entityId:   id,
      before:     { nameAr: template.nameAr },
      after:      dto,
    });

    return updated;
  }

  async softDeleteTemplate(id: string, companyId: string, session: UserSession) {
    // Check no stock exists
    const hasStock = await this.prisma.inventoryBalance.findFirst({
      where: {
        variant: { templateId: id },
        qtyOnHand: { gt: 0 },
      },
    });

    if (hasStock) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'لا يمكن حذف صنف به رصيد في المخزون',
      });
    }

    await this.prisma.productTemplate.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: session.userId },
    });

    // Also soft-delete variants
    await this.prisma.productVariant.updateMany({
      where: { templateId: id },
      data: { deletedAt: new Date() },
    });
  }

  // ─── Variants ─────────────────────────────────────────────────────────────

  async createVariant(companyId: string, dto: CreateVariantDto, session: UserSession) {
    // Validate template belongs to company
    await this.prisma.productTemplate.findFirstOrThrow({
      where: { id: dto.templateId, companyId, deletedAt: null },
    }).catch(() => {
      throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'الصنف الأصل غير موجود' });
    });

    // Check SKU uniqueness
    const existingSku = await this.prisma.productVariant.findFirst({
      where: { sku: dto.sku.toUpperCase(), companyId: companyId, deletedAt: null },
    });

    if (existingSku) {
      throw new ConflictException({
        code: 'CONFLICT',
        messageAr: `الكود ${dto.sku} مستخدم مسبقاً`,
      });
    }

    // Check barcode uniqueness
    if (dto.barcodes?.length) {
      for (const b of dto.barcodes) {
        const existingBarcode = await this.prisma.variantBarcode.findFirst({
          where: { barcode: b.barcode, companyId },
        });
        if (existingBarcode) {
          throw new ConflictException({
            code: 'CONFLICT',
            messageAr: `الباركود ${b.barcode} مستخدم مسبقاً`,
          });
        }
      }
    }

    const variant = await this.prisma.productVariant.create({
      data: {
        sku:             dto.sku.toUpperCase(),
        nameAr:          dto.nameAr,
        attributeValues: dto.attributeValues,
        salePriceIqd:    dto.salePrice ? new Prisma.Decimal(dto.salePrice) : null,
        costPriceIqd:    dto.costPrice ? new Prisma.Decimal(dto.costPrice) : null,
        imageUrl:        dto.imageUrl,
        templateId:      dto.templateId,
        companyId,
        isActive:        true,
        createdBy:       session.userId,
        barcodes: dto.barcodes?.length ? {
          create: dto.barcodes.map((b, i) => ({
            barcode:   b.barcode,
            isPrimary: b.isPrimary ?? i === 0,
            companyId,
          })),
        } : undefined,
      },
      include: { barcodes: true },
    });

    return variant;
  }

  async updateVariant(
    variantId: string,
    companyId: string,
    dto: Partial<{ nameAr: string; salePrice: number; isActive: boolean; imageUrl: string }>,
    session: UserSession,
  ) {
    await this.prisma.productVariant.findFirstOrThrow({
      where: { id: variantId, companyId, deletedAt: null },
    }).catch(() => {
      throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'المتغير غير موجود' });
    });

    return this.prisma.productVariant.update({
      where: { id: variantId },
      data: {
        ...(dto.nameAr     ? { nameAr: dto.nameAr }                              : {}),
        ...(dto.salePrice  ? { salePriceIqd: new Prisma.Decimal(dto.salePrice) } : {}),
        ...(dto.imageUrl   ? { imageUrl: dto.imageUrl }                          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive }              : {}),
        updatedBy: session.userId,
      },
    });
  }

  // ─── Barcodes ─────────────────────────────────────────────────────────────

  async addBarcode(
    variantId: string,
    companyId: string,
    barcode: string,
    isPrimary: boolean,
    session: UserSession,
  ) {
    // Validate ownership
    await this.prisma.productVariant.findFirstOrThrow({
      where: { id: variantId, companyId, deletedAt: null },
    }).catch(() => {
      throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'المتغير غير موجود' });
    });

    // Check uniqueness
    const existing = await this.prisma.variantBarcode.findFirst({
      where: { barcode, companyId },
    });

    if (existing) {
      throw new ConflictException({
        code: 'CONFLICT',
        messageAr: `الباركود ${barcode} مستخدم مسبقاً`,
      });
    }

    // If marking as primary, demote existing primary
    if (isPrimary) {
      await this.prisma.variantBarcode.updateMany({
        where: { variantId },
        data: { isPrimary: false },
      });
    }

    return this.prisma.variantBarcode.create({
      data: { barcode, isPrimary, variantId, companyId },
    });
  }

  async lookupBarcode(barcode: string, companyId: string) {
    const found = await this.prisma.variantBarcode.findFirst({
      where: { barcode, companyId },
      include: {
        variant: {
          include: {
            template: {
              select: {
                id: true, nameAr: true, nameEn: true, code: true,
                salePriceIqd: true, unitId: true, trackStock: true,
                unit: { select: { code: true, nameAr: true } },
              },
            },
            inventoryBalances: {
              select: { warehouseId: true, qtyOnHand: true, qtyReserved: true },
            },
          },
        },
      },
    });

    if (!found) {
      throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'الباركود غير موجود' });
    }

    return found.variant;
  }

  // ─── Attributes ───────────────────────────────────────────────────────────

  async getAttributes(companyId: string) {
    return this.prisma.productAttribute.findMany({
      where: { companyId },
      include: { values: true },
      orderBy: { name: 'asc' },
    });
  }

  async createAttribute(
    companyId: string,
    dto: { name: string; type: string; values?: string[] },
    session: UserSession,
  ) {
    return this.prisma.productAttribute.create({
      data: {
        name:      dto.name,
        type:      dto.type,
        companyId,
        createdBy: session.userId,
        values: dto.values?.length ? {
          create: dto.values.map(v => ({ value: v })),
        } : undefined,
      },
      include: { values: true },
    });
  }
}
