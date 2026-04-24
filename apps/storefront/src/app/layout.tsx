import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'الرؤية العربية — متجر إلكتروني',
    template: '%s | الرؤية العربية',
  },
  description: 'متجر الرؤية العربية الإلكتروني — تسوّق بأمان في العراق',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://store.al-ruya.iq'),
  openGraph: {
    type: 'website',
    locale: 'ar_IQ',
    siteName: 'الرؤية العربية',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
