'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { onRealtime } from '@/lib/realtime/socket-client';

/**
 * T65 — Per-plan feature flags on the web.
 *
 * Mirrors the backend `FeatureCacheService` so React components can hide
 * or disable UI elements based on the current company's plan.
 *
 * Real-time bidirectional flow:
 *   - On mount, this hook fetches `GET /licensing/me/features`.
 *   - It also subscribes to the T31 realtime event `license.plan.changed`
 *     (scoped to the current `company:<companyId>` room server-side).
 *   - When the event fires (e.g. an admin upgrades the plan via T63),
 *     the React Query cache for this query is invalidated and refetched,
 *     causing every gated component to re-render with the new entitlements
 *     instantly — no full page reload required.
 *
 * SSR safety:
 *   - On the server, `useQuery` returns `data: undefined` and `isLoading: true`,
 *     so the helpers below report `loading: true` and `enabled: false`. This
 *     keeps the markup consistent until hydration; gated children remain hidden
 *     until the real entitlement set arrives.
 */

export interface MeFeaturesResponse {
  features: string[];
  planCode: string | null;
  planId: string | null;
  status: string | null;
  validUntil: string | null;
  graceUntil: string | null;
}

export const ME_FEATURES_QUERY_KEY = ['licensing', 'me', 'features'] as const;

/**
 * Fetch the current user's company licensing snapshot. Cached by React Query.
 */
function useMeFeaturesQuery() {
  const qc = useQueryClient();

  // Subscribe to the realtime invalidation event exactly once per mount.
  // Using a single shared key means re-renders here do not pile up listeners.
  useEffect(() => {
    const off = onRealtime('license.plan.changed', () => {
      qc.invalidateQueries({ queryKey: ME_FEATURES_QUERY_KEY });
    });
    return off;
  }, [qc]);

  return useQuery<MeFeaturesResponse>({
    queryKey: ME_FEATURES_QUERY_KEY,
    queryFn: () => get<MeFeaturesResponse>('/licensing/me/features'),
    staleTime: 60_000,
    // Always show fresh data after a network reconnect — entitlements
    // can change while a tab is in the background.
    refetchOnReconnect: true,
  });
}

/**
 * `useFeature(code)` — does the current company have the given feature?
 *
 * Returns:
 *   - `enabled`: true only when the entitlement set is loaded AND contains `code`
 *   - `loading`: true on the server and during the first fetch on the client
 *
 * Conservative default: while loading, `enabled` is false. UI gates should
 * rely on `loading` to render skeletons rather than briefly flashing the
 * gated content.
 */
export function useFeature(code: string): { enabled: boolean; loading: boolean } {
  const q = useMeFeaturesQuery();
  const features = q.data?.features ?? [];
  return {
    enabled: !q.isLoading && features.includes(code),
    loading: q.isLoading,
  };
}

/**
 * `useFeatures()` — full enabled feature-code list (or `[]` while loading).
 * Useful for components that gate multiple sub-elements at once.
 */
export function useFeatures(): { features: string[]; loading: boolean } {
  const q = useMeFeaturesQuery();
  return {
    features: q.data?.features ?? [],
    loading: q.isLoading,
  };
}

/**
 * `usePlanInfo()` — current plan code + validity.
 * Returns `null` for `planCode` when the company has no active subscription.
 */
export function usePlanInfo(): {
  planCode: string | null;
  validUntil: string | null;
  status: string | null;
  loading: boolean;
} {
  const q = useMeFeaturesQuery();
  return {
    planCode: q.data?.planCode ?? null,
    validUntil: q.data?.validUntil ?? null,
    status: q.data?.status ?? null,
    loading: q.isLoading,
  };
}
