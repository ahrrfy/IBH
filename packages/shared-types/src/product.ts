import type { ULID, Money, BilingualName, Auditable, Metadata } from './common';

// ─── Product & Variant Types ──────────────────────────────────────────────────
// Rule: Inventory is tracked at VARIANT level, not template level (F3)

export type ProductType =
  | 'storable'      // physical, has stock
  | 'service'       // no stock tracking
  | 'raw_material'  // used in manufacturing
  | 'semi_finished' // WIP
  | 'configurable'  // custom/made-to-order
  | 'bundle';       // composed of multiple variants

export interface UnitOfMeasure {
  id: ULID;
  nameAr: string;
  nameEn?: string;
  abbreviation: string;   // e.g. "kg", "m", "pc"
  isBaseUnit: boolean;
}

export interface UnitConversion {
  fromUnitId: ULID;
  toUnitId: ULID;
  factor: number;         // e.g. 12 (1 box = 12 pieces)
}

export interface ProductCategory {
  id: ULID;
  nameAr: string;
  nameEn?: string;
  parentId: ULID | null;
  glAccountId: ULID | null;   // inventory GL account for this category
  cogsAccountId: ULID | null;
  imageUrl: string | null;
}

export interface ProductAttribute {
  id: ULID;
  nameAr: string;
  nameEn?: string;
  type: 'select' | 'text' | 'number' | 'color';
  values: ProductAttributeValue[];
}

export interface ProductAttributeValue {
  id: ULID;
  attributeId: ULID;
  valueAr: string;
  valueEn?: string;
  colorHex?: string;     // for color attributes
  sortOrder: number;
}

/** Product Template (parent) */
export interface ProductTemplate extends BilingualName, Auditable {
  id: ULID;
  companyId: ULID;
  sku: string;             // template-level SKU prefix
  categoryId: ULID;
  brandId: ULID | null;
  type: ProductType;
  baseUnitId: ULID;
  saleUnitId: ULID;
  purchaseUnitId: ULID;
  unitConversions: UnitConversion[];
  defaultSalePrice: Money;
  defaultPurchasePrice: Money;
  minSalePrice: Money;     // floor price — prevents below-cost selling
  attributes: ProductAttribute[];
  description: string | null;
  isPublishedOnline: boolean;    // show in e-commerce storefront?
  imageUrls: string[];
  tags: string[];
  metadata: Metadata;
  isActive: boolean;
}

/** Product Variant (child) — STOCK IS HERE */
export interface ProductVariant extends Auditable {
  id: ULID;
  templateId: ULID;
  companyId: ULID;
  sku: string;             // unique, e.g. "PEN-BLUE-0.5"
  /** Attribute selection e.g. { "اللون": "أزرق", "الحجم": "0.5 mm" } */
  attributeValues: Record<string, string>;
  imageUrl: string | null;
  isActive: boolean;
  barcodes: VariantBarcode[];
  weight: number | null;  // grams
  volume: number | null;  // ml
}

export interface VariantBarcode {
  id: ULID;
  variantId: ULID;
  barcode: string;
  barcodeType: 'EAN13' | 'EAN8' | 'CODE128' | 'QR' | 'CUSTOM';
  isPrimary: boolean;
}

/** Real-time inventory balance per variant per warehouse */
export interface InventoryBalance {
  variantId: ULID;
  warehouseId: ULID;
  qtyOnHand: number;
  qtyReserved: number;    // held for pending orders / carts
  qtyIncoming: number;    // confirmed POs not yet received
  /** qtyOnHand - qtyReserved — what can actually be sold */
  qtyAvailable: number;
  avgCost: Money;         // Moving Weighted Average (Decision D04)
  lastUpdatedAt: string;
}
