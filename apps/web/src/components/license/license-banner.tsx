'use client';

import { usePlanInfo } from '@/lib/license/use-feature';

/**
 * T66 — License status banner. Renders a top-bar warning when the
 * company's subscription is in a *non-blocking* but degraded state
 * that the user should know about:
 *
 *   - `trial`  → countdown to trial expiry (informational, blue)
 *   - `grace`  → "renew immediately" warning (urgent, amber)
 *
 * It deliberately does NOT show for `expired`/`suspended`/`cancelled`
 * — those statuses redirect to /license-required via the middleware,
 * so a banner would never be reached.
 *
 * Place once in the app shell layout; renders nothing unless a degraded
 * state is detected, so it is safe to mount unconditionally.
 */
export function LicenseBanner() {
  const { status, validUntil, loading } = usePlanInfo();
  if (loading || !status) return null;
  if (status !== 'trial' && status !== 'grace') return null;

  const days = validUntil ? daysUntil(validUntil) : null;
  const isGrace = status === 'grace';

  const palette = isGrace
    ? 'bg-amber-100 text-amber-900 border-amber-300'
    : 'bg-sky-100 text-sky-900 border-sky-300';

  const headlineAr = isGrace
    ? 'فترة السماح فعّالة — جدّد الاشتراك فوراً'
    : 'تجربة مجانية';
  const headlineEn = isGrace
    ? 'Grace period — renew immediately'
    : 'Free trial';

  const tail =
    days === null
      ? ''
      : days <= 0
        ? ' · ينتهي اليوم / Ends today'
        : ` · ${days} يوم متبقي / ${days} day${days === 1 ? '' : 's'} remaining`;

  return (
    <div
      role="status"
      className={`flex items-center justify-between gap-3 border-b px-4 py-2 text-sm ${palette}`}
    >
      <div>
        <span className="font-semibold">
          {headlineAr} · {headlineEn}
        </span>
        <span className="opacity-80">{tail}</span>
      </div>
      <a
        href="/settings/billing"
        className="rounded bg-white/60 px-3 py-1 text-xs font-medium hover:bg-white"
      >
        إدارة الاشتراك / Manage
      </a>
    </div>
  );
}

function daysUntil(iso: string): number {
  const ms = Date.parse(iso) - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}
