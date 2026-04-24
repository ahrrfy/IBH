import { SetMetadata } from '@nestjs/common';
import { REQUIRE_PERMISSION_KEY } from '../guards/rbac.guard';
import type { PermissionAction } from '@erp/shared-types';

/**
 * Require a specific RBAC permission on a route.
 * Supports two forms:
 *   @RequirePermission('Invoice', 'create')             — canonical
 *   @RequirePermission('pos.shift.operate')             — dotted shortcut
 *
 * The dotted form is split on the LAST dot: left = resource, right = action.
 * Resource is ultimately matched against the bitmask map loaded from
 * the role.permissions JSON at guard time.
 */
export function RequirePermission(
  resourceOrPath: string,
  action?: PermissionAction,
): MethodDecorator & ClassDecorator {
  let resource = resourceOrPath;
  let resolvedAction: PermissionAction;

  if (action === undefined) {
    const lastDot = resourceOrPath.lastIndexOf('.');
    if (lastDot === -1) {
      // Bare word — treat whole string as resource, default action 'read'
      resource = resourceOrPath;
      resolvedAction = 'read';
    } else {
      resource       = resourceOrPath.slice(0, lastDot);
      resolvedAction = resourceOrPath.slice(lastDot + 1) as PermissionAction;
    }
  } else {
    resolvedAction = action;
  }

  return SetMetadata(REQUIRE_PERMISSION_KEY, { resource, action: resolvedAction });
}
