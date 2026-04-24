import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Al-Ruya ERP · لوحة الإدارة',
  description: 'نظام تخطيط موارد الرؤية العربية',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen bg-slate-50 font-sans antialiased">{children}</body>
    </html>
  );
}
