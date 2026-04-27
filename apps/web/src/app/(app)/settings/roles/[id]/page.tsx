'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Shield, Save, ArrowRight, Lock, Plus, Trash2 } from 'lucide-react';
import { ROLE_LABELS_AR } from '@/lib/permissions';
import { PermissionMatrix, type PermissionMap, PERMISSION_BITS } from './permission-matrix';

interface SodRule {
  id?: string;
  conflictingActions: string[];
  description?: string;
}

interface RoleRecord {
  id: string;
  name: string;
  displayNameAr?: string;
  isSystem?: boolean;
  permissions?: PermissionMap;
  parentRoleId?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  sodRules?: SodRule[];
}

const ALL_ACTIONS = Object.keys(PERMISSION_BITS) as (keyof typeof PERMISSION_BITS)[];

/** Convert ISO datetime → "YYYY-MM-DD" for <input type="date">. */
function toDateInput(value: string | null | undefined): string {
  if (!value) return '';
  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

export default function RoleDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const id = params?.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api<unknown>('/company/roles'),
  });
  const rows: RoleRecord[] = Array.isArray(data)
    ? (data as RoleRecord[])
    : ((data as { items?: RoleRecord[] } | null)?.items ?? []);
  const role = rows.find((r) => r.id === id);

  const initial: PermissionMap = useMemo(
    () => (role?.permissions as PermissionMap) ?? {},
    [role?.permissions],
  );
  const [perms, setPerms] = useState<PermissionMap>({});
  const [parentRoleId, setParentRoleId] = useState<string>('');
  const [validFrom, setValidFrom] = useState<string>('');
  const [validUntil, setValidUntil] = useState<string>('');
  const [sodRules, setSodRules] = useState<SodRule[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ── Inherited permissions from parent (visual only) ─────────────────────
  const inherited: PermissionMap = useMemo(() => {
    if (!parentRoleId) return {};
    const visited = new Set<string>();
    const merged: PermissionMap = {};
    let cursor: string | undefined = parentRoleId;
    let depth = 0;
    while (cursor && depth < 10 && !visited.has(cursor)) {
      visited.add(cursor);
      const parent = rows.find((r) => r.id === cursor);
      if (!parent) break;
      const perms = parent.permissions ?? {};
      for (const [k, v] of Object.entries(perms)) {
        merged[k] = (merged[k] ?? 0) | (v as number);
      }
      cursor = parent.parentRoleId ?? undefined;
      depth += 1;
    }
    return merged;
  }, [parentRoleId, rows]);

  useEffect(() => {
    if (loaded || !role) return;
    setPerms({ ...initial });
    setParentRoleId(role.parentRoleId ?? '');
    setValidFrom(toDateInput(role.validFrom));
    setValidUntil(toDateInput(role.validUntil));
    setSodRules(
      (role.sodRules ?? []).map((r) => ({
        id: r.id,
        conflictingActions: [...r.conflictingActions],
        description: r.description ?? '',
      })),
    );
    setLoaded(true);
  }, [role, initial, loaded]);

  const update = useMutation({
    mutationFn: (payload: {
      permissions: PermissionMap;
      parentRoleId: string | null;
      validFrom: string | null;
      validUntil: string | null;
      sodRules: SodRule[];
    }) =>
      api<unknown>(`/company/roles/${id}/permissions`, {
        method: 'PUT',
        body: payload,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] });
      router.push('/settings/roles');
    },
    onError: (e: Error) => setErrorMsg(e?.message ?? 'فشل حفظ الصلاحيات'),
  });

  if (isLoading || !loaded) {
    return <div className="p-6 text-sm text-slate-500">جاري التحميل…</div>;
  }
  if (error || !role) {
    return (
      <div className="p-6 space-y-4">
        <p className="text-sm text-rose-600">{error ? 'تعذَّر تحميل الدور' : 'الدور غير موجود'}</p>
        <Link href="/settings/roles" className="btn-ghost btn-sm inline-flex">
          <ArrowRight className="h-4 w-4" />
          العودة للقائمة
        </Link>
      </div>
    );
  }

  const isSystem = Boolean(role.isSystem);
  const displayName = role.displayNameAr ?? ROLE_LABELS_AR[role.name] ?? role.name;
  const otherRoles = rows.filter((r) => r.id !== role.id);

  function addSodRule() {
    setSodRules((prev) => [...prev, { conflictingActions: [], description: '' }]);
  }
  function removeSodRule(index: number) {
    setSodRules((prev) => prev.filter((_, i) => i !== index));
  }
  function setSodActions(index: number, actions: string[]) {
    setSodRules((prev) =>
      prev.map((r, i) => (i === index ? { ...r, conflictingActions: actions } : r)),
    );
  }
  function setSodDescription(index: number, desc: string) {
    setSodRules((prev) =>
      prev.map((r, i) => (i === index ? { ...r, description: desc } : r)),
    );
  }

  return (
    <div className="p-6 max-w-6xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="h-6 w-6 text-sky-700" />
            {displayName}
            {isSystem && (
              <span className="badge-neutral text-[10px]">
                <Lock className="h-2.5 w-2.5" />
                دور نظام
              </span>
            )}
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-mono num-latin">{role.name}</p>
        </div>
        <Link href="/settings/roles" className="btn-ghost btn-sm">
          <ArrowRight className="h-4 w-4" />
          رجوع
        </Link>
      </header>

      {isSystem && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
          هذا دور نظام — لا يمكن تعديل صلاحياته (الحقول معطّلة).
        </div>
      )}

      {/* T47 — Hierarchy + temporal validity */}
      <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-800">التسلسل الزمني والوراثة</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <label className="space-y-1">
            <span className="block text-slate-600">الدور الأب (يورث صلاحياته)</span>
            <select
              disabled={isSystem}
              value={parentRoleId}
              onChange={(e) => setParentRoleId(e.target.value)}
              className="w-full border border-slate-300 rounded-md p-2"
            >
              <option value="">— لا يوجد —</option>
              {otherRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.displayNameAr ?? r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-slate-600">صالح من</span>
            <input
              type="date"
              disabled={isSystem}
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              className="w-full border border-slate-300 rounded-md p-2 num-latin"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-slate-600">صالح حتى</span>
            <input
              type="date"
              disabled={isSystem}
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="w-full border border-slate-300 rounded-md p-2 num-latin"
            />
          </label>
        </div>

        {parentRoleId && Object.keys(inherited).length > 0 && (
          <div className="rounded-md bg-sky-50 border border-sky-200 p-3 text-xs text-sky-800">
            <div className="font-semibold mb-1">الصلاحيات الموروثة (للقراءة فقط):</div>
            <ul className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-0.5 list-disc pr-5">
              {Object.entries(inherited).map(([resource, mask]) => (
                <li key={resource}>
                  <span className="font-mono num-latin">{resource}</span>
                  <span className="text-slate-500"> — bitmask {mask}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <PermissionMatrix value={perms} onChange={setPerms} disabled={isSystem} />

      {/* T47 — Separation of Duties */}
      <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">فصل المهام (Separation of Duties)</h2>
          <button
            type="button"
            disabled={isSystem}
            onClick={addSodRule}
            className="btn-ghost btn-sm"
          >
            <Plus className="h-4 w-4" />
            إضافة قاعدة
          </button>
        </div>
        <p className="text-xs text-slate-500">
          عرّف مجموعات من الإجراءات المتعارضة. لا يمكن للمستخدم نفسه تنفيذ أكثر من إجراء واحد منها على نفس السجل خلال 24 ساعة.
        </p>
        {sodRules.length === 0 ? (
          <p className="text-xs text-slate-400">لا توجد قواعد فصل مهام محدّدة.</p>
        ) : (
          <ul className="space-y-2">
            {sodRules.map((rule, idx) => (
              <li
                key={idx}
                className="border border-slate-200 rounded-md p-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-start"
              >
                <div className="md:col-span-5">
                  <span className="text-xs text-slate-500">الإجراءات المتعارضة (≥ 2)</span>
                  <select
                    multiple
                    disabled={isSystem}
                    value={rule.conflictingActions}
                    onChange={(e) =>
                      setSodActions(
                        idx,
                        Array.from(e.target.selectedOptions).map((o) => o.value),
                      )
                    }
                    className="mt-1 w-full border border-slate-300 rounded-md p-2 h-32 num-latin"
                  >
                    {ALL_ACTIONS.map((a) => (
                      <option key={a} value={a.toLowerCase()}>
                        {a.toLowerCase()}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-6">
                  <span className="text-xs text-slate-500">الوصف</span>
                  <input
                    type="text"
                    disabled={isSystem}
                    value={rule.description ?? ''}
                    onChange={(e) => setSodDescription(idx, e.target.value)}
                    className="mt-1 w-full border border-slate-300 rounded-md p-2"
                    placeholder="مثال: لا يمكن إنشاء واعتماد أمر الشراء من نفس المستخدم"
                  />
                </div>
                <div className="md:col-span-1 flex justify-end">
                  <button
                    type="button"
                    disabled={isSystem}
                    onClick={() => removeSodRule(idx)}
                    className="btn-ghost btn-sm text-rose-600"
                    aria-label="حذف القاعدة"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-4">
        {errorMsg && <span className="text-sm text-rose-600">{errorMsg}</span>}
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Link href="/settings/roles" className="btn-ghost">إلغاء</Link>
          <button
            disabled={isSystem || update.isPending}
            onClick={() => {
              setErrorMsg(null);
              update.mutate({
                permissions: perms,
                parentRoleId: parentRoleId || null,
                validFrom: validFrom || null,
                validUntil: validUntil || null,
                sodRules: sodRules.filter((r) => r.conflictingActions.length >= 2),
              });
            }}
            className="btn-primary"
          >
            <Save className="h-4 w-4" />
            {update.isPending ? 'جاري الحفظ…' : 'حفظ'}
          </button>
        </div>
      </div>
    </div>
  );
}
