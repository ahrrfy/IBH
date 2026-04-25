'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Line {
  variantId: string;
  qty: number;
  unitPriceIqd: number;
}

export default function NewSalesInvoicePage() {
  const router = useRouter();
  const [customerId, setCustomerId] = useState('');
  const [paymentTerms, setPaymentTerms] = useState<'cash' | 'credit'>('cash');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([{ variantId: '', qty: 1, unitPriceIqd: 0 }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const subtotal = lines.reduce((a, l) => a + l.qty * l.unitPriceIqd, 0);

  function setLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() { setLines((p) => [...p, { variantId: '', qty: 1, unitPriceIqd: 0 }]); }
  function removeLine(i: number) { setLines((p) => p.filter((_, idx) => idx !== i)); }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const created = await api<any>('/sales/invoices', {
        method: 'POST',
        body: { customerId, paymentTerms, notes, lines },
      });
      router.push(`/sales/invoices/${created.id}`);
    } catch (e: any) {
      setErr(e?.messageAr ?? 'تعذَّر إنشاء الفاتورة');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <Link href="/sales/invoices" className="text-sm text-sky-700 hover:underline">← الفواتير</Link>
        <h1 className="mt-2 text-3xl font-bold">فاتورة مبيعات جديدة</h1>
      </header>

      <section className="grid gap-3 rounded-lg bg-white p-4 shadow-sm md:grid-cols-3">
        <label className="block">
          <span className="text-sm text-slate-500">العميل (ID)</span>
          <input className="mt-1 w-full rounded border px-3 py-2" value={customerId} onChange={(e) => setCustomerId(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm text-slate-500">شروط الدفع</span>
          <select className="mt-1 w-full rounded border px-3 py-2" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value as any)}>
            <option value="cash">نقدي</option>
            <option value="credit">آجل</option>
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
          <button onClick={addLine} className="rounded bg-slate-100 px-3 py-1 text-sm">+ بند</button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-slate-500">
            <tr><th className="text-start">المنتج (variantId)</th><th className="text-end">الكمية</th><th className="text-end">السعر</th><th className="text-end">المجموع</th><th></th></tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-t">
                <td className="py-2"><input className="w-full rounded border px-2 py-1 font-mono" value={l.variantId} onChange={(e) => setLine(i, { variantId: e.target.value })} /></td>
                <td className="text-end"><input type="number" className="w-20 rounded border px-2 py-1 text-end" value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} /></td>
                <td className="text-end"><input type="number" className="w-32 rounded border px-2 py-1 text-end" value={l.unitPriceIqd} onChange={(e) => setLine(i, { unitPriceIqd: Number(e.target.value) })} /></td>
                <td className="text-end">{(l.qty * l.unitPriceIqd).toLocaleString()}</td>
                <td><button onClick={() => removeLine(i)} className="text-rose-600">×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 text-end text-lg font-semibold">المجموع: {subtotal.toLocaleString()} د.ع</div>
      </section>

      {err && <div className="rounded bg-rose-50 p-3 text-rose-700">{err}</div>}

      <div className="flex justify-end gap-2">
        <Link href="/sales/invoices" className="rounded border px-4 py-2">إلغاء</Link>
        <button onClick={submit} disabled={busy || !customerId || lines.length === 0} className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50">
          {busy ? 'جارٍ الحفظ…' : 'حفظ'}
        </button>
      </div>
    </div>
  );
}
