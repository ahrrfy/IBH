import { SetMetadata } from '@nestjs/common';
import { REQUIRE_PERMISSION_KEY } from '../guards/rbac.guard';
import type { PermissionAction } from '@erp/shared-types';

/**
 * Require a specific RBAC permission on a route.
 * JwtAuthGuard must be applied first (via APP_GUARD or explicitly).
 *
 * @example
 * @RequirePermission('Invoice', 'create')
 * @Post()
 * async createInvoice() { ... }
 */
export const RequirePermission = (resource: string, action: PermissionAction) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, { resource, action });
