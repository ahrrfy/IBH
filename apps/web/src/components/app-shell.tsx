'use client';

import { type ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { QueryProvider } from '@/lib/react-query';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <div className="min-h-screen bg-slate-50">
        <Sidebar />
        <div className="mr-64 flex min-h-screen flex-col">
          <Topbar />
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </QueryProvider>
  );
}
