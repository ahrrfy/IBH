'use client';

/**
 * Shortcuts — global command palette + keyboard shortcuts.
 *
 * Triggers:
 *   - Ctrl/Cmd + K  → open palette
 *   - ?             → open shortcuts cheat-sheet (palette in "help" tab)
 *   - g h           → go to /dashboard
 *   - g s           → go to /sales/invoices
 *   - g p           → go to /pos/shifts
 *   - g i           → go to /inventory/stock
 *   - g f           → go to /finance/journal-entries
 *   - g r           → go to /reports
 *   - Esc           → close palette
 *
 * The palette lists every module/section visible to the current user
 * (derived from {@link MODULE_SECTIONS} + RBAC). Typing filters by
 * Arabic label or by the URL path.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, ArrowRight, Command, Keyboard } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  type ModuleKey,
  getVisibleModulesForRoles,
  MODULE_SECTIONS,
} from '@/lib/permissions';

type Tab = 'commands' | 'help';

type Command = {
  href: string;
  label: string;
  module: string;
};

const SHORTCUT_ROUTES: Record<string, string> = {
  h: '/dashboard',
  s: '/sales/invoices',
  p: '/pos/shifts',
  i: '/inventory/stock',
  f: '/finance/journal-entries',
  r: '/reports',
  d: '/delivery',
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

export function Shortcuts() {
  const router = useRouter();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('commands');
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastG = useRef<number>(0);

  const roles: string[] = (user as any)?.roles ?? [(user as any)?.role].filter(Boolean);
  const modules = useMemo(
    () => getVisibleModulesForRoles(roles.length ? roles : ['super_admin']),
    [roles.join(',')],
  );

  const commands: Command[] = useMemo(() => {
    const out: Command[] = [];
    for (const m of modules) {
      const sections = MODULE_SECTIONS[m] ?? [];
      for (const s of sections) {
        out.push({ href: s.href, label: s.label, module: MODULE_LABELS[m] });
      }
    }
    return out;
  }, [modules]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.href.toLowerCase().includes(q) ||
        c.module.toLowerCase().includes(q),
    );
  }, [commands, query]);

  // Reset active index when query/results change
  useEffect(() => {
    setActiveIdx(0);
  }, [query, tab]);

  // Focus input when opened
  useEffect(() => {
    if (open && tab === 'commands') {
      // microtask to ensure the input is mounted
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, tab]);

  // Global key handlers (open / shortcuts / "g X" jumps)
  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.isContentEditable
      );
    }

    function onKey(e: KeyboardEvent) {
      // Cmd/Ctrl + K → toggle palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setTab('commands');
        setOpen((o) => !o);
        return;
      }

      // ? → shortcuts cheat-sheet (only when not typing in a field)
      if (e.key === '?' && !isTypingTarget(e.target)) {
        e.preventDefault();
        setTab('help');
        setOpen(true);
        return;
      }

      // Esc → close
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
        return;
      }

      // "g X" two-key sequence (only when not typing in a field and palette closed)
      if (open || isTypingTarget(e.target)) return;
      if (e.key.toLowerCase() === 'g') {
        lastG.current = Date.now();
        return;
      }
      if (Date.now() - lastG.current < 1200) {
        const target = SHORTCUT_ROUTES[e.key.toLowerCase()];
        if (target) {
          e.preventDefault();
          lastG.current = 0;
          router.push(target);
        }
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, router]);

  if (!open) return null;

  function go(href: string) {
    setOpen(false);
    setQuery('');
    router.push(href);
  }

  function onListKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const cmd = filtered[activeIdx];
      if (cmd) {
        e.preventDefault();
        go(cmd.href);
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-slate-900/40"
      role="dialog"
      aria-modal="true"
      aria-label="لوحة الأوامر"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        dir="rtl"
        className="w-full max-w-xl rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
      >
        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50">
          <button
            onClick={() => setTab('commands')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm transition
              ${tab === 'commands'
                ? 'bg-white text-sky-700 font-semibold border-b-2 border-sky-600'
                : 'text-slate-600 hover:text-slate-900'}`}
            aria-selected={tab === 'commands'}
            role="tab"
          >
            <Command className="h-4 w-4" /> الأوامر
          </button>
          <button
            onClick={() => setTab('help')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm transition
              ${tab === 'help'
                ? 'bg-white text-sky-700 font-semibold border-b-2 border-sky-600'
                : 'text-slate-600 hover:text-slate-900'}`}
            aria-selected={tab === 'help'}
            role="tab"
          >
            <Keyboard className="h-4 w-4" /> الاختصارات
          </button>
        </div>

        {tab === 'commands' && (
          <>
            <div className="flex items-center gap-2 px-4 border-b border-slate-200">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onListKey}
                placeholder="ابحث عن صفحة أو شاشة…"
                className="flex-1 h-12 bg-transparent text-sm placeholder:text-slate-400 focus:outline-none"
                aria-label="ابحث عن أمر"
              />
              <kbd className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">Esc</kbd>
            </div>
            <ul className="max-h-80 overflow-y-auto py-2" role="listbox">
              {filtered.length === 0 ? (
                <li className="px-4 py-6 text-sm text-slate-500 text-center">
                  لا توجد نتائج
                </li>
              ) : (
                filtered.map((c, i) => (
                  <li key={c.href} role="option" aria-selected={i === activeIdx}>
                    <button
                      onClick={() => go(c.href)}
                      onMouseEnter={() => setActiveIdx(i)}
                      className={`w-full flex items-center justify-between gap-3 px-4 py-2 text-sm transition
                        ${i === activeIdx
                          ? 'bg-sky-50 text-sky-800'
                          : 'text-slate-700 hover:bg-slate-50'}`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <ArrowRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{c.label}</span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-slate-400 font-mono">{c.href}</span>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                          {c.module}
                        </span>
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </>
        )}

        {tab === 'help' && (
          <div className="p-5 space-y-3 text-sm" role="tabpanel">
            <div className="text-slate-700 font-semibold">اختصارات لوحة المفاتيح</div>
            <ul className="space-y-2">
              <ShortcutRow keys={['Ctrl', 'K']} label="فتح/إغلاق لوحة الأوامر" />
              <ShortcutRow keys={['?']} label="عرض الاختصارات" />
              <ShortcutRow keys={['Esc']} label="إغلاق" />
              <ShortcutRow keys={['G', 'H']} label="انتقل للرئيسية" />
              <ShortcutRow keys={['G', 'S']} label="انتقل للمبيعات" />
              <ShortcutRow keys={['G', 'P']} label="انتقل لنقطة البيع" />
              <ShortcutRow keys={['G', 'I']} label="انتقل للمخزون" />
              <ShortcutRow keys={['G', 'F']} label="انتقل للمالية" />
              <ShortcutRow keys={['G', 'D']} label="انتقل للتوصيل" />
              <ShortcutRow keys={['G', 'R']} label="انتقل للتقارير" />
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-slate-700">{label}</span>
      <span className="flex items-center gap-1">
        {keys.map((k, i) => (
          <kbd
            key={i}
            className="text-[11px] bg-slate-100 border border-slate-200 text-slate-700 px-2 py-0.5 rounded font-mono"
          >
            {k}
          </kbd>
        ))}
      </span>
    </li>
  );
}

/**
 * Lightweight trigger button intended for the topbar — also serves as a
 * visual hint that ⌘K is available. Pure presentational; the global key
 * listener inside <Shortcuts /> handles the actual open/close.
 */
export function ShortcutsButton() {
  function open() {
    // Synthesize the keyboard event so the global listener handles it.
    const evt = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
    });
    window.dispatchEvent(evt);
  }
  return (
    <button
      type="button"
      onClick={open}
      aria-label="فتح لوحة الأوامر"
      className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
    >
      <Search className="h-3 w-3" />
      <span>أوامر</span>
      <kbd className="font-mono text-[10px] bg-slate-100 px-1 rounded">⌘K</kbd>
    </button>
  );
}
