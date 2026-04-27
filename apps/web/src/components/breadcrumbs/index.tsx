'use client';

/**
 * Breadcrumbs — derived from the current Next.js path segments.
 *
 * - Home icon always links to /dashboard.
 * - Each segment is rendered with an Arabic label looked up in
 *   {@link PATH_LABELS}. Slugs/ids that aren't in the map are humanized
 *   (replace dashes with spaces, truncate long ids).
 * - The last segment is rendered as plain text (current page).
 * - RTL-friendly: chevrons point left (toward the next segment in
 *   right-to-left reading order).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, Home } from 'lucide-react';

/** Map URL slug → Arabic label. Keep flat — collisions across modules are
 *  rare and any duplication is intentional (same slug, same meaning). */
export const PATH_LABELS: Record<string, string> = {
  // top-level modules
  dashboard: 'الرئيسية',
  sales: 'المبيعات',
  pos: 'نقطة البيع',
  inventory: 'المخزون',
  purchases: 'المشتريات',
  finance: 'المالية',
  assets: 'الأصول الثابتة',
  hr: 'الموارد البشرية',
  'job-orders': 'طلبات التصنيع',
  crm: 'العملاء',
  marketing: 'التسويق',
  reports: 'التقارير',
  settings: 'الإعدادات',
  delivery: 'التوصيل',
  notifications: 'الإشعارات',
  profile: 'الملف الشخصي',

  // sales
  invoices: 'الفواتير',
  orders: 'الطلبات',
  quotations: 'عروض الأسعار',
  customers: 'العملاء',
  returns: 'المرتجعات',
  inbox: 'صندوق الطلبات',
  commissions: 'العمولات',
  plans: 'الخطط',

  // pos
  shifts: 'الورديات',
  receipts: 'الإيصالات',
  sale: 'شاشة البيع',
  close: 'إغلاق',

  // inventory
  products: 'المنتجات',
  categories: 'التصنيفات',
  stock: 'حركات المخزون',
  warehouses: 'المستودعات',
  transfers: 'التحويلات',
  stocktaking: 'الجرد',
  intelligence: 'المخزون الذكي',
  variants: 'المتغيرات',

  // purchases
  grn: 'استلام البضاعة',
  suppliers: 'الموردون',

  // finance
  'journal-entries': 'القيود اليومية',
  'chart-of-accounts': 'دليل الحسابات',
  'trial-balance': 'ميزان المراجعة',
  'income-statement': 'قائمة الدخل',
  'balance-sheet': 'المركز المالي',
  'cash-flow': 'التدفقات النقدية',
  equity: 'حقوق الملكية',
  banks: 'الحسابات البنكية',
  budgets: 'الموازنات',
  periods: 'الفترات المحاسبية',
  kpis: 'مؤشرات الأداء',
  'account-mapping': 'ربط الحسابات',
  reconcile: 'مطابقة',

  // hr
  employees: 'الموظفون',
  payroll: 'الرواتب',
  leaves: 'الإجازات',
  attendance: 'الحضور',
  recruitment: 'التوظيف',
  applications: 'الطلبات',
  postings: 'الإعلانات',
  payslips: 'كشوف الرواتب',
  'check-in': 'تسجيل الدخول',

  // crm
  leads: 'العملاء المحتملون',

  // marketing
  promotions: 'العروض الترويجية',
  campaigns: 'الحملات',

  // delivery
  dispatches: 'الإرساليات',
  companies: 'الشركات',
  zones: 'المناطق',
  settlement: 'تسوية',
  settlements: 'التسويات',

  // settings
  users: 'المستخدمون',
  branches: 'الفروع',
  roles: 'الأدوار',
  audit: 'سجل التدقيق',
  company: 'بيانات الشركة',
  security: 'الأمان',

  // common
  new: 'جديد',
  edit: 'تعديل',
};

/**
 * Best-effort humanization for unknown segments: replace dashes/underscores
 * with spaces, and truncate obvious ULIDs/UUIDs to a short fragment so they
 * don't blow out the breadcrumb width.
 */
export function humanize(segment: string): string {
  // 26-char ULIDs and 36-char UUIDs — show first 6 chars only
  if (/^[0-9a-z]{26}$/i.test(segment) || /^[0-9a-f-]{36}$/i.test(segment)) {
    return segment.slice(0, 6) + '…';
  }
  if (segment.length > 24) return segment.slice(0, 12) + '…';
  return segment.replace(/[-_]+/g, ' ');
}

export function labelFor(segment: string): string {
  return PATH_LABELS[segment] ?? humanize(segment);
}

export function Breadcrumbs() {
  const pathname = usePathname() || '';
  const segments = pathname.split('/').filter(Boolean);

  return (
    <nav
      aria-label="مسار التنقل"
      className="flex items-center gap-1.5 text-sm overflow-hidden"
    >
      <Link
        href="/dashboard"
        className="text-slate-400 hover:text-slate-700"
        aria-label="الرئيسية"
      >
        <Home className="h-3.5 w-3.5" />
      </Link>
      {segments.map((seg, i) => {
        const label = labelFor(seg);
        const isLast = i === segments.length - 1;
        const href = '/' + segments.slice(0, i + 1).join('/');
        return (
          <span key={i} className="flex items-center gap-1.5 whitespace-nowrap">
            <ChevronLeft
              className="h-3 w-3 text-slate-300"
              aria-hidden="true"
            />
            {isLast ? (
              <span
                className="font-semibold text-slate-900"
                aria-current="page"
              >
                {label}
              </span>
            ) : (
              <Link
                href={href}
                className="text-slate-600 hover:text-sky-700"
              >
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
