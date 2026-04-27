'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Settings, Save, Pencil, X } from 'lucide-react';

/**
 * T48 — Financial Accounts Configurator UI
 *
 * Matrix of (eventType -> account code) so admins can change which GL code
 * is used for each business event without touching backend code.
 */

type Mapping = {
  id: string;
  eventType: string;
  accountCode: string;
  description?: string | null;
};

type Account = {
  id: string;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  category: string;
  isActive: boolean;
  allowDirectPosting: boolean;
};

// Stable list of supported events; keep in sync with seed.ts
const EVENTS: Array<{ key: string; group: string; labelAr: string; expects: string }> = [
  { key: 'sale.cash',            group: 'المبيعات',  labelAr: 'بيع نقدي - حساب النقد',           expects: 'current_assets' },
  { key: 'sale.credit',          group: 'المبيعات',  labelAr: 'بيع آجل - الذمم المدينة',          expects: 'current_assets' },
  { key: 'sale.revenue.cash',    group: 'المبيعات',  labelAr: 'إيراد البيع النقدي',               expects: 'revenue' },
  { key: 'sale.revenue.cr',      group: 'المبيعات',  labelAr: 'إيراد البيع الآجل',                expects: 'revenue' },
  { key: 'sale.cogs',            group: 'المبيعات',  labelAr: 'تكلفة البضاعة المباعة',            expects: 'expense' },
  { key: 'sale.inventory',       group: 'المبيعات',  labelAr: 'المخزون - عند البيع',              expects: 'current_assets' },
  { key: 'sale.return.cogs',     group: 'المبيعات',  labelAr: 'مرتجع المبيعات - COGS',           expects: 'expense' },
  { key: 'purchase.ap',          group: 'المشتريات', labelAr: 'الذمم الدائنة',                    expects: 'liabilities' },
  { key: 'purchase.inventory',   group: 'المشتريات', labelAr: 'المخزون - عند الاستلام',           expects: 'current_assets' },
  { key: 'purchase.vat.in',      group: 'المشتريات', labelAr: 'ضريبة القيمة المضافة - مدخلات',    expects: 'current_assets' },
  { key: 'purchase.freight',     group: 'المشتريات', labelAr: 'مصاريف نقل واردة',                 expects: 'expense' },
  { key: 'grn.clearing',         group: 'المشتريات', labelAr: 'حساب التسوية - GR/IR',             expects: 'liabilities' },
  { key: 'payroll.gross',        group: 'الرواتب',   labelAr: 'إجمالي الرواتب',                   expects: 'expense' },
  { key: 'payroll.tax',          group: 'الرواتب',   labelAr: 'ضريبة دخل مستقطعة',                expects: 'liabilities' },
  { key: 'payroll.ss',           group: 'الرواتب',   labelAr: 'ضمان اجتماعي',                     expects: 'liabilities' },
  { key: 'payroll.net',          group: 'الرواتب',   labelAr: 'صافي الراتب (نقد/بنك)',            expects: 'current_assets' },
  { key: 'asset.cash',           group: 'الأصول',    labelAr: 'شراء أصل نقداً',                   expects: 'current_assets' },
  { key: 'asset.ap',             group: 'الأصول',    labelAr: 'شراء أصل آجلاً',                   expects: 'liabilities' },
  { key: 'asset.maintenance',    group: 'الأصول',    labelAr: 'صيانة أصول',                       expects: 'expense' },
  { key: 'asset.gain',           group: 'الأصول',    labelAr: 'ربح بيع أصل',                      expects: 'revenue' },
  { key: 'bank.charge',          group: 'البنوك',    labelAr: 'رسوم بنكية',                       expects: 'expense' },
  { key: 'bank.interest',        group: 'البنوك',    labelAr: 'فوائد بنكية',                      expects: 'revenue' },
  { key: 'ar.control',           group: 'الذمم',     labelAr: 'حساب الذمم المدينة الرئيسي',       expects: 'current_assets' },
];

export default function AccountMappingPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [draftCode, setDraftCode] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const mappingsQ = useQuery({
    queryKey: ['account-mappings'],
    queryFn: () => api<Mapping[]>('/finance/account-mappings'),
  });
  const accountsQ = useQuery({
    queryKey: ['chart-of-accounts'],
    queryFn: () => api<Account[]>('/finance/gl/accounts'),
  });

  const accounts = accountsQ.data ?? [];
  const mappings = mappingsQ.data ?? [];

  const codeToAccount = useMemo(() => {
    const m = new Map<string, Account>();
    for (const a of accounts) m.set(a.code, a);
    return m;
  }, [accounts]);

  const eventToMapping = useMemo(() => {
    const m = new Map<string, Mapping>();
    for (const x of mappings) m.set(x.eventType, x);
    return m;
  }, [mappings]);

  const upsert = useMutation({
    mutationFn: ({ eventType, accountCode }: { eventType: string; accountCode: string }) =>
      api(`/finance/account-mappings/${encodeURIComponent(eventType)}`, {
        method: 'PUT',
        body: { accountCode },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['account-mappings'] });
      setEditing(null);
      setError(null);
    },
    onError: (e: any) => setError(e?.messageAr ?? e?.message ?? 'فشل الحفظ'),
  });

  function startEdit(eventType: string, currentCode: string) {
    setEditing(eventType);
    setDraftCode(currentCode);
    setError(null);
  }

  function save(eventType: string) {
    setError(null);
    // Frontend validation: code must exist in active CoA and allow direct posting
    const acc = codeToAccount.get(draftCode.trim());
    if (!acc || !acc.isActive) {
      setError(`الحساب "${draftCode}" غير موجود أو غير مفعّل`);
      return;
    }
    if (!acc.allowDirectPosting) {
      setError(`الحساب "${draftCode}" لا يسمح بالترحيل المباشر`);
      return;
    }
    upsert.mutate({ eventType, accountCode: draftCode.trim() });
  }

  // Group events for matrix display
  const grouped = useMemo(() => {
    const g = new Map<string, typeof EVENTS>();
    for (const ev of EVENTS) {
      if (!g.has(ev.group)) g.set(ev.group, []);
      g.get(ev.group)!.push(ev);
    }
    return Array.from(g.entries());
  }, []);

  return (
    <div className="p-6 max-w-6xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Settings className="h-6 w-6 text-sky-700" />
          إعدادات الحسابات المالية
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          ربط أحداث الأعمال (بيع/شراء/رواتب…) بأرقام الحسابات في الدليل المحاسبي.
          هذا يستبدل الأكواد الثابتة في الكود البرمجي. (T48)
        </p>
      </header>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded p-3">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {grouped.map(([group, events]) => (
          <section key={group} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <header className="bg-slate-50 px-4 py-2 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-700">{group}</h2>
            </header>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-right px-4 py-2 w-1/3">الحدث</th>
                  <th className="text-right px-4 py-2 w-24">الكود</th>
                  <th className="text-right px-4 py-2">اسم الحساب</th>
                  <th className="text-right px-4 py-2 w-32">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => {
                  const m = eventToMapping.get(ev.key);
                  const code = m?.accountCode ?? '';
                  const acc = code ? codeToAccount.get(code) : undefined;
                  const isEditing = editing === ev.key;
                  return (
                    <tr key={ev.key} className="border-t border-slate-100">
                      <td className="px-4 py-2">
                        <div className="font-medium text-slate-800">{ev.labelAr}</div>
                        <div className="text-[11px] text-slate-500 font-mono" dir="ltr">{ev.key}</div>
                      </td>
                      <td className="px-4 py-2">
                        {isEditing ? (
                          <input
                            className="input num-latin font-mono w-24"
                            dir="ltr"
                            value={draftCode}
                            onChange={(e) => setDraftCode(e.target.value)}
                            list={`accounts-${ev.expects}`}
                            autoFocus
                          />
                        ) : (
                          <span className="font-mono" dir="ltr">{code || '—'}</span>
                        )}
                        <datalist id={`accounts-${ev.expects}`}>
                          {accounts
                            .filter((a) => a.isActive && a.allowDirectPosting && a.category === ev.expects)
                            .map((a) => (
                              <option key={a.id} value={a.code}>{a.nameAr}</option>
                            ))}
                        </datalist>
                      </td>
                      <td className="px-4 py-2 text-slate-700">
                        {acc ? `${acc.nameAr}` : <span className="text-slate-400">— لم يُضبط —</span>}
                      </td>
                      <td className="px-4 py-2">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="btn-primary !py-1 !px-2 text-xs"
                              disabled={upsert.isPending}
                              onClick={() => save(ev.key)}
                            >
                              <Save className="h-3 w-3" />
                              حفظ
                            </button>
                            <button
                              type="button"
                              className="btn-ghost !py-1 !px-2 text-xs"
                              onClick={() => { setEditing(null); setError(null); }}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn-ghost !py-1 !px-2 text-xs"
                            onClick={() => startEdit(ev.key, code)}
                          >
                            <Pencil className="h-3 w-3" />
                            تعديل
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
}
