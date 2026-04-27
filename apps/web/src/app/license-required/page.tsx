import Link from 'next/link';

/**
 * T66 — License Required page. Shown when the company's licensing
 * snapshot has a non-entitled status (`expired`, `suspended`,
 * `cancelled`, or no snapshot at all). The middleware redirects here
 * with `?reason=<status>` so we can render a tailored message.
 *
 * The page is intentionally Server-rendered and depends on no
 * authenticated data — even a logged-in user with a dead license can
 * land here. The "contact admin" button is the only call to action;
 * actual reactivation flows live elsewhere (super-admin tooling and
 * the activation API).
 */
interface PageProps {
  searchParams: Promise<{ reason?: string }>;
}

const REASON_HEADLINES: Record<string, { ar: string; en: string }> = {
  expired: {
    ar: 'انتهت صلاحية الترخيص',
    en: 'Your subscription has expired',
  },
  suspended: {
    ar: 'الترخيص موقوف',
    en: 'Your subscription is suspended',
  },
  cancelled: {
    ar: 'تم إلغاء الترخيص',
    en: 'Your subscription has been cancelled',
  },
  pending: {
    ar: 'الترخيص قيد التفعيل',
    en: 'Your subscription is pending activation',
  },
  missing: {
    ar: 'لا يوجد ترخيص نشط',
    en: 'No active license found',
  },
};

export default async function LicenseRequiredPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const reason = (params?.reason ?? 'missing').toLowerCase();
  const headline = REASON_HEADLINES[reason] ?? REASON_HEADLINES.missing;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-xl rounded-2xl border bg-white p-10 shadow-lg">
        <div className="mb-6 flex items-center justify-center">
          <div className="rounded-full bg-rose-100 p-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-10 w-10 text-rose-600"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
          </div>
        </div>

        <h1 className="mb-1 text-center text-2xl font-bold text-slate-900" dir="rtl">
          {headline.ar}
        </h1>
        <p className="mb-6 text-center text-sm text-slate-500">{headline.en}</p>

        <div className="space-y-3 rounded-lg bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
          <p dir="rtl">
            تم إيقاف الوصول إلى نظام إدارة الأعمال لأن اشتراك شركتك ليس
            نشطاً حالياً. تواصل مع مسؤول الحساب لتجديد الاشتراك أو
            تفعيله.
          </p>
          <p>
            Access to the business platform has been blocked because your
            company subscription is not currently active. Contact your
            account administrator to renew or reactivate the
            subscription.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <a
            href="mailto:support@al-ruya.iq?subject=License%20Renewal"
            className="rounded-lg bg-sky-700 px-5 py-2.5 text-center text-sm font-medium text-white transition hover:bg-sky-800"
          >
            تواصل مع المسؤول · Contact Admin
          </a>
          <Link
            href="/login"
            className="rounded-lg border border-slate-300 px-5 py-2.5 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            تسجيل خروج · Sign out
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Reason code: <span className="font-mono">{reason}</span>
        </p>
      </div>
    </div>
  );
}
