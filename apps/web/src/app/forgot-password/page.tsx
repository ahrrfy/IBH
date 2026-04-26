/**
 * Forgot Password — placeholder page.
 *
 * Al-Ruya ERP is an internal business system.  There is no self-service
 * email-based password-reset flow because:
 *   1. No email delivery service is configured (by design — no SaaS deps).
 *   2. All users are internal staff; an admin can reset via the Users panel.
 *
 * This page replaces the 404 that /forgot-password used to return, gives the
 * user clear next steps, and links back to login.
 */
import Link from 'next/link';
import { KeyRound, ArrowRight } from 'lucide-react';

export const metadata = { title: 'استعادة كلمة المرور | الرؤية العربية' };

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-slate-50 to-amber-50 p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-700 text-white text-2xl font-bold shadow-lg">
            ر
          </div>
          <h1 className="text-2xl font-bold text-slate-900">الرؤية العربية</h1>
          <p className="mt-1 text-sm text-slate-600">استعادة كلمة المرور</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-50">
              <KeyRound className="h-7 w-7 text-sky-700" />
            </span>
          </div>

          <h2 className="mb-2 text-center text-lg font-semibold text-slate-900">
            لا يمكن إعادة تعيين كلمة المرور ذاتياً
          </h2>
          <p className="mb-6 text-center text-sm text-slate-600 leading-relaxed">
            هذا النظام مخصص للاستخدام الداخلي ولا يحتوي على خدمة بريد إلكتروني لإعادة التعيين.
            يرجى التواصل مع مدير النظام لإعادة تعيين كلمة المرور.
          </p>

          <div className="mb-6 rounded-lg border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-900">
            <p className="mb-1 font-semibold">خطوات استعادة الوصول:</p>
            <ol className="list-decimal pr-5 space-y-1 text-sky-800">
              <li>تواصل مع مدير النظام (System Owner)</li>
              <li>
                اطلب منه فتح لوحة التحكم → الإعدادات → المستخدمون
              </li>
              <li>يختار حسابك → تعديل → كلمة مرور جديدة</li>
              <li>سجّل دخولك بالكلمة الجديدة وغيّرها فوراً</li>
            </ol>
          </div>

          <Link
            href="/login"
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            <ArrowRight className="h-4 w-4 rotate-180" />
            العودة إلى تسجيل الدخول
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} الرؤية العربية · جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  );
}
