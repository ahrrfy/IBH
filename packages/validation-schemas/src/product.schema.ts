import { z } from 'zod';
import { ulidSchema, moneySchema, bilingualNameSchema } from './common.schema';

export const createProductTemplateSchema = z.object({
  ...bilingualNameSchema.shape,
  sku: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[A-Z0-9\-_]+$/, 'SKU must be uppercase alphanumeric with hyphens/underscores'),
  categoryId: ulidSchema,
  brandId: ulidSchema.optional(),
  type: z.enum(['storable', 'service', 'raw_material', 'semi_finished', 'configurable', 'bundle']),
  baseUnitId: ulidSchema,
  saleUnitId: ulidSchema,
  purchaseUnitId: ulidSchema,
  defaultSalePrice: moneySchema,
  defaultPurchasePrice: moneySchema,
  minSalePrice: moneySchema,
  description: z.string().max(2000).optional(),
  isPublishedOnline: z.boolean().default(false),
  tags: z.array(z.string().max(50)).max(20).default([]),
});

export const createProductVariantSchema = z.object({
  templateId: ulidSchema,
  sku: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[A-Z0-9\-_]+$/, 'SKU must be uppercase alphanumeric'),
  attributeValues: z.record(z.string()),
  weight: z.number().positive().optional(),
  volume: z.number().positive().optional(),
});

export const createBarcodeSchema = z.object({
  variantId: ulidSchema,
  barcode: z.string().min(8).max(20),
  barcodeType: z.enum(['EAN13', 'EAN8', 'CODE128', 'QR', 'CUSTOM']),
  isPrimary: z.boolean().default(false),
});

export const updatePriceSchema = z.object({
  variantId: ulidSchema,
  priceListId: ulidSchema,
  newPrice: moneySchema,
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().min(5).max(500),
});

export type CreateProductTemplateInput = z.infer<typeof createProductTemplateSchema>;
export type CreateProductVariantInput = z.infer<typeof createProductVariantSchema>;
