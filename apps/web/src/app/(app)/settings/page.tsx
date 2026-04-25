'use client';

import Link from 'next/link';
import {
  Users as UsersIcon, Building2, Shield, KeyRound, Bell, Database,
  Palette, Globe, Receipt, Briefcase, ChevronLeft,
} from 'lucide-react';

const SECTIONS = [
  {
    title: 'إدارة المستخدمين',
    items: [
      { href: '/settings/users',    icon: UsersIcon, label: 'المستخدمون',          desc: 'إدارة حسابات الموظفين' },
      { href: '/settings/roles',    icon: Shield,    label: 'الأدوار والصلاحيات',  desc: 'تعريف ما يمكن لكل دور رؤيته' },
      { href: '/settings/branches', icon: Building2, label: 'الفروع',               desc: 'فروع الشركة وأقسامها' },
    ],
  },
  {
    title: 'الإعدادات العامة',
    items: [
      { href: '/settings/company',      icon: Briefcase, label: 'بيانات الشركة',  desc: 'الاسم، الشعار، الرقم الضريبي' },
      { href: '/settings/notifications', icon: Bell,     label: 'الإشعارات',       desc: 'تفضيلات التنبيهات' },
      { href: '/settings/appearance',    icon: Palette,  label: 'المظهر',           desc: 'الألوان والخطوط' },
      { href: '/settings/locale',        icon: Globe,    label: 'اللغة والمنطقة',  desc: 'التوقيت والعملة' },
    ],
  },
  {
    title: 'النظام',
    items: [
      { href: '/settings/security', icon: KeyRound, label: 'الأمان والخصوصية', desc: '2FA، الجلسات، السجلات' },
      { href: '/settings/backup',   icon: Database, label: 'النسخ الاحتياطي',   desc: 'استعادة + تصدير' },
      { href: '/settings/numbering',icon: Receipt,  label: 'ترقيم المستندات',   desc: 'صيغة أرقام الفواتير والقيود' },
    ],
  },
];

export default function SettingsPage() {
  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">الإعدادات</h1>
        <p className="text-sm text-slate-500 mt-1">تخصيص النظام حسب احتياجات شركتك</p>
      </header>

      {SECTIONS.map((section) => (
        <section key={section.title}>
          <h2 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wide">{section.title}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group bg-white rounded-xl border border-slate-200 p-4 hover:shadow-lifted hover:border-sky-300 transition-all flex items-start gap-3"
                >
                  <div className="h-11 w-11 rounded-lg bg-sky-50 text-sky-700 grid place-items-center shrink-0 group-hover:bg-sky-100 transition">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900">{item.label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{item.desc}</div>
                  </div>
                  <ChevronLeft className="h-4 w-4 text-slate-300 group-hover:text-sky-600 transition" />
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
