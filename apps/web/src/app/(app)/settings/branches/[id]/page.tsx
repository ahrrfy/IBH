'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/format';
import { Building2, ArrowRight, Pencil, Phone, MapPin, Clock } from 'lucide-react';

export default function BranchDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api<any>('/company/branches'),
  });

  const rows: any[] = Array.isArray(data) ? data : data?.items ?? [];
  const branch = rows.find((b) => b.id === id);

  if (isLoading) {
    return <div className="p-6 text-sm text-slate-500">جاري التحميل…</div>;
  }
  if (error || !branch) {
    return (
      <div className="p-6 space-y-4">
        <p className="text-sm text-rose-600">{error ? 'تعذَّر تحميل بيانات الفرع' : 'الفرع غير موجود'}</p>
        <Link href="/settings/branches" className="btn-ghost btn-sm inline-flex">
          <ArrowRight className="h-4 w-4" />
          العودة للقائمة
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="h-6 w-6 text-sky-700" />
            {branch.nameAr}
            {branch.isMainBranch && <span className="badge-brand text-[10px]">رئيسي</span>}
            <StatusBadge status={branch.isActive ? 'active' : 'inactive'} />
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            <span className="font-mono num-latin">{branch.code}</span>
            {branch.nameEn && <> · {branch.nameEn}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/settings/branches" className="btn-ghost btn-sm">
            <ArrowRight className="h-4 w-4" />
            رجوع
          </Link>
          <button
            onClick={() => router.push(`/settings/branches/${id}/edit`)}
            className="btn-primary btn-sm"
          >
            <Pencil className="h-3.5 w-3.5" />
            تعديل
          </button>
        </div>
      </header>

      <div className="bg-white border border-slate-200 rounded-lg p-6 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
        <Info label="الكود" value={<span className="font-mono num-latin">{branch.code}</span>} />
        <Info label="المدينة" value={branch.city ?? '—'} />
        <Info
          label="الهاتف"
          value={
            branch.phone ? (
              <span className="num-latin inline-flex items-center gap-1.5" dir="ltr">
                <Phone className="h-3.5 w-3.5 text-slate-400" />
                {branch.phone}
              </span>
            ) : (
              '—'
            )
          }
        />
        <Info
          label="ساعات العمل"
          value={
            branch.workingHoursStart ? (
              <span className="num-latin inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                {branch.workingHoursStart} – {branch.workingHoursEnd ?? '—'}
              </span>
            ) : (
              '—'
            )
          }
        />
        <Info
          label="العنوان"
          fullWidth
          value={
            branch.address ? (
              <span className="inline-flex items-start gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                <span>{branch.address}</span>
              </span>
            ) : (
              '—'
            )
          }
        />
        <Info label="تاريخ الإنشاء" value={<span className="num-latin font-mono text-xs">{formatDate(branch.createdAt)}</span>} />
        <Info label="آخر تعديل" value={<span className="num-latin font-mono text-xs">{formatDate(branch.updatedAt)}</span>} />
      </div>
    </div>
  );
}

function Info({ label, value, fullWidth }: { label: string; value: React.ReactNode; fullWidth?: boolean }) {
  return (
    <div className={fullWidth ? 'md:col-span-2' : ''}>
      <div className="text-[11px] font-medium text-slate-500 mb-1">{label}</div>
      <div className="text-sm text-slate-900">{value}</div>
    </div>
  );
}
