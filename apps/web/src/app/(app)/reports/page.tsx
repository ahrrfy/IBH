'use client';
import Link from 'next/link';
import {
  BarChart3, TrendingUp, Package, Users, Wallet,
  ShoppingCart, Calendar, FileText, AlertCircle,
} from 'lucide-react';

const REPORTS = [
  { slug: 'sales-summary',          nameAr: 'ملخص المبيعات',       icon: ShoppingCart, color: 'bg-sky-100 text-sky-800' },
  { slug: 'sales-by-product',       nameAr: 'المبيعات حسب المنتج',  icon: Package,      color: 'bg-emerald-100 text-emerald-800' },
  { slug: 'sales-by-customer',      nameAr: 'المبيعات حسب العميل',  icon: Users,        color: 'bg-amber-100 text-amber-800' },
  { slug: 'sales-by-cashier',       nameAr: 'المبيعات حسب الكاشير', icon: Users,        color: 'bg-purple-100 text-purple-800' },
  { slug: 'sales-by-payment',       nameAr: 'المبيعات حسب الدفع',   icon: Wallet,       color: 'bg-rose-100 text-rose-800' },
  { slug: 'top-products',           nameAr: 'أفضل المنتجات',         icon: TrendingUp,   color: 'bg-indigo-100 text-indigo-800' },
  { slug: 'slow-moving',            nameAr: 'المنتجات الراكدة',     icon: AlertCircle,  color: 'bg-orange-100 text-orange-800' },
  { slug: 'low-stock',              nameAr: 'نقص المخزون',           icon: AlertCircle,  color: 'bg-rose-100 text-rose-800' },
  { slug: 'stock-valuation',        nameAr: 'تقييم المخزون',         icon: Package,      color: 'bg-teal-100 text-teal-800' },
  { slug: 'ar-aging',               nameAr: 'تقادم الذمم المدينة',   icon: FileText,     color: 'bg-yellow-100 text-yellow-800' },
  { slug: 'ap-aging',               nameAr: 'تقادم الذمم الدائنة',   icon: FileText,     color: 'bg-lime-100 text-lime-800' },
  { slug: 'customer-ltv',           nameAr: 'قيمة العميل مدى الحياة', icon: Users,       color: 'bg-pink-100 text-pink-800' },
  { slug: 'gift-profit',            nameAr: 'هامش ربح الهدايا',      icon: TrendingUp,   color: 'bg-violet-100 text-violet-800' },
  { slug: 'cash-movement',          nameAr: 'حركة الصندوق',          icon: Wallet,       color: 'bg-cyan-100 text-cyan-800' },
  { slug: 'shift-variance',         nameAr: 'فروقات الورديات',       icon: Calendar,     color: 'bg-sky-100 text-sky-800' },
  { slug: 'discount-impact',        nameAr: 'أثر الخصومات',          icon: BarChart3,    color: 'bg-fuchsia-100 text-fuchsia-800' },
  { slug: 'returns-analysis',       nameAr: 'تحليل المرتجعات',       icon: AlertCircle,  color: 'bg-red-100 text-red-800' },
];

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">التقارير</h1>
        <p className="text-sm text-slate-500 mt-1">{REPORTS.length} تقرير جاهز — انقر للعرض</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          return (
            <Link
              key={r.slug}
              href={`/reports/${r.slug}`}
              className={`${r.color} rounded-xl p-5 shadow-sm hover:shadow-md transition flex items-start gap-3`}
            >
              <Icon className="h-6 w-6 shrink-0" />
              <div className="font-semibold">{r.nameAr}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
