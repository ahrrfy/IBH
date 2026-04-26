'use client';

import Link from 'next/link';
import {
  Users as UsersIcon, Building2, Shield, KeyRound, Bell, Database,
  Palette, Globe, Receipt, Briefcase, ChevronLeft,
} from 'lucide-react';

// Sections with `ready: false` are linked but show "قريباً" badge — they'll be
// built in upcoming cycles. Items without `ready` are live now.
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
      { href: '/settings/company',      icon: Briefcase, label: 'بيانات الشركة',  desc: 'الاسم، الشعار، التواصل' },
      { href: '/settings/notifications', icon: Bell,     label: 'الإشعارات',       desc: 'تفضيلات التنبيهات', ready: false },
      { href: '/settings/appearance',    icon: Palette,  label: 'المظهر',           desc: 'الألوان والخطوط', ready: false },
      { href: '/settings/locale',        icon: Globe,    label: 'اللغة والمنطقة',  desc: 'التوقيت والعملة', ready: false },
    ],
  },
  {
    title: 'النظام',
    items: [
      { href: '/settings/security', icon: KeyRound, label: 'الأمان والخصوصية', desc: '2FA، الجلسات، السجلات', ready: false },
      { href: '/settings/backup',   icon: Database, label: 'النسخ الاحتياطي',   desc: 'استعادة + تصدير', ready: false },
      { href: '/settings/numbering',icon: Receipt,  label: 'ترقيم المستندات',   desc: 'صيغة أرقام الفواتير والقيود', ready: false },
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
              const isReady = (item as any).ready !== false;
              const card = (
                <div className={
                  'group bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3 transition-all '
                  + (isReady ? 'hover:shadow-lifted hover:border-sky-300 cursor-pointer' : 'opacity-60 cursor-not-allowed')
                }>
                  <div className={'h-11 w-11 rounded-lg grid place-items-center shrink-0 transition ' + (isReady ? 'bg-sky-50 text-sky-700 group-hover:bg-sky-100' : 'bg-slate-100 text-slate-400')}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 flex items-center gap-2">
                      {item.label}
                      {!isReady && <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">قريباً</span>}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{item.desc}</div>
                  </div>
                  {isReady && <ChevronLeft className="h-4 w-4 text-slate-300 group-hover:text-sky-600 transition" />}
                </div>
              );
              return isReady
                ? <Link key={item.href} href={item.href}>{card}</Link>
                : <div key={item.href}>{card}</div>;
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
