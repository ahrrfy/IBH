/**
 * Super Admin route group layout (T63).
 *
 * Reuses the AppShell from the regular (app) group so navigation/topbar are
 * identical. The route prefix `/super-admin/...` is added to PROTECTED_PREFIXES
 * in middleware.ts so unauthenticated visits are redirected to /login.
 *
 * Backend RBAC (RbacGuard.loadCache short-circuit on `super_admin` role) is
 * the authoritative gate — these pages will simply receive 403 from the API
 * for non-super-admins, which the global error handler surfaces.
 */
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
