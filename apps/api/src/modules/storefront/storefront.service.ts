import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { SequenceService } from '../../engines/sequence/sequence.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  assertStorefrontConfig,
  readStorefrontConfig,
  StorefrontConfig,
} from './storefront.config';

/** Iraqi mobile prefix sanity check — accepts 07XXXXXXXXX (11 digits). */
const IRAQ_PHONE_RE = /^07\d{9}$/;

interface CartLineInput {
  variantId: string;
  qty: number;
}

interface PublicOrderInput {
  customerName: string;
  customerPhone: string;
  whatsapp?: string;
  city: string;
  deliveryAddress: string;
  notes?: string;
  paymentMethod: string;
  lines: CartLineInput[];
}

@Injectable()
export class StorefrontService {
  private readonly cfg: StorefrontConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly inventory: InventoryService,
  ) {
    this.cfg = readStorefrontConfig();
  }

  // ─── Catalog ─────────────────────────────────────────────────────────────

  /** Public product listing — only published items, paginated, with stock indicator. */
  async listProducts(params: {
    page?: number;
    pageSize?: number;
    categoryId?: string;
    search?: string;
    minPrice?: number;
    maxPrice?: number;
  }) {
    assertStorefrontConfig(this.cfg);
    const page     = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(48, Math.max(1, params.pageSize ?? 24));

    const where: Prisma.ProductTemplateWhereInput = {
      companyId:         this.cfg.companyId,
      isActive:          true,
      isPublishedOnline: true,
      deletedAt:         null,
    };
    if (params.categoryId) where.categoryId = params.categoryId;
    if (params.search) {
      where.OR = [
        { generatedFullName: { contains: params.search, mode: 'insensitive' } },
        { sku:               { contains: params.search, mode: 'insensitive' } },
      ];
    }
    if (params.minPrice != null || params.maxPrice != null) {
      where.defaultSalePriceIqd = {
        ...(params.minPrice != null ? { gte: new Prisma.Decimal(params.minPrice) } : {}),
        ...(params.maxPrice != null ? { lte: new Prisma.Decimal(params.maxPrice) } : {}),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.productTemplate.findMany({
        where,
        skip:    (page - 1) * pageSize,
        take:    pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id:                  true,
          sku:                 true,
          nameAr:              true,
          nameEn:              true,
          generatedFullName:   true,
          categoryId:          true,
          defaultSalePriceIqd: true,
          imageUrls:           true,
          tags:                true,
        },
      }),
      this.prisma.productTemplate.count({ where }),
    ]);

    return {
      items: items.map((p) => ({
        id:        p.id,
        slug:      p.id, // ULID doubles as slug — clean URLs without extra schema
        sku:       p.sku,
        name:      p.generatedFullName || p.nameAr,
        nameEn:    p.nameEn,
        priceIqd:  Number(p.defaultSalePriceIqd),
        imageUrl:  p.imageUrls[0] ?? null,
        images:    p.imageUrls,
        tags:      p.tags,
        categoryId: p.categoryId,
      })),
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /** Public product detail — variants + total available stock. */
  async getProduct(slug: string) {
    assertStorefrontConfig(this.cfg);
    const p = await this.prisma.productTemplate.findFirst({
      where: {
        id:                slug,
        companyId:         this.cfg.companyId,
        isActive:          true,
        isPublishedOnline: true,
        deletedAt:         null,
      },
      include: {
        variants: {
          where: { isActive: true },
          select: {
            id:              true,
            sku:             true,
            attributeValues: true,
            imageUrl:        true,
          },
        },
        category: { select: { id: true, nameAr: true, nameEn: true } },
      },
    });
    if (!p) throw new NotFoundException({ code: 'NOT_FOUND', messageAr: 'المنتج غير موجود' });

    const variantIds = p.variants.map((v) => v.id);
    const balances = variantIds.length
      ? await this.prisma.inventoryBalance.findMany({
          where: { companyId: this.cfg.companyId, variantId: { in: variantIds } },
          select: { variantId: true, qtyOnHand: true, qtyReserved: true },
        })
      : [];

    const stockByVariant = new Map<string, number>();
    for (const b of balances) {
      const avail = Number(b.qtyOnHand.minus(b.qtyReserved));
      stockByVariant.set(b.variantId, (stockByVariant.get(b.variantId) ?? 0) + Math.max(0, avail));
    }

    const variants = p.variants.map((v) => ({
      id:              v.id,
      sku:             v.sku,
      attributeValues: v.attributeValues,
      imageUrl:        v.imageUrl,
      stock:           stockByVariant.get(v.id) ?? 0,
    }));

    const totalStock = variants.reduce((s, v) => s + v.stock, 0);

    return {
      id:          p.id,
      slug:        p.id,
      sku:         p.sku,
      name:        p.generatedFullName || p.nameAr,
      nameEn:      p.nameEn,
      description: p.description,
      priceIqd:    Number(p.defaultSalePriceIqd),
      images:      p.imageUrls,
      tags:        p.tags,
      category:    p.category,
      variants,
      totalStock,
      inStock:     totalStock > 0,
    };
  }

  /** Public category tree — only categories that have at least one published product. */
  async getCategoryTree() {
    assertStorefrontConfig(this.cfg);
    const cats = await this.prisma.productCategory.findMany({
      where: { companyId: this.cfg.companyId, isActive: true },
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { nameAr: 'asc' }],
      select: {
        id:       true,
        nameAr:   true,
        nameEn:   true,
        parentId: true,
        level:    true,
        imageUrl: true,
      },
    });
    return cats;
  }

  // ─── Cart ────────────────────────────────────────────────────────────────

  /** Stateless cart calculation — validates items, returns priced lines. */
  async calculateCart(lines: CartLineInput[]) {
    assertStorefrontConfig(this.cfg);
    if (!Array.isArray(lines) || lines.length === 0) {
      return { lines: [], subtotal: 0, tax: 0, total: 0 };
    }
    const variantIds = lines.map((l) => l.variantId);
    const variants = await this.prisma.productVariant.findMany({
      where: {
        id:        { in: variantIds },
        companyId: this.cfg.companyId,
        isActive:  true,
        template:  { isPublishedOnline: true, isActive: true, deletedAt: null },
      },
      include: { template: { select: { defaultSalePriceIqd: true, generatedFullName: true, nameAr: true, imageUrls: true } } },
    });
    const byId = new Map(variants.map((v) => [v.id, v]));

    const out = lines.map((l) => {
      const v = byId.get(l.variantId);
      if (!v) {
        return {
          variantId: l.variantId,
          qty:       l.qty,
          name:      'منتج غير متاح',
          unitPriceIqd: 0,
          lineTotalIqd: 0,
          available: false,
        };
      }
      const unit = Number(v.template.defaultSalePriceIqd);
      const lineTotal = unit * l.qty;
      return {
        variantId:    v.id,
        qty:          l.qty,
        name:         v.template.generatedFullName || v.template.nameAr,
        image:        v.imageUrl ?? v.template.imageUrls[0] ?? null,
        unitPriceIqd: unit,
        lineTotalIqd: lineTotal,
        available:    true,
      };
    });

    const subtotal = out.reduce((s, l) => s + l.lineTotalIqd, 0);
    const tax = 0; // Iraq: no VAT on retail e-commerce by default
    const total = subtotal + tax;
    return { lines: out, subtotal, tax, total };
  }

  // ─── Order placement ─────────────────────────────────────────────────────

  /** Public order creation — find-or-create customer, create draft SalesOrder. */
  async createOrder(input: PublicOrderInput) {
    assertStorefrontConfig(this.cfg);

    if (!IRAQ_PHONE_RE.test(input.customerPhone)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'صيغة رقم الهاتف غير صحيحة (07XXXXXXXXX)',
      });
    }
    if (!input.lines || input.lines.length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'السلة فارغة',
      });
    }
    if (!input.deliveryAddress?.trim() || !input.city?.trim() || !input.customerName?.trim()) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'بيانات الشحن غير مكتملة',
      });
    }

    // Pull variant prices server-side — never trust client-supplied prices.
    const variantIds = input.lines.map((l) => l.variantId);
    const variants = await this.prisma.productVariant.findMany({
      where: {
        id:        { in: variantIds },
        companyId: this.cfg.companyId,
        isActive:  true,
        template:  { isPublishedOnline: true, isActive: true, deletedAt: null },
      },
      include: { template: { select: { defaultSalePriceIqd: true } } },
    });
    if (variants.length !== variantIds.length) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'بعض المنتجات لم تعد متاحة',
      });
    }
    const priceById = new Map(variants.map((v) => [v.id, new Prisma.Decimal(v.template.defaultSalePriceIqd)]));

    // F3 — Stock check using existing inventory balances (reservation happens in tx below).
    for (const l of input.lines) {
      if (l.qty <= 0) {
        throw new BadRequestException({ code: 'VALIDATION_ERROR', messageAr: 'الكمية يجب أن تكون موجبة' });
      }
      const bal = await this.prisma.inventoryBalance.findFirst({
        where: { companyId: this.cfg.companyId, warehouseId: this.cfg.warehouseId, variantId: l.variantId },
      });
      const avail = bal ? bal.qtyOnHand.minus(bal.qtyReserved) : new Prisma.Decimal(0);
      if (avail.lt(new Prisma.Decimal(l.qty))) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          messageAr: 'الكمية المتاحة غير كافية لأحد المنتجات',
        });
      }
    }

    const linesData = input.lines.map((l) => {
      const unitPrice = priceById.get(l.variantId)!;
      const qty = new Prisma.Decimal(l.qty);
      return {
        variantId:    l.variantId,
        qty,
        unitPriceIqd: unitPrice,
        discountPct:  new Prisma.Decimal(0),
        discountIqd:  new Prisma.Decimal(0),
        lineTotalIqd: unitPrice.mul(qty),
      };
    });

    const subtotal = linesData.reduce((s, l) => s.plus(l.lineTotalIqd), new Prisma.Decimal(0));
    const total    = subtotal;

    // Find-or-create Customer by phone (within configured tenant).
    const existing = await this.prisma.customer.findFirst({
      where: { companyId: this.cfg.companyId, phone: input.customerPhone, deletedAt: null },
    });

    const orderNumber = await this.sequence.next(this.cfg.companyId, 'SO');

    const result = await this.prisma.$transaction(async (tx) => {
      let customerId = existing?.id;
      if (!customerId) {
        const code = `WEB-${input.customerPhone.slice(-6)}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
        const created = await tx.customer.create({
          data: {
            companyId: this.cfg.companyId,
            code,
            type:      'regular',
            nameAr:    input.customerName.trim(),
            phone:     input.customerPhone,
            whatsapp:  input.whatsapp || input.customerPhone,
            address:   input.deliveryAddress,
            city:      input.city,
            // System user ULID — public traffic has no auth user; use a deterministic placeholder.
            createdBy: '00000000000000000000000000',
            updatedBy: '00000000000000000000000000',
          },
        });
        customerId = created.id;
      }

      const so = await tx.salesOrder.create({
        data: {
          companyId:   this.cfg.companyId,
          branchId:    this.cfg.branchId,
          number:      orderNumber,
          customerId,
          warehouseId: this.cfg.warehouseId,
          orderDate:   new Date(),
          status:      'draft',
          channel:     'online',
          subtotalIqd: subtotal,
          discountIqd: new Prisma.Decimal(0),
          taxIqd:      new Prisma.Decimal(0),
          totalIqd:    total,
          notes:       buildNotes(input),
          createdBy:   '00000000000000000000000000',
          updatedBy:   '00000000000000000000000000',
          lines: { create: linesData },
        },
        include: { lines: true },
      });

      for (const line of so.lines) {
        await this.inventory.reserve(
          line.variantId,
          this.cfg.warehouseId,
          Number(line.qty),
          this.cfg.companyId,
          tx,
        );
      }

      return so;
    });

    return {
      id:       result.id,
      number:   result.number,
      total:    Number(result.totalIqd),
      status:   result.status,
      trackUrl: `/orders/${result.id}`,
    };
  }
}

function buildNotes(input: PublicOrderInput): string {
  const parts: string[] = [
    `[طلب إلكتروني]`,
    `الدفع: ${input.paymentMethod}`,
    `المدينة: ${input.city}`,
    `العنوان: ${input.deliveryAddress}`,
  ];
  if (input.whatsapp) parts.push(`واتساب: ${input.whatsapp}`);
  if (input.notes)    parts.push(`ملاحظات: ${input.notes}`);
  return parts.join(' | ');
}
