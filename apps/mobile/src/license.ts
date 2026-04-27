/**
 * T66 — Mobile (read-only) license check.
 *
 * Mobile is treated as a read-only consumer of the licensing snapshot:
 * the API's global LicenseGuard already blocks every business endpoint
 * for tenants without an active subscription, so the app would 403 on
 * any meaningful action. This helper surfaces a clean "upgrade required"
 * UX instead of leaving the user staring at error toasts.
 *
 * Defense-in-depth role: lightweight UX layer; the API remains the
 * authoritative gate. A determined attacker bypassing this check still
 * cannot fetch any business data.
 */

import { api } from './api';

export interface MobileLicenseSnapshot {
  features: string[];
  planCode: string | null;
  status: string | null;
  validUntil: string | null;
  graceUntil: string | null;
}

const ENTITLED_STATUSES = new Set(['active', 'trial', 'grace']);

/**
 * Fetch the snapshot for the signed-in user's company. Returns
 * `undefined` on any error so callers can decide between "fail open"
 * (let API guard decide) and "fail closed" (force upgrade screen).
 */
export async function fetchLicense(): Promise<MobileLicenseSnapshot | undefined> {
  try {
    const { data } = await api.get<MobileLicenseSnapshot>('/licensing/me/features');
    return data;
  } catch {
    return undefined;
  }
}

/**
 * True when the snapshot grants the mobile user access. Falsy snapshot
 * (network failure) returns `true` → fail-open at the UX layer; the API
 * guard still enforces.
 */
export function isLicenseEntitled(snap: MobileLicenseSnapshot | undefined): boolean {
  if (!snap) return true;
  return Boolean(snap.status && ENTITLED_STATUSES.has(snap.status));
}
