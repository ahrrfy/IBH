'use client';

import {
  Search, ChevronDown, User as UserIcon,
  Settings as SettingsIcon, LogOut,
  Building2,
} from 'lucide-react';
import { NotificationBell } from './notification-bell';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { ROLE_LABELS_AR } from '@/lib/permissions';
import { ConnectionStatus } from './connection-status';
import { Breadcrumbs } from './breadcrumbs';

export function Topbar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

      {/* Breadcrumbs (auto from path) — see components/breadcrumbs */}
      <Breadcrumbs />

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

      <ConnectionStatus />

      {/* Notifications + user menu */}
      <div className="flex items-center gap-1" ref={menuRef}>
        <NotificationBell />

        <div className="relative">
          <button
            onClick={() => { setMenuOpen((v) => !v); }}
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
