'use client';

/**
 * Activity Bar — VSCode/Win11-style icon-only navigation.
 * 56px wide, dark slate background, role-filtered.
 * Tooltips on hover.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  ShoppingCart, CreditCard, Package, ShoppingBag,
  Landmark, Building2, Users, Hammer,
  Handshake, Megaphone, BarChart3, Settings,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  type ModuleKey,
  getVisibleModulesForRoles,
  MODULE_HREFS,
} from '@/lib/permissions';

const MODULE_ICONS: Record<ModuleKey, React.ElementType> = {
  sales:     ShoppingCart,
  pos:       CreditCard,
  inventory: Package,
  purchases: ShoppingBag,
  finance:   Landmark,
  assets:    Building2,
  hr:        Users,
  jobs:      Hammer,
  crm:       Handshake,
  marketing: Megaphone,
  reports:   BarChart3,
  settings:  Settings,
};

const MODULE_LABELS: Record<ModuleKey, string> = {
  sales:     'المبيعات',
  pos:       'نقطة البيع',
  inventory: 'المخزون',
  purchases: 'المشتريات',
  finance:   'المالية',
  assets:    'الأصول',
  hr:        'الموارد البشرية',
  jobs:      'التصنيع',
  crm:       'العملاء',
  marketing: 'التسويق',
  reports:   'التقارير',
  settings:  'الإعدادات',
};

export function ActivityBar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const roles: string[] = (user as any)?.roles ?? [(user as any)?.role ?? 'super_admin'];
  const modules = getVisibleModulesForRoles(roles);

  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + '/');

  return (
    <aside className="w-14 bg-slate-900 flex flex-col items-center py-2 gap-1 shrink-0">
      {/* Home tile (always visible — launcher) */}
      <Link
        href="/dashboard"
        title="الرئيسية"
        className={`relative h-10 w-10 grid place-items-center rounded-lg transition group
          ${isActive('/dashboard')
            ? 'bg-sky-600 text-white'
            : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
      >
        <Home className="h-5 w-5" />
        {isActive('/dashboard') && <ActiveIndicator />}
        <Tooltip>الرئيسية</Tooltip>
      </Link>

      <div className="h-px w-7 bg-slate-700 my-1" />

      {/* Role-filtered modules */}
      {modules.map((m) => {
        const Icon = MODULE_ICONS[m];
        const href = MODULE_HREFS[m];
        const active = isActive(href);
        return (
          <Link
            key={m}
            href={href}
            title={MODULE_LABELS[m]}
            className={`relative h-10 w-10 grid place-items-center rounded-lg transition group
              ${active
                ? 'bg-sky-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
          >
            <Icon className="h-5 w-5" />
            {active && <ActiveIndicator />}
            <Tooltip>{MODULE_LABELS[m]}</Tooltip>
          </Link>
        );
      })}
    </aside>
  );
}

function ActiveIndicator() {
  return <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-white rounded-l" />;
}

function Tooltip({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute right-full mr-2 px-2 py-1 bg-slate-950 text-white text-xs rounded
                    whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none z-50">
      {children}
    </div>
  );
}
