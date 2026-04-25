'use client';

import { useAuth } from '@/lib/auth';
import { ROLE_LABELS_AR } from '@/lib/permissions';
import { User, Mail, Building2, Shield, Calendar, Edit } from 'lucide-react';

export default function ProfilePage() {
  const { user } = useAuth();
  const userRoles: string[] = (user as any)?.roles ?? [(user as any)?.role ?? ''].filter(Boolean);
  const branchName = (user as any)?.branchName ?? '—';

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      {/* Hero */}
      <div className="bg-gradient-to-l from-sky-700 to-sky-600 text-white rounded-2xl p-6 shadow-panel flex items-start gap-5">
        <div className="h-20 w-20 rounded-2xl bg-white/15 backdrop-blur grid place-items-center text-4xl font-bold shadow-lifted ring-4 ring-white/20">
          {(user?.name || 'م').slice(0, 1)}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{user?.name || 'مستخدم'}</h1>
          <div className="text-sm text-sky-100 mt-1">{user?.email}</div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {userRoles.map((r) => (
              <span key={r} className="badge bg-white/15 text-white border border-white/20 backdrop-blur">
                <Shield className="h-3 w-3" />
                {ROLE_LABELS_AR[r] ?? r}
              </span>
            ))}
          </div>
        </div>
        <button className="btn btn-sm bg-white/15 text-white border border-white/20 hover:bg-white/25 backdrop-blur">
          <Edit className="h-3.5 w-3.5" />
          تعديل
        </button>
      </div>

      {/* Info cards */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Card title="المعلومات الأساسية">
          <Row icon={User}     label="الاسم"   value={user?.name} />
          <Row icon={Mail}     label="البريد"  value={user?.email} mono />
          <Row icon={Building2}label="الفرع"   value={branchName} />
        </Card>
        <Card title="صلاحياتك">
          <div className="text-xs text-slate-600 mb-2">
            دورك يمنحك الوصول إلى الوحدات التالية:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {userRoles.length === 0
              ? <span className="text-slate-500 text-sm">لا توجد أدوار</span>
              : userRoles.map((r) => (
                  <span key={r} className="badge-brand text-xs">{ROLE_LABELS_AR[r] ?? r}</span>
                ))
            }
          </div>
        </Card>
      </div>

      {/* Security */}
      <Card title="الأمان">
        <a href="/profile/change-password" className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 rounded text-sm">
          <span className="text-slate-700">تغيير كلمة المرور</span>
          <span className="text-xs text-sky-700">تعديل ←</span>
        </a>
        <a href="/profile/security" className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 rounded text-sm">
          <span className="text-slate-700 flex items-center gap-1.5">
            المصادقة الثنائية (2FA)
            <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 rounded">Google Authenticator</span>
          </span>
          <span className={`text-xs ${(user as any)?.requires2FA ? 'text-emerald-700' : 'text-rose-600'}`}>
            {(user as any)?.requires2FA ? 'مفعّل ✓' : 'غير مفعّل'}
          </span>
        </a>
        <a href="/profile/sessions" className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 rounded text-sm">
          <span className="text-slate-700">الجلسات النشطة</span>
          <span className="text-xs text-sky-700">عرض ←</span>
        </a>
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({ icon: Icon, label, value, mono }: { icon: any; label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-slate-400 mt-0.5" />
      <div className="flex-1">
        <div className="text-xs text-slate-500">{label}</div>
        <div className={`text-sm text-slate-900 ${mono ? 'font-mono num-latin' : ''}`}>{value ?? '—'}</div>
      </div>
    </div>
  );
}
