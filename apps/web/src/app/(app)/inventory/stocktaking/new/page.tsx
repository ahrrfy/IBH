'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { ClipboardList, ArrowRight, Save } from 'lucide-react';

export default function NewStocktakingPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const warehousesQ = useQuery({
    queryKey: ['warehouses', 'picker'],
    queryFn: () => api<any>('/inventory/warehouses'),
  });
  const warehouses: any[] = Array.isArray(warehousesQ.data)
    ? warehousesQ.data
    : warehousesQ.data?.items ?? [];

  const [warehouseId, setWarehouseId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api<any>('/inventory/stocktaking', {
        method: 'POST',
        body: { warehouseId, notes: notes || undefined },
      }),
    onSuccess: (created: any) => {
      qc.invalidateQueries({ queryKey: ['stocktaking'] });
      router.push(`/inventory/stocktaking/${created.id}`);
    },
    onError: (e: any) => setError(e?.messageAr ?? e?.message ?? 'تعذَّر إنشاء جلسة الجرد'),
  });

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-sky-700" />
            جلسة جرد جديدة
          </h1>
          <p className="text-sm text-slate-500 mt-1">اختر المستودع لبدء الجرد</p>
        </div>
        <Link href="/inventory/stocktaking" className="text-sm text-slate-500 hover:text-sky-700 flex items-center gap-1">
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
        className="bg-white border border-slate-200 rounded-lg p-6 space-y-4"
      >
        <Field label="المستودع" required>
          <select
            className="input"
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
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
        <Field label="ملاحظات">
          <textarea
            className="input min-h-[80px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <div className="flex items-center justify-between pt-3 border-t">
          {error && <span className="text-sm text-rose-600">{error}</span>}
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Link href="/inventory/stocktaking" className="btn-ghost">إلغاء</Link>
            <button type="submit" disabled={!warehouseId || create.isPending} className="btn-primary">
              <Save className="h-4 w-4" />
              {create.isPending ? 'جاري الإنشاء…' : 'بدء الجرد'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}
