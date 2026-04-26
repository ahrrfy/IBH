'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Shield, Save, ArrowRight, Lock } from 'lucide-react';
import { ROLE_LABELS_AR } from '@/lib/permissions';
import { PermissionMatrix, type PermissionMap } from './permission-matrix';

export default function RoleDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const id = params?.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api<any>('/company/roles'),
  });
  const rows: any[] = Array.isArray(data) ? data : data?.items ?? [];
  const role = rows.find((r) => r.id === id);

  const initial: PermissionMap = useMemo(
    () => (role?.permissions as PermissionMap) ?? {},
    [role?.permissions],
  );
  const [perms, setPerms] = useState<PermissionMap>({});
  const [loaded, setLoaded] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (loaded || !role) return;
    setPerms({ ...initial });
    setLoaded(true);
  }, [role, initial, loaded]);

  const update = useMutation({
    mutationFn: (next: PermissionMap) =>
      api<any>(`/company/roles/${id}/permissions`, {
        method: 'PUT',
        body: { permissions: next },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] });
      router.push('/settings/roles');
    },
    onError: (e: any) => setErrorMsg(e?.message ?? 'فشل حفظ الصلاحيات'),
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

      <PermissionMatrix value={perms} onChange={setPerms} disabled={isSystem} />

      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-4">
        {errorMsg && <span className="text-sm text-rose-600">{errorMsg}</span>}
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Link href="/settings/roles" className="btn-ghost">إلغاء</Link>
          <button
            disabled={isSystem || update.isPending}
            onClick={() => {
              setErrorMsg(null);
              update.mutate(perms);
            }}
            className="btn-primary"
          >
            <Save className="h-4 w-4" />
            {update.isPending ? 'جاري الحفظ…' : 'حفظ الصلاحيات'}
          </button>
        </div>
      </div>
    </div>
  );
}
