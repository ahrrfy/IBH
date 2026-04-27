'use client';

import type { ReactElement, ReactNode } from 'react';
import { useFeature } from '@/lib/license/use-feature';

/**
 * T65 — `<FeatureGate code="...">` wraps any UI region that should only
 * be visible (or interactive) when the current company's plan includes
 * the given feature code.
 *
 * Modes:
 *   - `hide`     (default) — renders `fallback` (or nothing) when the feature
 *                is not enabled. Best for navigation items: the link should
 *                disappear entirely if the user can't reach the page.
 *   - `disable`  — always renders the children but wraps them in a tooltip
 *                container with `aria-disabled` and pointer-events suppressed.
 *                Best for action buttons where the user should still see the
 *                affordance but understand why it's unreachable.
 *
 * While the entitlement set is loading (SSR + first client fetch),
 * the gate behaves as if disabled to avoid flashing gated content.
 *
 * Apply this pattern across other modules when extending T65 — e.g.
 *   <FeatureGate code="manufacturing"> ... </FeatureGate>
 *   <FeatureGate code="ai.tier3" mode="disable" fallback={<UpgradeChip/>}> ... </FeatureGate>
 */
export interface FeatureGateProps {
  /** Feature code from the licensing seed (e.g. `hr.core`, `manufacturing`). */
  code: string;
  /** What to render when the feature is OFF. Defaults to nothing in `hide` mode. */
  fallback?: ReactNode;
  /** Hide the children entirely vs. render them disabled. Default `hide`. */
  mode?: 'hide' | 'disable';
  children: ReactNode;
}

const DISABLED_TOOLTIP = 'هذه الميزة غير متوفرة في خطتك الحالية';

export function FeatureGate({
  code,
  fallback = null,
  mode = 'hide',
  children,
}: FeatureGateProps): ReactElement | null {
  const { enabled, loading } = useFeature(code);

  // Loading state: behave as "off" to avoid leaking gated UI before
  // entitlements are resolved. Disable mode keeps layout stable.
  if (loading || !enabled) {
    if (mode === 'disable') {
      return (
        <span
          aria-disabled="true"
          title={DISABLED_TOOLTIP}
          className="pointer-events-none cursor-not-allowed opacity-50"
          data-feature-gate={code}
          data-feature-state={loading ? 'loading' : 'disabled'}
        >
          {children}
        </span>
      );
    }
    // hide mode
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
