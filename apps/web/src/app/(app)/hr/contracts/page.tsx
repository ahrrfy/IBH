'use client';

/**
 * HR Contracts admin page (T52).
 *
 * Lists all employment contracts with status filter, plus a quick-create
 * form to issue a new contract from an active template (optionally linked
 * to an accepted recruitment offer letter — read-only consumer of T51).
 */
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

type Contract = {
  id: string;
  contractNo: string;
  employeeId: string;
  templateId: string;
  status: 'draft' | 'active' | 'expired' | 'terminated';
  startDate: string;
  endDate: string | null;
  salaryIqd: string;
  signedAt: string | null;
};

type Template = {
  id: string;
  code: string;
  nameAr: string;
  status: 'draft' | 'active' | 'archived';
};

const STATUS_LABEL: Record<Contract['status'], string> = {
  draft: 'مسودة',
  active: 'فعّال',
  expired: 'منتهي',
  terminated: 'مفسوخ',
};

export default function ContractsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    templateId: '',
    employeeId: '',
    offerLetterId: '',
    contractNo: '',
    startDate: '',
    endDate: '',
    salaryIqd: '',
  });

  const contractsQ = useQuery({
    queryKey: ['hr', 'contracts'],
    queryFn: () => api<Contract[]>('/hr/contracts'),
  });

  const templatesQ = useQuery({
    queryKey: ['hr', 'contract-templates'],
    queryFn: () => api<Template[]>('/hr/contracts/templates'),
  });

  const create = useMutation({
    mutationFn: () =>
      api<Contract>('/hr/contracts', {
        method: 'POST',
        body: {
          ...form,
          offerLetterId: form.offerLetterId || undefined,
          endDate: form.endDate || undefined,
          salaryIqd: form.salaryIqd,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr', 'contracts'] });
      setForm({
        templateId: '',
        employeeId: '',
        offerLetterId: '',
        contractNo: '',
        startDate: '',
        endDate: '',
        salaryIqd: '',
      });
    },
  });

  const activate = useMutation({
    mutationFn: (id: string) =>
      api(`/hr/contracts/${id}/activate`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'contracts'] }),
  });

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">عقود التوظيف</h1>
        <p className="text-sm text-slate-600">
          إصدار عقود من قوالب جاهزة، تذكير تلقائي بالتجديد قبل 30 يوماً.
        </p>
      </header>

      <section className="rounded border bg-white p-4">
        <h2 className="mb-3 font-semibold">إصدار عقد جديد</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <select
            className="rounded border p-2"
            value={form.templateId}
            onChange={(e) => setForm({ ...form, templateId: e.target.value })}
          >
            <option value="">— اختر القالب —</option>
            {(templatesQ.data ?? [])
              .filter((t) => t.status === 'active')
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nameAr} ({t.code})
                </option>
              ))}
          </select>
          <input
            className="rounded border p-2"
            placeholder="معرّف الموظف (ULID)"
            value={form.employeeId}
            onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
          />
          <input
            className="rounded border p-2"
            placeholder="رقم العقد"
            value={form.contractNo}
            onChange={(e) => setForm({ ...form, contractNo: e.target.value })}
          />
          <input
            className="rounded border p-2"
            type="date"
            placeholder="بداية"
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
          />
          <input
            className="rounded border p-2"
            type="date"
            placeholder="نهاية (اختياري)"
            value={form.endDate}
            onChange={(e) => setForm({ ...form, endDate: e.target.value })}
          />
          <input
            className="rounded border p-2"
            placeholder="الراتب IQD"
            value={form.salaryIqd}
            onChange={(e) => setForm({ ...form, salaryIqd: e.target.value })}
          />
          <input
            className="rounded border p-2 md:col-span-2"
            placeholder="عرض توظيف مرتبط — اختياري (ULID)"
            value={form.offerLetterId}
            onChange={(e) => setForm({ ...form, offerLetterId: e.target.value })}
          />
          <button
            className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-50"
            onClick={() => create.mutate()}
            disabled={
              create.isPending ||
              !form.templateId ||
              !form.employeeId ||
              !form.contractNo ||
              !form.startDate ||
              !form.salaryIqd
            }
          >
            {create.isPending ? '...' : 'إصدار العقد'}
          </button>
        </div>
        {create.isError && (
          <div className="mt-2 text-sm text-rose-700">
            {(create.error as Error).message}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">العقود ({contractsQ.data?.length ?? 0})</h2>
        <table className="w-full border bg-white text-sm">
          <thead className="bg-slate-50 text-right">
            <tr>
              <th className="p-2">رقم العقد</th>
              <th className="p-2">الحالة</th>
              <th className="p-2">البداية</th>
              <th className="p-2">النهاية</th>
              <th className="p-2">الراتب</th>
              <th className="p-2">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {(contractsQ.data ?? []).map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-2 font-mono">{c.contractNo}</td>
                <td className="p-2">{STATUS_LABEL[c.status]}</td>
                <td className="p-2">{c.startDate?.slice(0, 10)}</td>
                <td className="p-2">{c.endDate?.slice(0, 10) ?? '—'}</td>
                <td className="p-2">{c.salaryIqd}</td>
                <td className="p-2 space-x-2 space-x-reverse">
                  <Link
                    className="text-blue-700 underline"
                    href={`/hr/contracts/${c.id}`}
                  >
                    عرض
                  </Link>
                  {c.status === 'draft' && (
                    <button
                      className="text-emerald-700 underline"
                      onClick={() => activate.mutate(c.id)}
                    >
                      تفعيل
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
