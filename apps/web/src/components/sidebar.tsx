'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  Megaphone,
  BarChart3,
  Settings,
  LogOut,
  Truck,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  type ModuleKey,
  getVisibleModulesForRoles,
  MODULE_HREFS,
} from '@/lib/permissions';

/**
 * Sidebar — legacy single-pane navigation, kept as a fallback for any layout
 * that still imports it. The active app shell uses ActivityBar + SubSidebar
 * for nested navigation; this component now derives its menu from the same
 * RBAC source of truth so a user only ever sees modules they can access (F1).
 */
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
  delivery:  Truck,
};

const MODULE_LABELS: Record<ModuleKey, string> = {
  sales:     'المبيعات',
  pos:       'نقطة البيع',
  inventory: 'المخزون',
  purchases: 'المشتريات',
  finance:   'المالية',
  assets:    'الأصول الثابتة',
  hr:        'الموارد البشرية',
  jobs:      'طلبات التصنيع',
  crm:       'العملاء',
  marketing: 'التسويق',
  reports:   'التقارير',
  settings:  'الإعدادات',
  delivery:  'التوصيل',
};

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const isOwner = Boolean((user as any)?.isSystemOwner);
  const roles: string[] = (user as any)?.roles ?? [(user as any)?.role].filter(Boolean);
  const modules = getVisibleModulesForRoles(roles.length ? roles : ['super_admin']);
  const NAV: { href: string; label: string; icon: React.ElementType }[] = [
    { href: '/dashboard', label: 'الرئيسية', icon: LayoutDashboard },
    ...modules.map((m) => ({
      href: MODULE_HREFS[m],
      label: MODULE_LABELS[m],
      icon: MODULE_ICONS[m],
    })),
  ];
  const displayName = (user as any)?.nameAr ?? (user as any)?.name ?? (user as any)?.email?.split('@')[0] ?? 'مستخدم';
  const roleLabel = isOwner ? 'مالك النظام' : null;
  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

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
        <Link
          href="/profile"
          className="mb-2 flex items-center gap-3 rounded-lg bg-slate-50 p-2 transition hover:bg-slate-100"
          aria-label="الملف الشخصي"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-700 text-white text-sm font-bold">
            {displayName.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-900">
              {displayName}
            </div>
            <div className="truncate text-xs text-slate-500">
              {roleLabel ?? user?.email ?? ''}
            </div>
          </div>
        </Link>
        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <LogOut className="h-4 w-4" />
          تسجيل الخروج
        </button>
      </div>
    </aside>
  );
}
