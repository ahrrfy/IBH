'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, CreditCard, FileText, Plus, Users,
} from 'lucide-react';

const SCREENS = [
  { href: '/preview/v2/home',      label: '🏠 الرئيسية',   icon: Home,       desc: 'App Launcher' },
  { href: '/preview/v2',           label: 'لوحة التحكم',  icon: Home,       desc: 'Dashboard' },
  { href: '/preview/v2/pos',       label: 'نقطة البيع',   icon: CreditCard, desc: 'POS Cashier' },
  { href: '/preview/v2/invoices',  label: 'قائمة الفواتير', icon: FileText,  desc: 'List view' },
  { href: '/preview/v2/invoice-new',label: 'فاتورة جديدة',  icon: Plus,      desc: 'Form view' },
  { href: '/preview/v2/customer',  label: 'تفاصيل عميل',   icon: Users,     desc: 'Detail view' },
];

export default function PreviewV2Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-100" dir="rtl">
      {/* Sticky preview navigator */}
      <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 flex items-center gap-2 sticky top-0 z-50 shadow-sm">
        <span className="text-xs font-semibold text-amber-900 ml-2">
          🎨 معاينة التصميم — انتقل بين أنواع الشاشات:
        </span>
        <div className="flex items-center gap-1 flex-wrap">
          {SCREENS.map((s) => {
            const Icon = s.icon;
            const active = pathname === s.href;
            return (
              <Link
                key={s.href}
                href={s.href}
                className={`flex items-center gap-1.5 h-7 px-2.5 rounded text-xs transition
                  ${active
                    ? 'bg-sky-600 text-white font-semibold'
                    : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'}`}
              >
                <Icon className="h-3 w-3" />
                <span>{s.label}</span>
              </Link>
            );
          })}
        </div>
        <div className="flex-1" />
        <a
          href="/login"
          className="h-7 px-3 rounded text-xs bg-emerald-600 text-white hover:bg-emerald-700 font-semibold"
        >
          الدخول للنظام الفعلي ←
        </a>
      </div>
      {children}
    </div>
  );
}
