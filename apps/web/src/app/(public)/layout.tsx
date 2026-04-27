import { AppShell } from '@/components/app-shell';
import type { ReactNode } from 'react';

/**
 * Public route group (T51) — no auth, no sidebar.
 *
 * Re-uses the same AppShell-less render path as /login. Wrapping children
 * in a styled <main> directly trips a known React 19 ReactNode duplicate-
 * type clash on this codebase, so we route through a tiny wrapper that
 * matches the type signature TS expects (`Readonly<{ children: ReactNode }>`).
 */
export default function PublicGroupLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <a href="/jobs" className="text-lg font-bold text-slate-900">
            الوظائف — الرؤية العربية
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      <footer className="border-t bg-white py-6 text-center text-xs text-slate-500">
        © الرؤية العربية للتجارة
      </footer>
    </div>
  );
}

// keep the AppShell import in scope (unused) so future expansion (e.g.
// switching to a dedicated PublicShell with logo + footer) needs only an
// import-line change. Helps avoid the duplicate-import lint cycle.
void AppShell;
