'use client';

import {
  Bell, Search, ChevronDown, User as UserIcon,
  Settings as SettingsIcon, LogOut, Home, ChevronLeft,
  Building2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { ROLE_LABELS_AR } from '@/lib/permissions';

const PATH_LABELS: Record<string, string> = {
  dashboard: 'الرئيسية',
  sales: 'المبيعات',
  pos: 'نقطة البيع',
  inventory: 'المخزون',
  purchases: 'المشتريات',
  finance: 'المالية',
  assets: 'الأصول الثابتة',
  hr: 'الموارد البشرية',
  'job-orders': 'طلبات التصنيع',
  crm: 'العملاء',
  marketing: 'التسويق',
  reports: 'التقارير',
  settings: 'الإعدادات',
  invoices: 'الفواتير',
  orders: 'الطلبات',
  customers: 'العملاء',
  suppliers: 'الموردون',
  shifts: 'الورديات',
  receipts: 'الإيصالات',
  warehouses: 'المستودعات',
  products: 'المنتجات',
  stock: 'حركات المخزون',
  grn: 'استلام البضاعة',
  employees: 'الموظفون',
  payroll: 'الرواتب',
  leaves: 'الإجازات',
  attendance: 'الحضور',
  leads: 'العملاء المحتملون',
  promotions: 'العروض الترويجية',
  campaigns: 'الحملات',
  'journal-entries': 'القيود اليومية',
  'trial-balance': 'ميزان المراجعة',
  'income-statement': 'قائمة الدخل',
  'balance-sheet': 'المركز المالي',
  'cash-flow': 'التدفقات النقدية',
  banks: 'البنوك',
  new: 'جديد',
};

export function Topbar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || '';
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Build breadcrumb from path
  const segments = pathname.split('/').filter(Boolean);
  const userRoles: string[] = (user as any)?.roles ?? [(user as any)?.role].filter(Boolean);
  // System owner overrides any role label — they're the singleton root user.
  const primaryRoleLabel = (user as any)?.isSystemOwner
    ? 'مالك النظام'
    : (ROLE_LABELS_AR[userRoles[0]] ?? userRoles[0] ?? 'مستخدم');
  const branchName = (user as any)?.branchNameAr ?? (user as any)?.branchName ?? 'بغداد الرئيسي';
  const displayName = (user as any)?.nameAr ?? (user as any)?.name ?? (user as any)?.email?.split('@')[0] ?? 'مستخدم';

  async function handleLogout() {
    await logout();
    setMenuOpen(false);
    router.replace('/login');
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setNotifOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 shrink-0">
      {/* Logo */}
      <Link href="/dashboard" className="flex items-center gap-2 hover:opacity-90">
        <div className="h-9 w-9 rounded-lg bg-sky-700 text-white grid place-items-center font-bold text-lg shadow">
          ر
        </div>
        <div className="leading-tight">
          <div className="text-sm font-bold text-slate-900">الرؤية العربية</div>
          <div className="text-[10px] text-slate-500">ERP</div>
        </div>
      </Link>

      <div className="h-7 w-px bg-slate-200" />

      {/* Breadcrumbs (auto from path) */}
      <nav className="flex items-center gap-1.5 text-sm overflow-hidden">
        <Link href="/dashboard" className="text-slate-400 hover:text-slate-700">
          <Home className="h-3.5 w-3.5" />
        </Link>
        {segments.map((seg, i) => {
          const label = PATH_LABELS[seg] ?? (seg.length > 20 ? seg.slice(0, 12) + '…' : seg);
          const isLast = i === segments.length - 1;
          const href = '/' + segments.slice(0, i + 1).join('/');
          return (
            <span key={i} className="flex items-center gap-1.5 whitespace-nowrap">
              <ChevronLeft className="h-3 w-3 text-slate-300" />
              {isLast ? (
                <span className="font-semibold text-slate-900">{label}</span>
              ) : (
                <Link href={href} className="text-slate-600 hover:text-sky-700">{label}</Link>
              )}
            </span>
          );
        })}
      </nav>

      {/* Search (centered) */}
      <div className="flex-1 max-w-md mx-auto">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            ref={inputRef}
            type="search"
            placeholder="ابحث في النظام..."
            className="h-9 w-full rounded-lg bg-slate-100 border border-transparent pr-10 pl-12 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
          />
          <kbd className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
        </div>
      </div>

      {/* Branch indicator */}
      <div className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded text-xs text-slate-600 bg-slate-50 border border-slate-200">
        <Building2 className="h-3 w-3 text-slate-500" />
        <span className="font-medium">{branchName}</span>
      </div>

      {/* Notifications + user menu */}
      <div className="flex items-center gap-1" ref={menuRef}>
        <div className="relative">
          <button
            onClick={() => { setNotifOpen((v) => !v); setMenuOpen(false); }}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            aria-label="الإشعارات"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute top-2 left-2 h-1.5 w-1.5 rounded-full bg-rose-500" />
          </button>
          {notifOpen && (
            <div className="absolute left-0 mt-2 w-80 rounded-lg border border-slate-200 bg-white shadow-panel">
              <div className="border-b border-slate-200 px-4 py-3 font-semibold text-slate-900">
                الإشعارات
              </div>
              <div className="max-h-80 overflow-y-auto">
                <div className="px-4 py-6 text-center text-sm text-slate-500">
                  لا توجد إشعارات جديدة
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => { setMenuOpen((v) => !v); setNotifOpen(false); }}
            className="flex items-center gap-2 rounded-lg px-2 h-9 hover:bg-slate-100"
          >
            <div className="h-7 w-7 rounded-full bg-sky-700 text-white grid place-items-center text-xs font-bold">
              {displayName.slice(0, 1)}
            </div>
            <div className="text-start leading-tight hidden lg:block">
              <div className="text-xs font-semibold text-slate-900 max-w-[100px] truncate">{displayName}</div>
              <div className="text-[10px] text-slate-500 max-w-[100px] truncate">{primaryRoleLabel}</div>
            </div>
            <ChevronDown className="h-3 w-3 text-slate-500" />
          </button>
          {menuOpen && (
            <div className="absolute left-0 mt-2 w-64 rounded-lg border border-slate-200 bg-white shadow-panel overflow-hidden">
              {/* User card */}
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-sky-700 text-white grid place-items-center text-sm font-bold">
                  {displayName.slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-900 truncate">{displayName}</div>
                  <div className="text-xs text-slate-500 truncate">{user?.email || ''}</div>
                  <div className="text-[10px] text-sky-700 mt-0.5 font-medium">{primaryRoleLabel}</div>
                </div>
              </div>
              <Link
                href="/profile"
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => setMenuOpen(false)}
              >
                <UserIcon className="h-4 w-4 text-slate-500" /> الملف الشخصي
              </Link>
              <Link
                href="/settings"
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => setMenuOpen(false)}
              >
                <SettingsIcon className="h-4 w-4 text-slate-500" /> الإعدادات
              </Link>
              <div className="my-1 h-px bg-slate-200" />
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50"
              >
                <LogOut className="h-4 w-4" /> تسجيل الخروج
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
