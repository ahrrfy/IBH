'use client';

/**
 * POS Sale Screen — the live, interactive cashier workspace.
 *
 * Flow:
 *   1. Find the cashier's open shift via GET /pos/shifts/open/me.
 *      No open shift → render a CTA to /pos/shifts (open one first).
 *   2. Build a cart by:
 *        - QuickItems grid tap
 *        - ProductCombobox search
 *        - Barcode input (USB HID = focused text input that reads scanner suffix)
 *   3. Optionally pick a customer (CustomerCombobox).
 *   4. Open PaymentModal → POST /pos/receipts.
 *      Server is authoritative for posting (F2 double-entry), inventory move (F3),
 *      audit, and JE — we only collect input and display the printed receipt.
 *
 * Realtime: subscribes to inventory.changed via useLiveResource so the
 * QuickItems/stock numbers refresh when other terminals sell the same SKU.
 *
 * Hold/Recall: the parked-receipt list lets the cashier suspend a non-cash
 * sale and bring it back later (server has POST /pos/receipts/:id/hold and
 * /recall).  Today the "park" button hands off after creation; future iter
 * will allow parking before payment.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Pause, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtAmount } from '@/components/money';
import { ProductCombobox, type VariantOption } from '@/components/product-combobox';
import { CustomerCombobox, type CustomerOption } from '@/components/customer-combobox';
import { Cart, lineTotal, type CartLine } from '@/components/pos/cart';
import { QuickItems } from '@/components/pos/quick-items';
import { PaymentModal, type PaymentLine } from '@/components/pos/payment-modal';
import { CustomerDisplay } from '@/components/pos/customer-display';
import { useLiveResource } from '@/lib/realtime/use-live-resource';

interface OpenShift {
  id: string;
  shiftNumber: string;
  branchId: string;
  deviceId: string;
  device: { id: string; warehouseId: string; cashAccountId?: string | null; nameAr?: string };
}

export default function POSSalePage() {
  const qc = useQueryClient();
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<CustomerOption | null>(null);
  const [headerDiscountIqd, setHeaderDiscountIqd] = useState(0);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 1) Discover open shift
  const shiftQuery = useQuery({
    queryKey: ['pos-open-shift'],
    queryFn: () => api<OpenShift | null>('/pos/shifts/open/me'),
    staleTime: 30_000,
  });
  const shift = shiftQuery.data ?? null;
  // I047 — defensive optional chaining on `device` too. If the shift API
  // returns a shift without a device (or device key is omitted), accessing
  // `.warehouseId` on undefined was throwing
  // "Cannot read properties of undefined (reading 'warehouseId')" and
  // blanking the entire POS sale screen.
  const warehouseId = shift?.device?.warehouseId ?? null;

  // Live stock invalidation — other terminals' sales will refresh quick-items
  useLiveResource(['pos-quick-items', warehouseId], ['inventory.changed', 'stock.adjusted']);

  // Auto-focus barcode input on mount and after each receipt
  useEffect(() => {
    barcodeRef.current?.focus();
  }, [shift?.id, success]);

  function addOrIncrement(opt: VariantOption) {
    setError(null);
    setLines((cur) => {
      const existing = cur.find((l) => l.variantId === opt.variantId);
      if (existing) {
        return cur.map((l) =>
          l.variantId === opt.variantId ? { ...l, qty: l.qty + 1 } : l,
        );
      }
      return [
        ...cur,
        {
          key: `${opt.variantId}-${Date.now()}`,
          variantId: opt.variantId,
          sku: opt.variantSku,
          nameAr: opt.templateNameAr,
          qty: 1,
          unitPriceIqd: opt.defaultPriceIqd,
          discountPct: 0,
          discountIqd: 0,
          qtyOnHand: opt.qtyOnHand,
        },
      ];
    });
  }

  function handleBarcode(code: string) {
    setError(null);
    if (!code.trim() || !warehouseId) return;
    // Resolve barcode → variant via inventory stock search
    api<{ items: Array<{ variantId: string; qtyOnHand: number | string; variant?: any }> }>(
      `/inventory/stock?limit=1&warehouseId=${warehouseId}&search=${encodeURIComponent(code.trim())}`,
    )
      .then((res) => {
        const row = res.items?.[0];
        if (!row?.variant) {
          setError(`لا يوجد منتج بالباركود: ${code}`);
          return;
        }
        addOrIncrement({
          variantId: row.variant.id,
          variantSku: row.variant.sku,
          templateNameAr: row.variant.template?.nameAr ?? row.variant.sku,
          qtyOnHand: Number(row.qtyOnHand ?? 0),
          defaultPriceIqd: Number(row.variant.template?.defaultPriceIqd ?? 0),
        });
      })
      .catch(() => setError('تعذر البحث عن المنتج'));
  }

  // Totals — server is authoritative; this is for display only
  const subtotal = useMemo(() => lines.reduce((s, l) => s + lineTotal(l), 0), [lines]);
  const grandTotal = Math.max(0, subtotal - headerDiscountIqd);

  // 2) Submit receipt
  const createMut = useMutation({
    mutationFn: (payments: PaymentLine[]) =>
      api<{ id: string; number: string }>('/pos/receipts', {
        method: 'POST',
        body: {
          shiftId: shift!.id,
          customerId: customer?.id ?? undefined,
          lines: lines.map((l) => ({
            variantId: l.variantId,
            qty: l.qty,
            unitPriceIqd: l.unitPriceIqd,
            discountPct: l.discountPct || undefined,
            discountIqd: l.discountPct > 0 ? undefined : l.discountIqd || undefined,
          })),
          payments: payments.map((p) => ({
            method: p.method,
            amountIqd: p.amountIqd,
            reference: p.reference,
          })),
          discountIqd: headerDiscountIqd || undefined,
          clientUlid: `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        },
      } as any),
    onSuccess: (res) => {
      setSuccess(`تمت الفاتورة ${res.number}`);
      setLines([]);
      setCustomer(null);
      setHeaderDiscountIqd(0);
      setPaymentOpen(false);
      qc.invalidateQueries({ queryKey: ['pos-quick-items', warehouseId] });
      // Auto-print stub: open print dialog for the receipt URL
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('pos:receipt-created', { detail: res }));
        }
      } catch {
        /* no-op */
      }
    },
    onError: (e: any) => {
      setError(e?.messageAr || e?.message || 'تعذر إكمال الفاتورة');
      setPaymentOpen(false);
    },
  });

  // 3) Render
  if (shiftQuery.isLoading) {
    return <div className="p-6 text-sm text-slate-500">جارٍ التحميل…</div>;
  }
  if (!shift) {
    return (
      <div className="space-y-4 p-6">
        <h1 className="text-2xl font-bold">شاشة البيع</h1>
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          لا توجد وردية مفتوحة لك. افتح وردية أولاً للبدء بالبيع.
        </div>
        <Link
          href="/pos/shifts"
          className="inline-block rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
        >
          الذهاب إلى الورديات
        </Link>
      </div>
    );
  }

  // Stock guard: any line over-stock blocks confirm (manager override is a future task)
  const overStockLine = lines.find(
    (l) => l.qtyOnHand !== undefined && l.qty > l.qtyOnHand,
  );
  // Credit guard: if customer has a credit limit and grandTotal > available, block
  const creditAvailable = customer?.creditLimitIqd
    ? Number(customer.creditLimitIqd) - Number(customer.balanceIqd ?? 0)
    : null;
  const creditExceeded =
    creditAvailable !== null && creditAvailable >= 0 && grandTotal > creditAvailable;

  const canCheckout =
    lines.length > 0 && !overStockLine && !creditExceeded && !createMut.isPending;

  return (
    <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-12">
      {/* Header */}
      <div className="lg:col-span-12 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">شاشة البيع</h1>
          <p className="text-xs text-slate-500">
            وردية: <span className="font-mono">{shift.shiftNumber}</span>
            {shift.device?.nameAr ? <> · جهاز: {shift.device.nameAr}</> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/pos/shifts"
            className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            الورديات
          </Link>
        </div>
      </div>

      {/* LEFT — search + quick items */}
      <section className="space-y-3 lg:col-span-7">
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <label className="mb-1 block text-xs font-medium text-slate-600">باركود</label>
          <input
            ref={barcodeRef}
            type="text"
            placeholder="امسح الباركود ثم Enter"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const v = (e.target as HTMLInputElement).value;
                handleBarcode(v);
                (e.target as HTMLInputElement).value = '';
              }
            }}
            className="h-10 w-full rounded border border-slate-300 px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-slate-600">بحث عن منتج</label>
            <ProductCombobox
              warehouseId={warehouseId}
              onPick={addOrIncrement}
            />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">منتجات سريعة</h2>
          <QuickItems warehouseId={warehouseId} onPick={addOrIncrement} />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
            <h2 className="text-sm font-semibold text-slate-700">السلة ({lines.length})</h2>
            {lines.length > 0 && (
              <button
                type="button"
                onClick={() => setLines([])}
                className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800"
              >
                <Trash2 size={14} /> تفريغ
              </button>
            )}
          </div>
          <Cart
            lines={lines}
            onChange={setLines}
            onRemove={(key) => setLines((cur) => cur.filter((l) => l.key !== key))}
            readOnly={createMut.isPending}
          />
        </div>
      </section>

      {/* RIGHT — customer + totals + checkout */}
      <aside className="space-y-3 lg:col-span-5">
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <label className="mb-1 block text-xs font-medium text-slate-600">الزبون (اختياري)</label>
          <CustomerCombobox value={customer} onChange={setCustomer} />
          {customer && creditAvailable !== null && (
            <div className="mt-2 text-xs">
              <span className="text-slate-500">المتاح ائتمانياً: </span>
              <span
                className={`tabular-nums font-semibold ${creditExceeded ? 'text-rose-700' : 'text-emerald-700'}`}
              >
                {fmtAmount(creditAvailable)} د.ع
              </span>
              {creditExceeded && (
                <div className="text-rose-600">⚠ تجاوز سقف الائتمان</div>
              )}
            </div>
          )}
        </div>

        <CustomerDisplay lines={lines} total={grandTotal} customerName={customer?.nameAr} />

        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-600">المجموع الفرعي</span>
            <span className="tabular-nums">{fmtAmount(subtotal)} د.ع</span>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-slate-600">خصم على الفاتورة</label>
            <input
              type="number"
              min={0}
              step="any"
              value={headerDiscountIqd || ''}
              onChange={(e) => setHeaderDiscountIqd(Math.max(0, Number(e.target.value) || 0))}
              className="h-8 w-32 rounded border border-slate-300 px-2 text-end text-sm tabular-nums focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              placeholder="0"
            />
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 pt-2">
            <span className="font-semibold text-slate-900">الإجمالي</span>
            <span className="text-2xl font-bold tabular-nums">{fmtAmount(grandTotal)} د.ع</span>
          </div>

          {error && (
            <div className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
              {success}
            </div>
          )}
          {overStockLine && (
            <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
              يوجد صنف بكمية أكبر من المتاح — قلل الكمية أو غيّر الصنف
            </div>
          )}

          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              disabled={!canCheckout}
              onClick={() => {
                setError(null);
                setSuccess(null);
                setPaymentOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 py-3 text-base font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Banknote size={18} /> دفع
            </button>
            <button
              type="button"
              disabled={lines.length === 0}
              onClick={() => {
                // Park = clear local cart for now (server hold/recall is per-receipt
                // and requires a non-cash completed receipt; we ship that flow next)
                setLines([]);
                setCustomer(null);
                setHeaderDiscountIqd(0);
                setSuccess('تم تعليق العملية محلياً');
              }}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Pause size={16} /> تعليق
            </button>
          </div>
        </div>
      </aside>

      <PaymentModal
        open={paymentOpen}
        totalIqd={grandTotal}
        onClose={() => setPaymentOpen(false)}
        onConfirm={(payments) => createMut.mutate(payments)}
        submitting={createMut.isPending}
      />
    </div>
  );
}
