'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ROLE_LABELS_AR } from '@/lib/permissions';
import { Save, ArrowRight, Trash2, Shield, AlertTriangle, Crown } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'active', labelAr: 'نشط' },
  { value: 'inactive', labelAr: 'غير نشط' },
  { value: 'locked', labelAr: 'مقفول' },
  { value: 'pending_verification', labelAr: 'بانتظار التحقق' },
];

export default function EditUserPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const qc = useQueryClient();
  const { user: currentUser } = useAuth();

  const { data: user, isLoading: loadingUser, error: userError } = useQuery({
    queryKey: ['user', id],
    queryFn: () => api<any>(`/users/${id}`),
    enabled: !!id,
  });

  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: () => api<any>('/company/branches') });
  const { data: roles }    = useQuery({ queryKey: ['roles'],    queryFn: () => api<any>('/company/roles') });
  const branchList: any[] = Array.isArray(branches) ? branches : branches?.items ?? [];
  const roleList:   any[] = Array.isArray(roles)    ? roles    : roles?.items    ?? [];

  const [form, setForm] = useState({
    nameAr: '', nameEn: '', branchId: '', status: 'active' as string, roleIds: [] as string[],
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Hydrate form once user is loaded
  useEffect(() => {
    if (!user) return;
    setForm({
      nameAr:   user.nameAr ?? '',
      nameEn:   user.nameEn ?? '',
      branchId: user.branchId ?? '',
      status:   user.status ?? 'active',
      roleIds:  user.userRoles?.map((ur: any) => ur.role.id) ?? [],
    });
  }, [user]);

  const isSelf = !!currentUser?.id && currentUser.id === id;
  const isOwner = !!user?.isSystemOwner;
  // Don't let anyone (including the owner themselves via this UI) flip an
  // owner away from `active` or wipe their roles — backend has its own
  // guards but UI should make the safe path obvious.
  const lockStatus = isOwner;

  const update = useMutation({
    mutationFn: async () => {
      // 1. update profile fields (nameAr/nameEn/branchId/status)
      await api(`/users/${id}`, {
        method: 'PUT',
        body: {
          nameAr:   form.nameAr || undefined,
          nameEn:   form.nameEn || undefined,
          branchId: form.branchId || undefined,
          ...(lockStatus ? {} : { status: form.status }),
        },
      });
      // 2. update roles separately (different endpoint)
      const initialRoleIds = (user?.userRoles?.map((ur: any) => ur.role.id) ?? []).slice().sort();
      const nextRoleIds    = form.roleIds.slice().sort();
      const rolesChanged   = JSON.stringify(initialRoleIds) !== JSON.stringify(nextRoleIds);
      if (rolesChanged && nextRoleIds.length > 0) {
        await api(`/users/${id}/roles`, { method: 'PUT', body: { roleIds: nextRoleIds } });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['user', id] });
      router.push(`/settings/users/${id}`);
    },
    onError: (e: any) => setError(e?.message ?? 'فشل حفظ التعديلات'),
  });

  const deactivate = useMutation({
    mutationFn: () => api(`/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      router.push('/settings/users');
    },
    onError: (e: any) => setError(e?.message ?? 'فشل التعطيل'),
  });

  function toggleRole(roleId: string) {
    setForm((f) => ({
      ...f,
      roleIds: f.roleIds.includes(roleId) ? f.roleIds.filter((r) => r !== roleId) : [...f.roleIds, roleId],
    }));
  }

  if (loadingUser) return <div className="p-6 text-sm text-slate-500">جاري التحميل…</div>;
  if (userError || !user) {
    return (
      <div className="p-6 max-w-2xl">
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          تعذَّر تحميل المستخدم.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            تعديل المستخدم
            {isOwner && (
              <span className="badge-brand text-[10px] gap-1">
                <Crown className="h-3 w-3" />
                مالك النظام
              </span>
            )}
          </h1>
          <p className="text-sm text-slate-500 mt-1 num-latin">{user.email}</p>
        </div>
        <Link href={`/settings/users/${id}`} className="text-sm text-slate-500 hover:text-sky-700 flex items-center gap-1">
          <ArrowRight className="h-4 w-4" />
          العودة لصفحة المستخدم
        </Link>
      </header>

      {(isOwner || isSelf) && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="space-y-0.5">
            {isOwner && <div>هذا حساب مالك النظام — لا يمكن تعطيله أو تغيير حالته.</div>}
            {isSelf && <div>هذا حسابك الشخصي — لا يمكنك تعطيل نفسك من هنا.</div>}
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); setError(null); update.mutate(); }}
        className="bg-white border border-slate-200 rounded-lg p-6 space-y-5"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="الاسم بالعربية">
            <input className="input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />
          </Field>
          <Field label="الاسم بالإنجليزية">
            <input className="input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
          </Field>
          <Field label="الفرع">
            <select className="input" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
              <option value="">— غير محدد (كل الفروع) —</option>
              {branchList.map((b: any) => <option key={b.id} value={b.id}>{b.nameAr} ({b.code})</option>)}
            </select>
          </Field>
          <Field label="الحالة" help={lockStatus ? 'حالة المالك ثابتة' : undefined}>
            <select
              className="input"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              disabled={lockStatus}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.labelAr}</option>
              ))}
            </select>
          </Field>
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium text-slate-700 flex items-center gap-1.5">
            <Shield className="h-4 w-4" />
            الأدوار
          </span>
          {roleList.length === 0 ? (
            <p className="text-sm text-slate-500">لا توجد أدوار متاحة.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {roleList.map((r: any) => (
                <label key={r.id} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.roleIds.includes(r.id)}
                    onChange={() => toggleRole(r.id)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">
                    <span className="font-medium text-slate-900">{r.displayNameAr ?? ROLE_LABELS_AR[r.name] ?? r.name}</span>
                    <span className="block text-[11px] text-slate-500 font-mono num-latin">{r.name}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t">
          {error && <span className="text-sm text-rose-600">{error}</span>}
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Link href={`/settings/users/${id}`} className="btn-ghost">إلغاء</Link>
            <button type="submit" disabled={update.isPending} className="btn-primary">
              <Save className="h-4 w-4" />
              {update.isPending ? 'جاري الحفظ…' : 'حفظ التعديلات'}
            </button>
          </div>
        </div>
      </form>

      {/* Deactivate (soft delete) — hidden for owner and self */}
      {!isOwner && !isSelf && (
        <div className="bg-white border border-rose-200 rounded-lg p-6 space-y-3">
          <h2 className="text-sm font-semibold text-rose-700 flex items-center gap-2">
            <Trash2 className="h-4 w-4" />
            منطقة الخطر
          </h2>
          <p className="text-sm text-slate-600">
            تعطيل المستخدم يمنعه من تسجيل الدخول. الصفوف المرتبطة (قيود محاسبية، حركات مخزون) تبقى كما هي.
          </p>
          {!confirmDelete ? (
            <button type="button" onClick={() => setConfirmDelete(true)} className="btn-ghost text-rose-600 hover:bg-rose-50">
              <Trash2 className="h-4 w-4" />
              تعطيل المستخدم
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-rose-700">هل أنت متأكد؟</span>
              <button
                type="button"
                onClick={() => deactivate.mutate()}
                disabled={deactivate.isPending}
                className="btn-primary bg-rose-600 hover:bg-rose-700"
              >
                {deactivate.isPending ? 'جاري التعطيل…' : 'نعم، عطّل'}
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="btn-ghost">تراجع</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {help && <span className="mt-1 block text-[11px] text-slate-500">{help}</span>}
    </label>
  );
}
