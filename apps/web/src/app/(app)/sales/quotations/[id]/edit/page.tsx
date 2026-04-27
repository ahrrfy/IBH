'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Plus, Trash2, ArrowRight, Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatIqd } from '@/lib/format';

type Variant = { id: string; sku: string; nameAr: string; salePriceIqd: string };
interface Line { variantId: string; label: string; qty: number; unitPriceIqd: number; discountPct: number; discountIqd: number }

function lineTotal(l: Line) { return Math.max(0, l.qty * l.unitPriceIqd * (1 - l.discountPct / 100) - l.discountIqd); }

export default function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [init, setInit]       = useState(false);
  const [validUntil, setVU]   = useState('');
  const [discountIqd, setDI]  = useState(0);
  const [taxIqd, setTI]       = useState(0);
  const [notes, setNotes]     = useState('');
  const [lines, setLines]     = useState<Line[]>([]);
  const [vSearches, setVS]    = useState<string[]>([]);
  const [showVD, setShowVD]   = useState<boolean[]>([]);
  const [formError, setFErr]  = useState<string | null>(null);

  const { data: q, isLoading } = useQuery({ queryKey: ['quotation', id], queryFn: () => api<any>(`/quotations/${id}`) });

  useEffect(() => {
    if (q && !init) {
      setVU(q.validUntil?.substring(0, 10) ?? '');
      setDI(Number(q.discountIqd)); setTI(Number(q.taxIqd)); setNotes(q.notes ?? '');
      const ls: Line[] = q.lines.map((l: any) => ({ variantId: l.variantId, label: l.variantId, qty: Number(l.qty), unitPriceIqd: Number(l.unitPriceIqd), discountPct: Number(l.discountPct), discountIqd: Number(l.discountIqd) }));
      setLines(ls); setVS(ls.map((l) => l.label)); setShowVD(ls.map(() => false)); setInit(true);
    }
  }, [q, init]);

  const save = useMutation({
    mutationFn: () => api(`/quotations/${id}`, { method: 'PUT', body: JSON.stringify({ validUntil, discountIqd, taxIqd, notes: notes || undefined, lines: lines.map((l) => ({ variantId: l.variantId, qty: l.qty, unitPriceIqd: l.unitPriceIqd, discountPct: l.discountPct, discountIqd: l.discountIqd })) }) }),
    onSuccess: () => router.push(`/sales/quotations/${id}`),
    onError: (e: unknown) => setFErr(e instanceof ApiError ? e.messageAr : 'فشل الحفظ'),
  });

  function setLine(i: number, patch: Partial<Line>) { setLines((p) => p.map((l, idx) => idx === i ? { ...l, ...patch } : l)); }
  function addLine() { setLines((p) => [...p, { variantId: '', label: '', qty: 1, unitPriceIqd: 0, discountPct: 0, discountIqd: 0 }]); setVS((p) => [...p, '']); setShowVD((p) => [...p, false]); }
  function removeLine(i: number) { setLines((p) => p.filter((_, idx) => idx !== i)); setVS((p) => p.filter((_, idx) => idx !== i)); setShowVD((p) => p.filter((_, idx) => idx !== i)); }

  const subtotal = lines.reduce((a, l) => a + lineTotal(l), 0);
  const total    = Math.max(0, subtotal - discountIqd + taxIqd);

  if (isLoading || !init) return <div className="p-6 text-slate-500">جاري التحميل...</div>;
  if (q?.status !== 'draft') return <div className="p-6 space-y-2"><div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-amber-800 text-sm">لا يمكن تعديل هذا العرض — الحالة: <strong>{q?.status}</strong></div><Link href={`/sales/quotations/${id}`} className="text-sky-700 text-sm">← العودة</Link></div>;

  return (
    <div className="space-y-6 p-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link href={`/sales/quotations/${id}`} className="text-slate-500 hover:text-slate-800"><ArrowRight className="size-5" /></Link>
        <h1 className="text-2xl font-bold">تعديل عرض السعر <span className="font-mono text-slate-600">{q?.number}</span></h1>
      </div>

      {formError && <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-red-800 text-sm">{formError}</div>}

      <form onSubmit={(e) => { e.preventDefault(); setFErr(null); if (lines.some((l) => !l.variantId)) { setFErr('أكمل جميع البنود'); return; } save.mutate(); }} className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold mb-3">صالح حتى</h2>
          <input type="date" value={validUntil} onChange={(e) => setVU(e.target.value)} required className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <div className="flex items-center justify-between"><h2 className="font-semibold">البنود</h2><button type="button" onClick={addLine} className="inline-flex items-center gap-1 text-sm text-sky-700"><Plus className="size-4" /> بند</button></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-500 border-b border-slate-200">
                <tr><th className="text-start py-2 min-w-52">المنتج</th><th className="text-end py-2 w-20">الكمية</th><th className="text-end py-2 w-28">السعر</th><th className="text-end py-2 w-20">خصم%</th><th className="text-end py-2 w-24">خصم</th><th className="text-end py-2 w-28">المجموع</th><th className="py-2 w-8" /></tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-2 relative">
                      <input type="text" value={vSearches[i] ?? ''}
                        onChange={(e) => { const v = e.target.value; setVS((p) => p.map((s, idx) => idx === i ? v : s)); setShowVD((p) => p.map((_, idx) => idx === i ? true : _)); if (!v) setLine(i, { variantId: '', label: '' }); }}
                        onFocus={() => setShowVD((p) => p.map((_, idx) => idx === i ? true : _))}
                        onBlur={() => setTimeout(() => setShowVD((p) => p.map((_, idx) => idx === i ? false : _)), 150)}
                        className="w-full rounded border border-slate-300 px-2 py-1 text-sm" />
                      {showVD[i] && <VariantDropdown search={vSearches[i] ?? ''} onSelect={(v) => { setLine(i, { variantId: v.id, label: `${v.nameAr} (${v.sku})`, unitPriceIqd: Number(v.salePriceIqd) }); setVS((p) => p.map((s, idx) => idx === i ? `${v.nameAr} (${v.sku})` : s)); setShowVD((p) => p.map((_, idx) => idx === i ? false : _)); }} />}
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
            <div><label className="block text-sm font-medium text-slate-700 mb-1">ملاحظات</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">المجموع الفرعي</span><span className="font-medium">{formatIqd(subtotal)}</span></div>
              <div className="flex items-center justify-between gap-4"><span className="text-slate-500">خصم الرأس</span><input type="number" min="0" value={discountIqd} onChange={(e) => setDI(Number(e.target.value))} className="w-32 rounded border border-slate-300 px-2 py-1 text-end text-sm" /></div>
              <div className="flex items-center justify-between gap-4"><span className="text-slate-500">الضريبة</span><input type="number" min="0" value={taxIqd} onChange={(e) => setTI(Number(e.target.value))} className="w-32 rounded border border-slate-300 px-2 py-1 text-end text-sm" /></div>
              <div className="flex justify-between border-t border-slate-200 pt-2 font-bold text-lg"><span>الإجمالي</span><span>{formatIqd(total)}</span></div>
            </div>
          </div>
        </section>

        <div className="flex justify-end gap-3">
          <Link href={`/sales/quotations/${id}`} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">إلغاء</Link>
          <button type="submit" disabled={save.isPending} className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-5 py-2 text-sm font-medium text-white disabled:opacity-50">
            {save.isPending && <Loader2 className="size-4 animate-spin" />} حفظ التغييرات
          </button>
        </div>
      </form>
    </div>
  );
}

function VariantDropdown({ search, onSelect }: { search: string; onSelect: (v: Variant) => void }) {
  const { data } = useQuery({ queryKey: ['var-search', search], queryFn: () => api<{ items: Variant[] }>(`/products/variants?search=${encodeURIComponent(search)}&limit=8`), enabled: search.length >= 2 });
  if (!data?.items?.length) return null;
  return (
    <div className="absolute z-20 top-full mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg max-h-48 overflow-y-auto">
      {data.items.map((v) => (<button key={v.id} type="button" onMouseDown={() => onSelect(v)} className="w-full text-start px-3 py-2 hover:bg-slate-50 text-sm"><div className="font-medium">{v.nameAr}</div><div className="text-xs text-slate-400">{v.sku} · {formatIqd(v.salePriceIqd)}</div></button>))}
    </div>
  );
}
