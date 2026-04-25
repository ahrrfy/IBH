'use client';

import { type ReactNode } from 'react';
import { Topbar } from './topbar';
import { ActivityBar } from './activity-bar';
import { SubSidebar } from './sub-sidebar';
import { QueryProvider } from '@/lib/react-query';

/**
 * AppShell — main authenticated layout.
 *
 *  ┌──────── Topbar (logo · breadcrumbs · search · branch · user) ────────┐
 *  ├──┬────────┬──────────────────────────────────────────────────────────┤
 *  │  │  Sub   │                                                          │
 *  │AB│ sidebar│                  MAIN CONTENT                            │
 *  │  │ (224px)│                                                          │
 *  │  │        │                                                          │
 *  └──┴────────┴──────────────────────────────────────────────────────────┘
 *  AB = Activity Bar (56px, dark, role-filtered icons)
 *  Sub-sidebar shows module sections; hidden on /dashboard.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <div className="h-screen flex flex-col bg-slate-50 overflow-hidden" dir="rtl">
        <Topbar />
        <div className="flex-1 flex overflow-hidden">
          <ActivityBar />
          <SubSidebar />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </QueryProvider>
  );
}
