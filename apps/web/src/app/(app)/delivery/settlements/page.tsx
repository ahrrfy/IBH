'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wallet, Plus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { formatIqd, formatDate } from '@/lib/format';

type Settlement = {
  id: string;
  number: string;
  periodStart: string;
  periodEnd: string;
  totalCodCollectedIqd: string;
  totalCommissionIqd: string;
  netDueIqd: string;
  deliveriesCount: number;
  status: 'draft' | 'proposed' | 'posted' | 'paid' | 'cancelled';
  deliveryCompany: { id: string; code: string; nameAr: string };
};

type CompanyLite = { id: string; code: string; nameAr: string; supportsCod: boolean };

export default function DeliverySettlementsPage() {
  const qc = useQueryClient();
  const [showProposeModal, setShowProposeModal] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['delivery-settlements'],
    queryFn: () => api<{ rows: Settlement[]; total: number }>('/delivery/settlements?limit=100'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Wallet className="size-7" /> تسويات COD
        </h1>
        <button
          onClick={() => setShowProposeModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-white hover:bg-primary/90"
        >
          <Plus className="size-4" /> اقتراح تسوية
        </button>
      </div>

      <DataTable
        columns={[
          { key: 'number', header: 'الرقم', accessor: (r: Settlement) => r.number },
          { key: 'company', header: 'الشركة', accessor: (r: Settlement) => r.deliveryCompany.nameAr },
          {
            key: 'period',
            header: 'الفترة',
            accessor: (r: Settlement) => `${formatDate(r.periodStart)} → ${formatDate(r.periodEnd)}`,
          },
          { key: 'count', header: 'التوصيلات', accessor: (r: Settlement) => r.deliveriesCount, align: 'end' },
          { key: 'collected', header: 'المحصَّل', accessor: (r: Settlement) => formatIqd(r.totalCodCollectedIqd), align: 'end' },
          { key: 'commission', header: 'العمولة', accessor: (r: Settlement) => formatIqd(r.totalCommissionIqd), align: 'end' },
          { key: 'net', header: 'الصافي المستحق', accessor: (r: Settlement) => formatIqd(r.netDueIqd), align: 'end' },
          { key: 'status', header: 'الحالة', accessor: (r: Settlement) => <StatusBadge status={r.status} /> },
          {
            key: 'actions',
            header: '',
            accessor: (r: Settlement) => (
              <Link href={`/delivery/settlements/${r.id}`} className="text-primary hover:underline">
                عرض
              </Link>
            ),
          },
        ]}
        rows={data?.rows ?? []}
        loading={isLoading}
        error={error ? 'خطأ بالتحميل' : null}
        onRetry={() => refetch()}
        getRowKey={(r: Settlement) => r.id}
        exportFilename="delivery-settlements"
        exportFormats={['csv', 'excel', 'pdf']}
        exportTitle="delivery-settlements"
        columnToggle
        densityToggle
        printable
      />

      {showProposeModal && (
        <ProposeModal
          onClose={() => setShowProposeModal(false)}
          onProposed={(id) => {
            setShowProposeModal(false);
            qc.invalidateQueries({ queryKey: ['delivery-settlements'] });
            window.location.href = `/delivery/settlements/${id}`;
          }}
        />
      )}
    </div>
  );
}

function ProposeModal({ onClose, onProposed }: { onClose: () => void; onProposed: (id: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [form, setForm] = useState({
    deliveryCompanyId: '',
    periodStart: weekAgo.toISOString().slice(0, 10),
    periodEnd: today.toISOString().slice(0, 10),
  });

  const companies = useQuery({
    queryKey: ['delivery-companies-cod'],
    queryFn: () => api<{ rows: CompanyLite[] }>('/delivery/companies?limit=200&isActive=true'),
  });

  const codCompanies = (companies.data?.rows ?? []).filter((c) => c.supportsCod);

  const propose = useMutation({
    mutationFn: (body: typeof form) =>
      api<{ id: string }>('/delivery/settlements/propose', { method: 'POST', body }),
    onSuccess: (r) => onProposed(r.id),
    onError: (e: unknown) => setError(e instanceof ApiError ? e.messageAr : 'فشل الاقتراح'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-semibold mb-4">اقتراح تسوية COD</h2>
        {error && (
          <div role="alert" className="rounded bg-red-50 border border-red-200 p-2 text-red-800 text-sm mb-3">
            {error}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (!form.deliveryCompanyId) {
              setError('اختر شركة');
              return;
            }
            propose.mutate(form);
          }}
          className="space-y-3"
        >
          <label className="block">
            <div className="text-sm font-medium text-slate-700 mb-1">الشركة (تدعم COD فقط) *</div>
            <select
              value={form.deliveryCompanyId}
              onChange={(e) => setForm({ ...form, deliveryCompanyId: e.target.value })}
              className="w-full rounded-lg border-slate-300"
              required
            >
              <option value="">— اختر —</option>
              {codCompanies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameAr} ({c.code})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className="text-sm font-medium text-slate-700 mb-1">من تاريخ *</div>
            <input
              type="date"
              value={form.periodStart}
              onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
              className="w-full rounded-lg border-slate-300"
              required
            />
          </label>
          <label className="block">
            <div className="text-sm font-medium text-slate-700 mb-1">إلى تاريخ *</div>
            <input
              type="date"
              value={form.periodEnd}
              onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
              className="w-full rounded-lg border-slate-300"
              required
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-50">
              إلغاء
            </button>
            <button
              type="submit"
              disabled={propose.isPending}
              className="rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {propose.isPending ? 'جاري الحساب...' : 'اقتراح'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
