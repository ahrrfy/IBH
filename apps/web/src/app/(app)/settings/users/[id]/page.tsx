'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/format';
import { ROLE_LABELS_AR } from '@/lib/permissions';
import { ArrowRight, Edit, Mail, Shield, User as UserIcon, Building2, Calendar, Crown } from 'lucide-react';

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const { data: user, isLoading, error } = useQuery({
    queryKey: ['user', id],
    queryFn: () => api<any>(`/users/${id}`),
    enabled: !!id,
  });

  if (isLoading) {
    return <div className="p-6 text-sm text-slate-500">جاري التحميل…</div>;
  }
  if (error || !user) {
    return (
      <div className="p-6 max-w-2xl">
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          تعذَّر تحميل المستخدم. قد يكون محذوفاً أو ليس لديك صلاحية.
        </div>
        <Link href="/settings/users" className="mt-3 inline-flex items-center gap-1 text-sm text-sky-700 hover:underline">
          <ArrowRight className="h-4 w-4" />
          العودة لقائمة المستخدمين
        </Link>
      </div>
    );
  }

  const roles: { id: string; name: string; displayNameAr?: string }[] =
    user.userRoles?.map((ur: any) => ur.role) ?? [];

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-sky-700 text-white grid place-items-center text-lg font-bold">
            {(user.nameAr || user.email || 'م').slice(0, 1)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              {user.nameAr ?? user.email}
              {user.isSystemOwner && (
                <span className="badge-brand text-[10px] gap-1">
                  <Crown className="h-3 w-3" />
                  مالك النظام
                </span>
              )}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5 num-latin">{user.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/settings/users" className="text-sm text-slate-500 hover:text-sky-700 flex items-center gap-1">
            <ArrowRight className="h-4 w-4" />
            القائمة
          </Link>
          <Link href={`/settings/users/${id}/edit`} className="btn-primary btn-sm">
            <Edit className="h-3.5 w-3.5" />
            تعديل
          </Link>
        </div>
      </header>

      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">المعلومات الأساسية</h2>
        <Row icon={<UserIcon className="h-4 w-4" />} label="الاسم بالعربية" value={user.nameAr ?? '—'} />
        <Row icon={<UserIcon className="h-4 w-4" />} label="الاسم بالإنجليزية" value={user.nameEn ?? '—'} />
        <Row icon={<Mail className="h-4 w-4" />} label="البريد الإلكتروني" value={<span className="num-latin">{user.email}</span>} />
        {user.username && (
          <Row icon={<UserIcon className="h-4 w-4" />} label="اسم المستخدم" value={<span className="num-latin font-mono text-xs">{user.username}</span>} />
        )}
        <Row
          icon={<Building2 className="h-4 w-4" />}
          label="الفرع"
          value={user.branch?.nameAr ?? user.branchName ?? '— كل الفروع —'}
        />
        <Row
          icon={null}
          label="الحالة"
          value={<StatusBadge status={user.status ?? 'active'} />}
        />
        <Row
          icon={<Calendar className="h-4 w-4" />}
          label="تاريخ الإنشاء"
          value={<span className="num-latin font-mono text-xs">{formatDate(user.createdAt)}</span>}
        />
        {user.lastLoginAt && (
          <Row
            icon={<Calendar className="h-4 w-4" />}
            label="آخر تسجيل دخول"
            value={<span className="num-latin font-mono text-xs">{formatDate(user.lastLoginAt)}</span>}
          />
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-2">
          <Shield className="h-4 w-4" />
          الأدوار
        </h2>
        {roles.length === 0 ? (
          <p className="text-sm text-slate-500">لا توجد أدوار معيّنة لهذا المستخدم.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {roles.map((r) => (
              <span key={r.id} className="badge-brand text-xs gap-1">
                <Shield className="h-3 w-3" />
                {r.displayNameAr ?? ROLE_LABELS_AR[r.name] ?? r.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="w-32 shrink-0 text-slate-500 flex items-center gap-1.5 pt-0.5">
        {icon}
        {label}
      </span>
      <span className="text-slate-900 font-medium">{value}</span>
    </div>
  );
}
