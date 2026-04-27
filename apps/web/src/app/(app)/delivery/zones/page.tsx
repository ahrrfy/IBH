'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, MapPin, Trash2, Edit2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { ConfirmDialog } from '@/components/confirm-dialog';

type Zone = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  city: string | null;
  level: number;
  parentId: string | null;
  isActive: boolean;
};

type CompanyLite = { id: string; code: string; nameAr: string; isActive: boolean };
type Rate = {
  id: string;
  deliveryCompanyId: string;
  deliveryZoneId: string;
  baseFeeIqd: string;
  perKgIqd: string;
  estimatedHours: number;
  deliveryCompany: CompanyLite;
  deliveryZone: { id: string; code: string; nameAr: string };
};

export default function DeliveryZonesPage() {
  const qc = useQueryClient();
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Zone | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showRateForm, setShowRateForm] = useState<{ zone: Zone } | null>(null);

  const zones = useQuery({
    queryKey: ['delivery-zones'],
    queryFn: () => api<Zone[]>('/delivery/companies/zones/list'),
  });
  const companies = useQuery({
    queryKey: ['delivery-companies-lite'],
    queryFn: () => api<{ rows: CompanyLite[] }>('/delivery/companies?limit=200&isActive=true'),
  });
  const rates = useQuery({
    queryKey: ['delivery-rates'],
    queryFn: () => api<Rate[]>('/delivery/companies/rates/list?isActive=true'),
  });

  const deleteZone = useMutation({
    mutationFn: (id: string) => api(`/delivery/companies/zones/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setConfirmDelete(null);
      qc.invalidateQueries({ queryKey: ['delivery-zones'] });
      qc.invalidateQueries({ queryKey: ['delivery-rates'] });
    },
    onError: (e: unknown) => {
      setActionError(e instanceof ApiError ? e.messageAr : 'فشل الحذف');
      setConfirmDelete(null);
    },
  });

  const ratesByZone: Record<string, Rate[]> = {};
  for (const r of rates.data ?? []) {
    (ratesByZone[r.deliveryZoneId] ??= []).push(r);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <MapPin className="size-7" /> المناطق والتسعيرات
        </h1>
        <button
          onClick={() => {
            setEditingZone(null);
            setShowZoneForm(true);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-white hover:bg-primary/90"
        >
          <Plus className="size-4" /> منطقة جديدة
        </button>
      </div>

      {actionError && (
        <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-red-800 text-sm">
          {actionError}
        </div>
      )}

      {zones.isLoading ? (
        <div className="text-slate-500">جاري التحميل...</div>
      ) : (zones.data ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
          لا توجد مناطق. ابدأ بإضافة منطقة (مثلاً: بغداد، الكرخ، البصرة المركز).
        </div>
      ) : (
        <div className="space-y-3">
          {(zones.data ?? []).map((z) => {
            const zoneRates = ratesByZone[z.id] ?? [];
            return (
              <div key={z.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg">{z.nameAr}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">{z.code}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-sky-50 text-sky-700">المستوى {z.level}</span>
                      {!z.isActive && <span className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-700">موقوف</span>}
                    </div>
                    {z.city && <div className="text-sm text-slate-500 mt-1">المدينة: {z.city}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowRateForm({ zone: z })}
                      className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <Plus className="size-3" /> إضافة تسعيرة
                    </button>
                    <button
                      onClick={() => {
                        setEditingZone(z);
                        setShowZoneForm(true);
                      }}
                      className="text-sm text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
                    >
                      <Edit2 className="size-3" /> تعديل
                    </button>
                    <button
                      onClick={() => {
                        setActionError(null);
                        setConfirmDelete(z);
                      }}
                      className="text-sm text-red-600 hover:text-red-800 inline-flex items-center gap-1"
                    >
                      <Trash2 className="size-3" /> حذف
                    </button>
                  </div>
                </div>

                {zoneRates.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <table className="w-full text-sm">
                      <thead className="text-slate-500 text-xs">
                        <tr>
                          <th className="text-start py-1">الشركة</th>
                          <th className="text-end py-1">الرسوم الأساسية (د.ع)</th>
                          <th className="text-end py-1">لكل كغ</th>
                          <th className="text-end py-1">الزمن المتوقع</th>
                        </tr>
                      </thead>
                      <tbody>
                        {zoneRates.map((r) => (
                          <tr key={r.id} className="border-t border-slate-100">
                            <td className="py-1">{r.deliveryCompany.nameAr} <span className="text-xs text-slate-400">({r.deliveryCompany.code})</span></td>
                            <td className="py-1 text-end font-medium">{Number(r.baseFeeIqd).toLocaleString('ar-IQ')}</td>
                            <td className="py-1 text-end">{Number(r.perKgIqd) > 0 ? Number(r.perKgIqd).toLocaleString('ar-IQ') : '—'}</td>
                            <td className="py-1 text-end">{r.estimatedHours} س</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showZoneForm && (
        <ZoneFormModal
          zone={editingZone}
          parentZones={zones.data ?? []}
          onClose={() => setShowZoneForm(false)}
          onSaved={() => {
            setShowZoneForm(false);
            qc.invalidateQueries({ queryKey: ['delivery-zones'] });
          }}
        />
      )}

      {showRateForm && (
        <RateFormModal
          zone={showRateForm.zone}
          companies={companies.data?.rows ?? []}
          onClose={() => setShowRateForm(null)}
          onSaved={() => {
            setShowRateForm(null);
            qc.invalidateQueries({ queryKey: ['delivery-rates'] });
          }}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="حذف المنطقة"
        message={`سيتم حذف المنطقة "${confirmDelete?.nameAr}" نهائياً. لا يمكن الحذف إذا كانت مرتبطة بتوصيلات سابقة.`}
        confirmLabel="حذف"
        tone="danger"
        loading={deleteZone.isPending}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && deleteZone.mutate(confirmDelete.id)}
      />
    </div>
  );
}

function ZoneFormModal({
  zone,
  parentZones,
  onClose,
  onSaved,
}: {
  zone: Zone | null;
  parentZones: Zone[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: zone?.code ?? '',
    nameAr: zone?.nameAr ?? '',
    nameEn: zone?.nameEn ?? '',
    city: zone?.city ?? '',
    parentId: zone?.parentId ?? '',
    level: zone?.level ?? 0,
    isActive: zone?.isActive ?? true,
  });

  const save = useMutation({
    mutationFn: (body: typeof form) =>
      zone
        ? api(`/delivery/companies/zones/${zone.id}`, { method: 'PUT', body })
        : api('/delivery/companies/zones', { method: 'POST', body }),
    onSuccess: onSaved,
    onError: (e: unknown) => setError(e instanceof ApiError ? e.messageAr : 'فشل الحفظ'),
  });

  return (
    <Modal title={zone ? `تعديل: ${zone.nameAr}` : 'منطقة جديدة'} onClose={onClose}>
      {error && (
        <div role="alert" className="rounded bg-red-50 border border-red-200 p-2 text-red-800 text-sm mb-3">
          {error}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          save.mutate(form);
        }}
        className="space-y-3"
      >
        <Field label="الكود *">
          <input
            value={form.code}
            disabled={!!zone}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            className="w-full rounded-lg border-slate-300 disabled:bg-slate-50"
            placeholder="BGD-KARKH"
            required
          />
        </Field>
        <Field label="الاسم العربي *">
          <input
            value={form.nameAr}
            onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
            className="w-full rounded-lg border-slate-300"
            required
          />
        </Field>
        <Field label="الاسم الإنجليزي">
          <input
            value={form.nameEn}
            onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
            className="w-full rounded-lg border-slate-300"
          />
        </Field>
        <Field label="المدينة (لمطابقة العنوان تلقائياً)">
          <input
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            className="w-full rounded-lg border-slate-300"
            placeholder="بغداد"
          />
        </Field>
        <Field label="المنطقة الأم">
          <select
            value={form.parentId}
            onChange={(e) => setForm({ ...form, parentId: e.target.value })}
            className="w-full rounded-lg border-slate-300"
          >
            <option value="">— لا يوجد (المستوى الأعلى) —</option>
            {parentZones
              .filter((z) => z.id !== zone?.id)
              .map((z) => (
                <option key={z.id} value={z.id}>
                  {z.nameAr} ({z.code}) — مستوى {z.level}
                </option>
              ))}
          </select>
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-50">
            إلغاء
          </button>
          <button
            type="submit"
            disabled={save.isPending}
            className="rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {save.isPending ? 'جاري الحفظ...' : 'حفظ'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RateFormModal({
  zone,
  companies,
  onClose,
  onSaved,
}: {
  zone: Zone;
  companies: CompanyLite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    deliveryCompanyId: companies[0]?.id ?? '',
    deliveryZoneId: zone.id,
    baseFeeIqd: '0',
    perKgIqd: '0',
    estimatedHours: 24,
  });

  const save = useMutation({
    mutationFn: (body: typeof form) => api('/delivery/companies/rates', { method: 'POST', body }),
    onSuccess: onSaved,
    onError: (e: unknown) => setError(e instanceof ApiError ? e.messageAr : 'فشل الحفظ'),
  });

  return (
    <Modal title={`تسعيرة لمنطقة: ${zone.nameAr}`} onClose={onClose}>
      {error && (
        <div role="alert" className="rounded bg-red-50 border border-red-200 p-2 text-red-800 text-sm mb-3">
          {error}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          save.mutate(form);
        }}
        className="space-y-3"
      >
        <Field label="شركة التوصيل *">
          <select
            value={form.deliveryCompanyId}
            onChange={(e) => setForm({ ...form, deliveryCompanyId: e.target.value })}
            className="w-full rounded-lg border-slate-300"
            required
          >
            {companies.length === 0 ? (
              <option value="">لا توجد شركات نشطة</option>
            ) : (
              companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameAr} ({c.code})
                </option>
              ))
            )}
          </select>
        </Field>
        <Field label="الرسوم الأساسية (د.ع) *">
          <input
            type="number"
            min="0"
            step="0.001"
            value={form.baseFeeIqd}
            onChange={(e) => setForm({ ...form, baseFeeIqd: e.target.value })}
            className="w-full rounded-lg border-slate-300"
            required
          />
        </Field>
        <Field label="رسوم لكل كغ (د.ع)">
          <input
            type="number"
            min="0"
            step="0.001"
            value={form.perKgIqd}
            onChange={(e) => setForm({ ...form, perKgIqd: e.target.value })}
            className="w-full rounded-lg border-slate-300"
          />
        </Field>
        <Field label="الزمن المتوقع (ساعات)">
          <input
            type="number"
            min="1"
            value={form.estimatedHours}
            onChange={(e) => setForm({ ...form, estimatedHours: Number(e.target.value) })}
            className="w-full rounded-lg border-slate-300"
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-50">
            إلغاء
          </button>
          <button
            type="submit"
            disabled={save.isPending || !form.deliveryCompanyId}
            className="rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {save.isPending ? 'جاري الحفظ...' : 'حفظ'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-sm font-medium text-slate-700 mb-1">{label}</div>
      {children}
    </label>
  );
}
