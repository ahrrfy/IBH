'use client';

import { Bell, Search, ChevronDown, User as UserIcon, Settings as SettingsIcon, LogOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';

export function Topbar() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-slate-200 bg-white px-6">
      <div className="relative flex-1 max-w-xl">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          type="search"
          placeholder="بحث سريع… (Ctrl + K)"
          className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pr-10 pl-3 text-sm outline-none focus:border-sky-500 focus:bg-white"
        />
      </div>

      <div className="flex items-center gap-2" ref={menuRef}>
        <div className="relative">
          <button
            onClick={() => { setNotifOpen((v) => !v); setMenuOpen(false); }}
            className="relative flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            aria-label="الإشعارات"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute top-2 left-2 h-2 w-2 rounded-full bg-amber-500" />
          </button>
          {notifOpen && (
            <div className="absolute left-0 mt-2 w-80 rounded-lg border border-slate-200 bg-white shadow-lg">
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
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-700 text-white text-sm font-bold">
              {(user?.name || 'م').slice(0, 1)}
            </div>
            <span className="text-sm font-medium text-slate-800">{user?.name || 'مستخدم'}</span>
            <ChevronDown className="h-4 w-4 text-slate-500" />
          </button>
          {menuOpen && (
            <div className="absolute left-0 mt-2 w-56 rounded-lg border border-slate-200 bg-white shadow-lg">
              <Link
                href="/profile"
                className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => setMenuOpen(false)}
              >
                <UserIcon className="h-4 w-4" /> الملف الشخصي
              </Link>
              <Link
                href="/settings"
                className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => setMenuOpen(false)}
              >
                <SettingsIcon className="h-4 w-4" /> الإعدادات
              </Link>
              <div className="my-1 h-px bg-slate-200" />
              <button
                onClick={() => logout()}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
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
