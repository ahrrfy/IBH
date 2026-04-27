import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key under which `@SkipLicense()` is stored on a route handler
 * or controller class. The global `LicenseGuard` reads this key via
 * Reflector to know that a route must remain reachable even when the
 * tenant has no active license — e.g. auth, health, license activation,
 * and the `/licensing/me/features` mirror used by the web shell.
 */
export const SKIP_LICENSE_KEY = 'license:skip';

/**
 * `@SkipLicense()` — opt a controller or route OUT of the global
 * `LicenseGuard` (T66).
 *
 * Use sparingly. Only the following classes of endpoint should be
 * exempt from license enforcement:
 *
 *   1. Auth (login/refresh) — otherwise users with an expired license
 *      could not even sign in to renew it.
 *   2. Health checks — Kubernetes / Nginx probes must keep working.
 *   3. License activation / renewal / revoke / public-key — the very
 *      endpoints used to restore a license cannot themselves require
 *      one.
 *   4. The `/licensing/me/*` mirror endpoints used by the UI to detect
 *      and surface "license required" states.
 *
 * Anything else MUST go through the guard. SuperAdmin already bypasses
 * inside the guard, so admin routes do not need this decorator.
 */
export const SkipLicense = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_LICENSE_KEY, true);
