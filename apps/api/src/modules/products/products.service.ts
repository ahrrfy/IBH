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
  /** T41: 3-field structured naming. name1 is required; name2/name3 are optional descriptors. */
  name1?:                  string;
  name2?:                  string;
  name3?:                  string;
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

/**
 * Compose the canonical full name for a product template from the 3 structured
 * fields. Falls back to `nameAr` when name1 is blank (handles legacy callers
 * that still send the single nameAr field).
 */
export function buildGeneratedFullName(parts: {
  name1?: string | null;
  name2?: string | null;
  name3?: string | null;
  fallback?: string;
}): string {
  const segments = [parts.name1, parts.name2, parts.name3]
    .map((s) => (s ?? '').trim())
    .filter((s) => s.length > 0);
  if (segments.length === 0) return (parts.fallback ?? '').trim();
  return segments.join(' ');
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

  /**
   * T41: Hierarchical category tree. Builds a single in-memory pass — O(n).
   * Each node carries its own children array (empty for leaves).
   */
  async getCategoryTree(companyId: string) {
    type Node = {
      id: string;
      nameAr: string;
      nameEn: string | null;
      parentId: string | null;
      level: number;
      path: string;
      sortOrder: number;
      isActive: boolean;
      children: Node[];
    };

    const rows = await this.prisma.productCategory.findMany({
      where: { companyId },
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { nameAr: 'asc' }],
      select: {
        id: true, nameAr: true, nameEn: true, parentId: true,
        level: true, path: true, sortOrder: true, isActive: true,
      },
    });

    const byId = new Map<string, Node>();
    const roots: Node[] = [];
    for (const r of rows) {
      byId.set(r.id, { ...r, children: [] });
    }
    for (const node of byId.values()) {
      if (node.parentId && byId.has(node.parentId)) {
        byId.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  async createCategory(
    companyId: string,
    dto: { nameAr: string; nameEn?: string; parentId?: string; glAccountId?: string; cogsAccountId?: string },
    session: UserSession,
  ) {
    // T41: compute level + path from parent (or default to root).
    let level = 0;
    let parentPath = '';
    if (dto.parentId) {
      const parent = await this.prisma.productCategory.findFirst({
        where: { id: dto.parentId, companyId },
        select: { id: true, level: true, path: true },
      });
      if (!parent) {
        throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'التصنيف الأب غير موجود' });
      }
      level = parent.level + 1;
      parentPath = parent.path || `/${parent.id}`;
    }

    const category = await this.prisma.$transaction(async (tx) => {
      const created = await tx.productCategory.create({
        data: {
          companyId,
          nameAr:         dto.nameAr,
          nameEn:         dto.nameEn,
          parentId:       dto.parentId,
          glAccountId:    dto.glAccountId,
          cogsAccountId:  dto.cogsAccountId,
          level,
          path:           '', // set in next step (we need the new id)
        },
      });
      const path = `${parentPath}/${created.id}`;
      return tx.productCategory.update({ where: { id: created.id }, data: { path } });
    });

    await this.audit.log({
      companyId,
      userId:     session.userId,
      userEmail:  session.userId,
      action:     'product_category.create',
      entityType: 'ProductCategory',
      entityId:   category.id,
      after:      { nameAr: dto.nameAr, parentId: dto.parentId, path: category.path },
    });

    return category;
  }

  /**
   * T41: Reparent (or rename-affecting-path) a category and recompute path/level
   * for the node and **every descendant** transactionally. Cycle-safe — refuses
   * to set parent to a descendant of self.
   */
  async updateCategoryParent(
    id: string,
    companyId: string,
    newParentId: string | null,
    session: UserSession,
  ) {
    const node = await this.prisma.productCategory.findFirst({
      where: { id, companyId },
      select: { id: true, path: true, parentId: true },
    });
    if (!node) {
      throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'التصنيف غير موجود' });
    }

    let newLevel = 0;
    let newParentPath = '';
    if (newParentId) {
      const parent = await this.prisma.productCategory.findFirst({
        where: { id: newParentId, companyId },
        select: { id: true, level: true, path: true },
      });
      if (!parent) {
        throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'التصنيف الأب غير موجود' });
      }
      // Cycle check: parent's path must not contain this node.
      if (parent.path.includes(`/${id}`)) {
        throw new BadRequestException({ code: 'CYCLE', messageAr: 'لا يمكن تعيين تصنيف فرعي كأب' });
      }
      newLevel = parent.level + 1;
      newParentPath = parent.path || `/${parent.id}`;
    }

    const newPath = `${newParentPath}/${id}`;
    const oldPath = node.path || `/${id}`;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.productCategory.update({
        where: { id },
        data: { parentId: newParentId, level: newLevel, path: newPath },
      });

      // Re-path all descendants. We use raw SQL for atomic set-based update,
      // staying safe via Prisma's $executeRaw template-literal (parameterised).
      const oldPrefix = `${oldPath}/`;
      const newPrefix = `${newPath}/`;
      await tx.$executeRaw`
        UPDATE "product_categories"
           SET "path"  = ${newPrefix} || substring("path" from ${oldPrefix.length + 1}),
               "level" = "level" + ${newLevel - (oldPath.split('/').length - 2)}
         WHERE "companyId" = ${companyId}
           AND "path" LIKE ${oldPrefix + '%'}
      `;

      await this.audit.log({
        companyId,
        userId:     session.userId,
        userEmail:  session.userId,
        action:     'product_category.reparent',
        entityType: 'ProductCategory',
        entityId:   id,
        before:     { parentId: node.parentId, path: oldPath },
        after:      { parentId: newParentId, path: newPath },
      });

      return updated;
    });
  }

  // ─── Duplicate detection (T41) ────────────────────────────────────────────

  /**
   * Live duplicate check used by the New-Product UI. Matches case-insensitively
   * and in a trimmed/space-collapsed manner against existing generatedFullName
   * within the caller's company. Returns up to 5 closest hits.
   */
  async checkProductDuplicate(
    companyId: string,
    parts: { name1?: string; name2?: string; name3?: string },
  ) {
    const candidate = buildGeneratedFullName(parts).toLowerCase();
    if (!candidate) return { matches: [] };

    // Match either an exact full-name hit or any row whose generatedFullName
    // contains the candidate (catches typos in optional fields).
    const matches = await this.prisma.productTemplate.findMany({
      where: {
        companyId,
        deletedAt: null,
        OR: [
          { generatedFullName: { equals: candidate, mode: Prisma.QueryMode.insensitive } },
          { generatedFullName: { contains: candidate, mode: Prisma.QueryMode.insensitive } },
          { name1: { equals: (parts.name1 ?? '').trim(), mode: Prisma.QueryMode.insensitive } },
        ],
      },
      select: {
        id: true, sku: true, nameAr: true,
        name1: true, name2: true, name3: true,
        generatedFullName: true,
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
    });
    return { matches };
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

    // T41: derive the structured naming. If only nameAr was sent (legacy clients)
    // we copy it into name1 so generatedFullName is never empty.
    const name1 = (dto.name1 ?? dto.nameAr ?? '').trim();
    const name2 = dto.name2?.trim() || null;
    const name3 = dto.name3?.trim() || null;
    const generatedFullName = buildGeneratedFullName({ name1, name2, name3, fallback: dto.nameAr });

    const template = await this.prisma.productTemplate.create({
      data: {
        companyId,
        sku:                      dto.sku.toUpperCase(),
        nameAr:                   dto.nameAr,
        nameEn:                   dto.nameEn,
        name1,
        name2,
        name3,
        generatedFullName,
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
      name1: string;
      name2: string | null;
      name3: string | null;
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
    // T41: if any of the 3 naming fields changed (or nameAr was edited and name1
    // is currently mirroring it), recompute name1..3 + generatedFullName atomically.
    const nameFieldsTouched =
      dto.name1 !== undefined ||
      dto.name2 !== undefined ||
      dto.name3 !== undefined ||
      dto.nameAr !== undefined;
    if (nameFieldsTouched) {
      const next1 = (dto.name1 ?? before.name1 ?? dto.nameAr ?? before.nameAr ?? '').trim();
      const next2Raw = dto.name2 !== undefined ? dto.name2 : before.name2;
      const next3Raw = dto.name3 !== undefined ? dto.name3 : before.name3;
      const next2 = (next2Raw ?? '').trim() || null;
      const next3 = (next3Raw ?? '').trim() || null;
      data.name1 = next1;
      data.name2 = next2;
      data.name3 = next3;
      data.generatedFullName = buildGeneratedFullName({
        name1: next1,
        name2: next2,
        name3: next3,
        fallback: dto.nameAr ?? before.nameAr,
      });
    }
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
