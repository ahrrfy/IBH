import { create } from 'zustand';
import { ulid } from 'ulid';

export interface CartLine {
  lineId: string;
  variantId: string;
  sku: string;
  nameAr: string;
  qty: number;
  unitPriceIqd: number;
  discountPct: number;
}

interface CartStore {
  clientUlid: string;
  customerId: string | null;
  lines: CartLine[];
  addByVariant: (v: { variantId: string; sku: string; nameAr: string; priceIqd: number }) => void;
  setQty: (lineId: string, qty: number) => void;
  setDiscount: (lineId: string, pct: number) => void;
  remove: (lineId: string) => void;
  setCustomer: (id: string | null) => void;
  clear: () => void;
  subtotal: () => number;
  discount: () => number;
  total: () => number;
}

export const useCartStore = create<CartStore>((set, get) => ({
  clientUlid: ulid(),
  customerId: null,
  lines: [],

  addByVariant: (v) =>
    set((s) => {
      const existing = s.lines.find((l) => l.variantId === v.variantId);
      if (existing) {
        return {
          lines: s.lines.map((l) =>
            l.variantId === v.variantId ? { ...l, qty: l.qty + 1 } : l,
          ),
        };
      }
      return {
        lines: [
          ...s.lines,
          {
            lineId: ulid(),
            variantId: v.variantId,
            sku: v.sku,
            nameAr: v.nameAr,
            qty: 1,
            unitPriceIqd: v.priceIqd,
            discountPct: 0,
          },
        ],
      };
    }),

  setQty: (lineId, qty) =>
    set((s) => ({
      lines: s.lines.map((l) => (l.lineId === lineId ? { ...l, qty: Math.max(0, qty) } : l)),
    })),

  setDiscount: (lineId, pct) =>
    set((s) => ({
      lines: s.lines.map((l) =>
        l.lineId === lineId ? { ...l, discountPct: Math.min(100, Math.max(0, pct)) } : l,
      ),
    })),

  remove: (lineId) =>
    set((s) => ({ lines: s.lines.filter((l) => l.lineId !== lineId) })),

  setCustomer: (id) => set({ customerId: id }),

  clear: () => set({ lines: [], customerId: null, clientUlid: ulid() }),

  subtotal: () =>
    get().lines.reduce((sum, l) => sum + l.qty * l.unitPriceIqd, 0),

  discount: () =>
    get().lines.reduce(
      (sum, l) => sum + (l.qty * l.unitPriceIqd * l.discountPct) / 100,
      0,
    ),

  total: () => get().subtotal() - get().discount(),
}));
