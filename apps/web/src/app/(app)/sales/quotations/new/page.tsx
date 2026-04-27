'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Plus, Trash2, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatIqd } from '@/lib/format';

type Customer = { id: string; code: string; nameAr: string; phone: string | null; creditLimitIqd: string; creditBalanceIqd: string };
type Variant  = { id: string; sku: string; nameAr: string; salePriceIqd: string };

interface Line { variantId: string; label: string; qty: number; unitPriceIqd: number; discountPct: number; discountIqd: number }

function lineTotal(l: Line) {
  const gross = l.qty * l.unitPriceIqd;
  return Math.max(0, gross * (1 - l.discountPct / 100) - l.discountIqd);
}

export default function NewQuotationPage() {
  const router = useRouter();

  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustDropdown, setShowCustDropdown] = useState(false);

  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().substring(0, 10);
  });
  const [discountIqd, setDiscountIqd] = useState(0);
  const [taxIqd, setTaxIqd]           = useState(0);
  const [notes, setNotes]             = useState('');
  const [lines, setLines] = useState<Line[]>([{ variantId: '', label: '', qty: 1, unitPriceIqd: 0, discountPct: 0, discountIqd: 0 }]);
  const [variantSearches, setVSearch] = useState(['']);
  const [showVDropdowns, setShowVD]   = useState([false]);
  const [formError, setFormError]     = useState<string | null>(null);

  const { data: custResults } = useQuery({
    queryKey: ['cust-search', customerSearch],
    queryFn: () => api<{ items: Customer[] }>(`/sales/customers?search=${encodeURIComponent(customerSearch)}&limit=8`),
    enabled: customerSearch.length >= 2,
  });

  const subtotal = lines.reduce((acc, l) => acc + lineTotal(l), 0);
  const total    = Math.max(0, subtotal - discountIqd + taxIqd);

  const creditWarning = selectedCustomer &&
    Number(selectedCustomer.creditLimitIqd) > 0 &&
    Number(selectedCustomer.creditBalanceIqd) + total > Number(selectedCustomer.creditLimitIqd);

  const create = useMutation({
    mutationFn: () => api<{ id: string }>('/quotations', {
      method: 'POST',
      body: JSON.stringify({
        customerId, validUntil, discountIqd, taxIqd, notes: notes || undefined,
        lines: lines.map((l) => ({ variantId: l.variantId, qty: l.qty, unitPriceIqd: l.unitPriceIqd, discountPct: l.discountPct, discountIqd: l.discountIqd })),
      }),
    }),
    onSuccess: (res) => router.push(`/sales/quotations/${res.id}`),
    onError: (e: unknown) => setFormError(e instanceof ApiError ? e.messageAr : 'حدث خطأ'),
  });

  function setLine(i: number, patch: Partial<Line>) {
    setLines((p) => p.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  }
  function addLine() {
    setLines((p) => [...p, { variantId: '', label: '', qty: 1, unitPriceIqd: 0, discountPct: 0, discountIqd: 0 }]);
    setVSearch((p) => [...p, '']); setShowVD((p) => [...p, false]);
  }
  function removeLine(i: number) {
    setLines((p) => p.filter((_, idx) => idx !== i));
    setVSearch((p) => p.filter((_, idx) => idx !== i));
    setShowVD((p) => p.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-6 p-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link href="/sales/quotations" className="text-slate-500 hover:text-slate-800"><ArrowRight className="size-5" /></Link>
        <h1 className="text-2xl font-bold">عرض سعر جديد</h1>
      </div>

      {formError && (
        <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-red-800 text-sm">{formError}</div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); setFormError(null); if (!customerId) { setFormError('اختر عميلاً'); return; } if (lines.some((l) => !l.variantId)) { setFormError('أكمل بيانات جميع البنود'); return; } create.mutate(); }} className="space-y-5">

        <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="font-semibold">بيانات العرض</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">العميل</label>
              <input
                type="text" value={customerSearch}
                onChange={(e) => { setCustomerSearch(e.target.value); setShowCustDropdown(true); if (!e.target.value) { setCustomerId(''); setSelectedCustomer(null); } }}
                onFocus={() => setShowCustDropdown(true)}
                onBlur={() => setTimeout(() => setShowCustDropdown(false), 150)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="ابحث عن عميل..."
              />
              {showCustDropdown && (custResults?.items?.length ?? 0) > 0 && (
                <div className="absolute z-20 top-full mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg max-h-48 overflow-y-auto">
                  {custResults!.items.map((c) => (
                    <button key={c.id} type="button" onMouseDown={() => { setCustomerId(c.id); setSelectedCustomer(c); setCustomerSearch(c.nameAr); setShowCustDropdown(false); }}
                      className="w-full text-start px-3 py-2 hover:bg-slate-50 text-sm">
                      <div className="font-medium">{c.nameAr}</div>
                      <div className="text-xs text-slate-400">{c.code}{c.phone ? ` · ${c.phone}` : ''}</div>
                    </button>
                  ))}
                </div>
              )}
              {creditWarning && (
                <p className="mt-1 text-xs text-amber-600 flex items-center gap-1">
                  <Sparkles className="size-3" /> المجموع قد يتجاوز حد الائتمان ({formatIqd(selectedCustomer!.creditLimitIqd)})
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">صالح حتى</label>
              <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">البنود</h2>
            <button type="button" onClick={addLine} className="inline-flex items-center gap-1 text-sm text-sky-700 hover:text-sky-900">
              <Plus className="size-4" /> بند
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="text-start py-2 min-w-52">المنتج</th>
                  <th className="text-end py-2 w-20">الكمية</th>
                  <th className="text-end py-2 w-28">السعر</th>
                  <th className="text-end py-2 w-20">خصم%</th>
                  <th className="text-end py-2 w-24">خصم</th>
                  <th className="text-end py-2 w-28">المجموع</th>
                  <th className="py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-2 relative">
                      <input type="text" value={variantSearches[i] ?? ''}
                        onChange={(e) => { const v = e.target.value; setVSearch((p) => p.map((s, idx) => idx === i ? v : s)); setShowVD((p) => p.map((_, idx) => idx === i ? true : _)); if (!v) setLine(i, { variantId: '', label: '' }); }}
                        onFocus={() => setShowVD((p) => p.map((_, idx) => idx === i ? true : _))}
                        onBlur={() => setTimeout(() => setShowVD((p) => p.map((_, idx) => idx === i ? false : _)), 150)}
                        className="w-full rounded border border-slate-300 px-2 py-1 text-sm" placeholder="ابحث عن منتج..." />
                      {showVDropdowns[i] && <VariantDropdown search={variantSearches[i] ?? ''} onSelect={(v) => { setLine(i, { variantId: v.id, label: `${v.nameAr} (${v.sku})`, unitPriceIqd: Number(v.salePriceIqd) }); setVSearch((p) => p.map((s, idx) => idx === i ? `${v.nameAr} (${v.sku})` : s)); setShowVD((p) => p.map((_, idx) => idx === i ? false : _)); }} />}
                    </td>
                    <td className="py-2 ps-2"><input type="number" min="0.001" step="0.001" value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} className="w-full rounded border border-slate-300 px-2 py-1 text-end text-sm" /></td>
                    <td className="py-2 ps-2"><input type="number" min="0" value={l.unitPriceIqd} onChange={(e) => setLine(i, { unitPriceIqd: Number(e.target.value) })} className="w-full rounded border border-slate-300 px-2 py-1 text-end text-sm" /></td>
                    <td className="py-2 ps-2"><input type="number" min="0" max="100" value={l.discountPct} onChange={(e) => setLine(i, { discountPct: Number(e.target.value) })} className="w-full rounded border border-slate-300 px-2 py-1 text-end text-sm" /></td>
                    <td className="py-2 ps-2"><input type="number" min="0" value={l.discountIqd} onChange={(e) => setLine(i, { discountIqd: Number(e.target.value) })} className="w-full rounded border border-slate-300 px-2 py-1 text-end text-sm" /></td>
                    <td className="py-2 ps-2 text-end font-medium">{lineTotal(l).toLocaleString('ar-IQ')}</td>
                    <td className="py-2 ps-2">{lines.length > 1 && <button type="button" onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600"><Trash2 className="size-4" /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">ملاحظات</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div className="space-y-2 text-sm">
              <Row label="المجموع الفرعي" value={formatIqd(subtotal)} />
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">خصم الرأس (د.ع)</span>
                <input type="number" min="0" value={discountIqd} onChange={(e) => setDiscountIqd(Number(e.target.value))} className="w-32 rounded border border-slate-300 px-2 py-1 text-end text-sm" />
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">الضريبة (د.ع)</span>
                <input type="number" min="0" value={taxIqd} onChange={(e) => setTaxIqd(Number(e.target.value))} className="w-32 rounded border border-slate-300 px-2 py-1 text-end text-sm" />
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 font-bold text-lg">
                <span>الإجمالي</span><span>{formatIqd(total)}</span>
              </div>
            </div>
          </div>
        </section>

        <div className="flex justify-end gap-3">
          <Link href="/sales/quotations" className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">إلغاء</Link>
          <button type="submit" disabled={create.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-5 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50">
            {create.isPending && <Loader2 className="size-4 animate-spin" />} حفظ كمسودة
          </button>
        </div>
      </form>
    </div>
  );
}

function VariantDropdown({ search, onSelect }: { search: string; onSelect: (v: Variant) => void }) {
  const { data } = useQuery({
    queryKey: ['var-search', search],
    queryFn: () => api<{ items: Variant[] }>(`/products/variants?search=${encodeURIComponent(search)}&limit=8`),
    enabled: search.length >= 2,
  });
  if (!data?.items?.length) return null;
  return (
    <div className="absolute z-20 top-full mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg max-h-48 overflow-y-auto">
      {data.items.map((v) => (
        <button key={v.id} type="button" onMouseDown={() => onSelect(v)} className="w-full text-start px-3 py-2 hover:bg-slate-50 text-sm">
          <div className="font-medium">{v.nameAr}</div>
          <div className="text-xs text-slate-400">{v.sku} · {formatIqd(v.salePriceIqd)}</div>
        </button>
      ))}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><span className="text-slate-500">{label}</span><span className="font-medium">{value}</span></div>;
}
