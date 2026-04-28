'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

// I047 — page was missing → Next.js 404 on /sales/commissions/plans/new.
// Minimal create form matching the API's createPlanSchema (see
// apps/api/src/modules/sales/commissions/dto/commissions.dto.ts).
export default function NewCommissionPlanPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: '',
    nameAr: '',
    nameEn: '',
    basis: 'sales' as 'sales' | 'margin',
    kind: 'flat' as 'flat' | 'tiered' | 'product',
    flatPct: 0,
    notes: '',
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        code: form.code.trim(),
        nameAr: form.nameAr.trim(),
        basis: form.basis,
        kind: form.kind,
        flatPct: Number(form.flatPct) || 0,
      };
      if (form.nameEn.trim()) payload.nameEn = form.nameEn.trim();
      if (form.notes.trim()) payload.notes = form.notes.trim();

      await api('/sales/commissions/plans', { method: 'POST', body: payload });
      router.push('/sales/commissions/plans');
    } catch (e) {
      setError(e instanceof ApiError ? e.messageAr : 'فشل إنشاء الخطة');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/sales/commissions/plans" className="text-slate-500 hover:text-slate-800">
          <ArrowRight className="size-5" />
        </Link>
        <h1 className="text-3xl font-bold">خطة عمولة جديدة</h1>
      </div>

      <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 max-w-2xl">
        {error && (
          <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-sm text-slate-700 mb-1">الكود *</span>
            <input
              type="text"
              required
              value={form.code}
              onChange={(e) => set('code', e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              maxLength={40}
              placeholder="مثل: SALES-2026"
            />
          </label>
          <label className="block">
            <span className="block text-sm text-slate-700 mb-1">الاسم بالعربية *</span>
            <input
              type="text"
              required
              value={form.nameAr}
              onChange={(e) => set('nameAr', e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              maxLength={200}
            />
          </label>
        </div>

        <label className="block">
          <span className="block text-sm text-slate-700 mb-1">الاسم بالإنجليزية (اختياري)</span>
          <input
            type="text"
            value={form.nameEn}
            onChange={(e) => set('nameEn', e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            maxLength={200}
          />
        </label>

        <div className="grid grid-cols-3 gap-4">
          <label className="block">
            <span className="block text-sm text-slate-700 mb-1">الأساس</span>
            <select
              value={form.basis}
              onChange={(e) => set('basis', e.target.value as 'sales' | 'margin')}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm bg-white"
            >
              <option value="sales">المبيعات</option>
              <option value="margin">الربح الإجمالي</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-sm text-slate-700 mb-1">النوع</span>
            <select
              value={form.kind}
              onChange={(e) => set('kind', e.target.value as 'flat' | 'tiered' | 'product')}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm bg-white"
            >
              <option value="flat">نسبة موحّدة</option>
              <option value="tiered">شرائح</option>
              <option value="product">حسب المنتج</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-sm text-slate-700 mb-1">النسبة الموحّدة (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={form.flatPct}
              onChange={(e) => set('flatPct', Number(e.target.value))}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <label className="block">
          <span className="block text-sm text-slate-700 mb-1">ملاحظات (اختياري)</span>
          <textarea
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            maxLength={2000}
            rows={3}
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50"
          >
            {busy ? 'جاري الحفظ...' : 'حفظ'}
          </button>
          <Link href="/sales/commissions/plans" className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            إلغاء
          </Link>
        </div>
      </form>
    </div>
  );
}
