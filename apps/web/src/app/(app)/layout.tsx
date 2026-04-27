import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { Shortcuts } from '@/components/shortcuts';

export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      {children}
      {/* Global Cmd/Ctrl+K command palette + keyboard shortcuts (mounted once
          per authenticated session — listens globally for ⌘K, ?, and "g X"). */}
      <Shortcuts />
    </AppShell>
  );
}
