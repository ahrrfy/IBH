import type { ReactNode } from 'react';

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-slate-50 to-amber-50">
      <div className="flex min-h-screen items-center justify-center p-6">{children}</div>
    </div>
  );
}
