import type { ULID, DateTimeISO, Money, Auditable } from './common';
import type { DocumentType } from './accounting';

// ─── Inventory Types — F3 Philosophy ─────────────────────────────────────────
// StockLedger is APPEND-ONLY. No edit, no delete. Moving Weighted Average.

/** Stock Ledger entry — immutable append-only record of every stock movement */
export interface StockLedgerEntry {
  id: ULID;
  variantId: ULID;
  warehouseId: ULID;
  companyId: ULID;
  /** Positive = stock in, Negative = stock out */
  qtyChange: number;
  balanceAfter: number;   // denormalized for fast queries
  unitCost: Money;        // cost at time of movement (MWA)
  totalValue: Money;
  /** What triggered this movement — mandatory FK */
  referenceType: DocumentType | 'pos_sale' | 'manual_adj' | 'opening_balance';
  referenceId: ULID;
  referenceLineId: ULID | null;
  notes: string | null;
  createdAt: DateTimeISO;
  createdBy: ULID;
  /** NO updatedAt — this table is append-only */
}

/** Warehouse/storage location */
export interface Warehouse extends Auditable {
  id: ULID;
  companyId: ULID;
  branchId: ULID;
  code: string;
  nameAr: string;
  nameEn?: string;
  type: WarehouseType;
  isActive: boolean;
  isDefault: boolean;
  address: string | null;
}

export type WarehouseType =
  | 'main'
  | 'sales_floor'
  | 'receiving'
  | 'quality_hold'
  | 'damaged'
  | 'in_transit'
  | 'consignment';

/** Inter-warehouse stock transfer */
export interface StockTransfer extends Auditable {
  id: ULID;
  companyId: ULID;
  transferNumber: string;
  fromWarehouseId: ULID;
  toWarehouseId: ULID;
  status: 'draft' | 'approved' | 'in_transit' | 'received' | 'cancelled';
  transferDate: string;
  notes: string | null;
  lines: StockTransferLine[];
  approvedAt: string | null;
  approvedBy: ULID | null;
  receivedAt: string | null;
  receivedBy: ULID | null;
}

export interface StockTransferLine {
  id: ULID;
  transferId: ULID;
  variantId: ULID;
  qtyRequested: number;
  qtyShipped: number;
  qtyReceived: number;
  unitCost: Money;
}

/** Stocktaking session */
export interface StocktakingSession extends Auditable {
  id: ULID;
  companyId: ULID;
  warehouseId: ULID;
  sessionNumber: string;
  type: 'cycle_count' | 'full_inventory';
  status: 'draft' | 'in_progress' | 'counted' | 'approved' | 'posted';
  countDate: string;
  isFrozen: boolean;         // if true, no stock movements allowed in this warehouse
  notes: string | null;
  lines: StocktakingLine[];
  approvedAt: string | null;
  approvedBy: ULID | null;
  journalEntryId: ULID | null;  // created after approval for variances
}

export interface StocktakingLine {
  id: ULID;
  sessionId: ULID;
  variantId: ULID;
  systemQty: number;         // what system thinks is there
  countedQty: number | null; // what was physically counted
  variance: number | null;   // countedQty - systemQty
  varianceValue: Money | null;
  unitCost: Money;
  notes: string | null;
  countedBy: ULID | null;
  countedAt: string | null;
}

/** Reorder point configuration per variant per warehouse */
export interface ReorderPoint {
  id: ULID;
  variantId: ULID;
  warehouseId: ULID;
  reorderQty: number;        // minimum before reordering
  reorderAmount: number;     // how much to order
  leadTimeDays: number;      // supplier lead time
  safetyStock: number;
  preferredSupplierId: ULID | null;
  /** If true, AI (Tier 2 Prophet) calculated this automatically */
  isAiGenerated: boolean;
  lastCalculatedAt: string | null;
}
