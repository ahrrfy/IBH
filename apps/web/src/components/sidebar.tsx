'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingCart,
  CreditCard,
  Package,
  ShoppingBag,
  Hammer,
  Landmark,
  Building2,
  Users,
  Handshake,
  BarChart3,
  Settings,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';

const NAV = [
  { href: '/dashboard',              label: 'الرئيسية',    icon: LayoutDashboard },
  { href: '/sales/invoices',         label: 'المبيعات',    icon: ShoppingCart },
  { href: '/pos/shifts',             label: 'نقطة البيع',  icon: CreditCard },
  { href: '/inventory/stock',        label: 'المخزون',     icon: Package },
  { href: '/purchases/orders',       label: 'المشتريات',   icon: ShoppingBag },
  { href: '/job-orders',             label: 'طلبات التصنيع', icon: Hammer },
  { href: '/finance/journal-entries',label: 'المالية',     icon: Landmark },
  { href: '/assets',                 label: 'الأصول الثابتة', icon: Building2 },
  { href: '/hr/employees',           label: 'الموارد البشرية', icon: Users },
  { href: '/crm/leads',              label: 'العملاء',     icon: Handshake },
  { href: '/reports',                label: 'التقارير',    icon: BarChart3 },
  { href: '/settings',               label: 'الإعدادات',   icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="fixed inset-y-0 right-0 z-30 flex w-64 flex-col border-l border-slate-200 bg-white">
      <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-700 text-white font-bold">
          ر
        </div>
        <div>
          <div className="text-sm font-bold text-slate-900">الرؤية العربية</div>
          <div className="text-xs text-slate-500">ERP</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={[
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
                    active
                      ? 'bg-sky-50 text-sky-800 font-semibold'
                      : 'text-slate-700 hover:bg-slate-100',
                  ].join(' ')}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-slate-200 p-3">
        <div className="mb-2 flex items-center gap-3 rounded-lg bg-slate-50 p-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-700 text-white text-sm font-bold">
            {(user?.name || 'م').slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-900">
              {user?.name || 'مستخدم'}
            </div>
            <div className="truncate text-xs text-slate-500">{user?.email || ''}</div>
          </div>
        </div>
        <button
          onClick={() => logout()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <LogOut className="h-4 w-4" />
          تسجيل الخروج
        </button>
      </div>
    </aside>
  );
}
