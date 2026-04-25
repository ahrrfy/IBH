'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Line { variantId: string; qty: number; unitPriceIqd: number }

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const { data: suppliers } = useQuery({
    queryKey: ['suppliers', 'picker'],
    queryFn: () => api<any>('/purchases/suppliers'),
  });
  const { data: warehouses } = useQuery({
    queryKey: ['warehouses', 'picker'],
    queryFn: () => api<any>('/inventory/warehouses'),
  });
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([{ variantId: '', qty: 1, unitPriceIqd: 0 }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const subtotal = lines.reduce((a, l) => a + l.qty * l.unitPriceIqd, 0);
  const setLine = (i: number, patch: Partial<Line>) => setLines((p) => p.map((l, idx) => idx === i ? { ...l, ...patch } : l));

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const created = await api<any>('/purchases/orders', {
        method: 'POST',
        body: { supplierId, warehouseId, notes, lines },
      });
      router.push(`/purchases/orders/${created.id}`);
    } catch (e: any) {
      setErr(e?.messageAr ?? 'تعذَّر إنشاء أمر الشراء');
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <header>
        <Link href="/purchases/orders" className="text-sm text-sky-700 hover:underline">← أوامر الشراء</Link>
        <h1 className="mt-2 text-3xl font-bold">أمر شراء جديد</h1>
      </header>

      <section className="grid gap-3 rounded-lg bg-white p-4 shadow-sm md:grid-cols-3">
        <label className="block">
          <span className="text-sm text-slate-500">المورد</span>
          <select className="mt-1 w-full rounded border px-3 py-2" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">— اختر —</option>
            {(suppliers?.items ?? []).map((s: any) => (
              <option key={s.id} value={s.id}>{s.code} · {s.nameAr}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm text-slate-500">المستودع</span>
          <select className="mt-1 w-full rounded border px-3 py-2" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">— اختر —</option>
            {(warehouses?.items ?? []).map((w: any) => (
              <option key={w.id} value={w.id}>{w.code} · {w.nameAr}</option>
            ))}
          </select>
        </label>
        <label className="block md:col-span-3">
          <span className="text-sm text-slate-500">ملاحظات</span>
          <input className="mt-1 w-full rounded border px-3 py-2" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </section>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">البنود</h2>
          <button onClick={() => setLines((p) => [...p, { variantId: '', qty: 1, unitPriceIqd: 0 }])} className="rounded bg-slate-100 px-3 py-1 text-sm">+ بند</button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-slate-500">
            <tr><th className="text-start">المنتج</th><th className="text-end">الكمية</th><th className="text-end">السعر</th><th className="text-end">المجموع</th></tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-t">
                <td className="py-2"><input className="w-full rounded border px-2 py-1 font-mono" value={l.variantId} onChange={(e) => setLine(i, { variantId: e.target.value })} /></td>
                <td className="text-end"><input type="number" className="w-20 rounded border px-2 py-1 text-end" value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} /></td>
                <td className="text-end"><input type="number" className="w-32 rounded border px-2 py-1 text-end" value={l.unitPriceIqd} onChange={(e) => setLine(i, { unitPriceIqd: Number(e.target.value) })} /></td>
                <td className="text-end">{(l.qty * l.unitPriceIqd).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 text-end text-lg font-semibold">المجموع: {subtotal.toLocaleString()} د.ع</div>
      </section>

      {err && <div className="rounded bg-rose-50 p-3 text-rose-700">{err}</div>}

      <div className="flex justify-end gap-2">
        <Link href="/purchases/orders" className="rounded border px-4 py-2">إلغاء</Link>
        <button onClick={submit} disabled={busy || !supplierId || !warehouseId} className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50">
          {busy ? 'جارٍ الحفظ…' : 'حفظ'}
        </button>
      </div>
    </div>
  );
}
