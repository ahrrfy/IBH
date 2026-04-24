import { z } from 'zod';
import { ulidSchema, qtySchema, dateIsoSchema } from './common.schema';

export const stockTransferSchema = z.object({
  fromWarehouseId: ulidSchema,
  toWarehouseId: ulidSchema,
  transferDate: dateIsoSchema,
  notes: z.string().max(1000).optional(),
  lines: z
    .array(
      z.object({
        variantId: ulidSchema,
        qtyRequested: qtySchema,
      }),
    )
    .min(1, 'At least one line is required'),
});

export const stocktakingSessionSchema = z.object({
  warehouseId: ulidSchema,
  type: z.enum(['cycle_count', 'full_inventory']),
  countDate: dateIsoSchema,
  notes: z.string().max(1000).optional(),
});

export const stocktakingCountSchema = z.object({
  sessionId: ulidSchema,
  lines: z
    .array(
      z.object({
        lineId: ulidSchema,
        countedQty: z.number().int().nonnegative(),
        notes: z.string().max(500).optional(),
      }),
    )
    .min(1),
});

export const manualAdjustmentSchema = z.object({
  variantId: ulidSchema,
  warehouseId: ulidSchema,
  qtyChange: z.number().int().refine((v) => v !== 0, { message: 'Adjustment cannot be zero' }),
  reason: z.string().min(5).max(500, 'Reason is required for manual adjustments'),
  unitCost: z.number().nonnegative().optional(),
});

export type StockTransferInput = z.infer<typeof stockTransferSchema>;
export type StocktakingSessionInput = z.infer<typeof stocktakingSessionSchema>;
