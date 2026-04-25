import type { Metadata } from 'next';
import { Cairo } from 'next/font/google';
import './globals.css';

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-arabic',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'الرؤية العربية ERP',
  description: 'نظام تخطيط موارد المؤسسة — الرؤية العربية للتجارة',
  applicationName: 'Al-Ruya ERP',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body className="min-h-screen bg-surface-subtle text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
