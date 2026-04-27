/**
 * T66 — POS hard-block screen.
 *
 * Rendered when the cached activation token is missing, signature-
 * invalid, or past the offline grace window. Until the device reaches
 * the API and obtains a fresh activation token, the POS refuses to
 * load. This is the defense-in-depth backstop: even if someone bypasses
 * the API guard and the web middleware, the POS itself will not run on
 * a device that cannot prove a recent valid signed token.
 */

interface Props {
  status: string;
  reason?: string | null;
  expiresAt?: string | null;
  onRetry: () => void;
}

export function LicenseBlocked({ status, reason, expiresAt, onRetry }: Props) {
  const headlineAr =
    status === 'expired_offline'
      ? 'انتهت فترة العمل دون اتصال — يجب الاتصال لتجديد الترخيص'
      : status === 'missing'
        ? 'لم يتم تفعيل هذا الجهاز'
        : 'الترخيص غير صالح';

  const headlineEn =
    status === 'expired_offline'
      ? 'Offline grace period exhausted — connect to renew'
      : status === 'missing'
        ? 'This device has not been activated'
        : 'License is not valid on this device';

  return (
    <div className="flex h-screen items-center justify-center bg-rose-50 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-8 shadow-lg">
        <div className="mb-4 text-5xl">🔒</div>
        <h1 className="mb-1 text-xl font-bold text-rose-700" dir="rtl">
          {headlineAr}
        </h1>
        <p className="mb-4 text-sm text-rose-600">{headlineEn}</p>

        <dl className="mb-6 space-y-1 rounded bg-slate-50 p-3 text-xs text-slate-700">
          <div className="flex justify-between">
            <dt className="font-semibold">Status</dt>
            <dd className="font-mono">{status}</dd>
          </div>
          {reason ? (
            <div className="flex justify-between">
              <dt className="font-semibold">Reason</dt>
              <dd className="font-mono">{reason}</dd>
            </div>
          ) : null}
          {expiresAt ? (
            <div className="flex justify-between">
              <dt className="font-semibold">Expired at</dt>
              <dd className="font-mono">{new Date(expiresAt).toLocaleString()}</dd>
            </div>
          ) : null}
        </dl>

        <button
          type="button"
          onClick={onRetry}
          className="w-full rounded bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800"
        >
          إعادة المحاولة / Retry
        </button>
      </div>
    </div>
  );
}
