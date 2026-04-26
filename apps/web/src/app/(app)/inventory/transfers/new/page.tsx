'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { ArrowLeftRight, ArrowRight, Plus, Trash2, Save } from 'lucide-react';

interface Line {
  variantId: string;
  qty: number;
  notes: string;
}

export default function NewTransferPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const warehousesQ = useQuery({
    queryKey: ['warehouses', 'picker'],
    queryFn: () => api<any>('/inventory/warehouses'),
  });
  const warehouses: any[] = Array.isArray(warehousesQ.data)
    ? warehousesQ.data
    : warehousesQ.data?.items ?? [];

  const [fromWarehouseId, setFrom] = useState('');
  const [toWarehouseId, setTo] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([{ variantId: '', qty: 1, notes: '' }]);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api<any>('/inventory/transfers', {
        method: 'POST',
        body: {
          fromWarehouseId,
          toWarehouseId,
          notes: notes || undefined,
          lines: lines
            .filter((l) => l.variantId.trim() !== '' && l.qty > 0)
            .map((l) => ({
              variantId: l.variantId.trim(),
              qty: l.qty,
              notes: l.notes || undefined,
            })),
        },
      }),
    onSuccess: (created: any) => {
      qc.invalidateQueries({ queryKey: ['transfers'] });
      router.push(`/inventory/transfers/${created.id}`);
    },
    onError: (e: any) => setError(e?.messageAr ?? e?.message ?? 'تعذَّر إنشاء التحويل'),
  });

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const validLines = lines.filter((l) => l.variantId.trim() !== '' && l.qty > 0);
  const canSubmit =
    fromWarehouseId !== '' &&
    toWarehouseId !== '' &&
    fromWarehouseId !== toWarehouseId &&
    validLines.length > 0;

  return (
    <div className="p-6 max-w-5xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ArrowLeftRight className="h-6 w-6 text-sky-700" />
            تحويل مخزون جديد
          </h1>
          <p className="text-sm text-slate-500 mt-1">حدِّد المستودعات والكميات</p>
        </div>
        <Link href="/inventory/transfers" className="text-sm text-slate-500 hover:text-sky-700 flex items-center gap-1">
          <ArrowRight className="h-4 w-4" />
          العودة للقائمة
        </Link>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          create.mutate();
        }}
        className="space-y-5"
      >
        <div className="bg-white border border-slate-200 rounded-lg p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="من مستودع" required>
            <select
              className="input"
              value={fromWarehouseId}
              onChange={(e) => setFrom(e.target.value)}
              required
            >
              <option value="">— اختر —</option>
              {warehouses.map((w: any) => (
                <option key={w.id} value={w.id}>
                  {w.code} · {w.nameAr}
                </option>
              ))}
            </select>
          </Field>
          <Field label="إلى مستودع" required>
            <select
              className="input"
              value={toWarehouseId}
              onChange={(e) => setTo(e.target.value)}
              required
            >
              <option value="">— اختر —</option>
              {warehouses
                .filter((w: any) => w.id !== fromWarehouseId)
                .map((w: any) => (
                  <option key={w.id} value={w.id}>
                    {w.code} · {w.nameAr}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="ملاحظات" fullWidth>
            <textarea
              className="input min-h-[60px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900">البنود</h2>
            <button
              type="button"
              onClick={() => setLines((p) => [...p, { variantId: '', qty: 1, notes: '' }])}
              className="btn-ghost btn-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              بند
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="text-slate-500 text-xs">
              <tr>
                <th className="text-right pb-2 font-medium">معرّف الصنف (variantId)</th>
                <th className="text-end pb-2 font-medium w-32">الكمية</th>
                <th className="text-right pb-2 font-medium">ملاحظات</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-2 pr-1">
                    <input
                      className="input num-latin font-mono text-xs"
                      dir="ltr"
                      value={l.variantId}
                      onChange={(e) => setLine(i, { variantId: e.target.value })}
                    />
                  </td>
                  <td className="py-2 px-1">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      className="input num-latin text-end"
                      value={l.qty}
                      onChange={(e) => setLine(i, { qty: Number(e.target.value) })}
                    />
                  </td>
                  <td className="py-2 px-1">
                    <input
                      className="input"
                      value={l.notes}
                      onChange={(e) => setLine(i, { notes: e.target.value })}
                    />
                  </td>
                  <td className="py-2 pl-1 text-center">
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
                        className="text-rose-500 hover:text-rose-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-4">
          {error && <span className="text-sm text-rose-600">{error}</span>}
          {!error && fromWarehouseId && toWarehouseId === fromWarehouseId && (
            <span className="text-sm text-rose-600">المستودع المصدر والوجهة يجب أن يكونا مختلفين</span>
          )}
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Link href="/inventory/transfers" className="btn-ghost">
              إلغاء
            </Link>
            <button
              type="submit"
              disabled={!canSubmit || create.isPending}
              className="btn-primary"
            >
              <Save className="h-4 w-4" />
              {create.isPending ? 'جاري الحفظ…' : 'إنشاء'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  fullWidth,
  children,
}: {
  label: string;
  required?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={fullWidth ? 'block md:col-span-2' : 'block'}>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}
