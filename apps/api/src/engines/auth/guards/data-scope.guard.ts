import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';

/**
 * Per-user data scope.
 *
 * Persisted on User.dataScope (Json). Shape is intentionally narrow —
 * additional dimensions can be added without breaking older payloads.
 */
export interface UserDataScope {
  /** When true, all queries are restricted to the user's own branchId. */
  ownBranchOnly?: boolean;
  /** If non-empty, queries on warehouse-bound entities are limited to these warehouses. */
  warehouseIds?: string[];
  /** Optional cap (in primary currency minor units) on monetary actions. */
  amountCap?: number;
}

/** Filter object the guard exposes to downstream services. */
export interface DataScopeFilter {
  branchId?: string;
  warehouseIds?: string[];
  amountCap?: number;
}

/**
 * Symbol-keyed slot on the request — avoids polluting the typed UserSession
 * shape used by handlers.
 */
export const DATA_SCOPE_FILTER = Symbol.for('erp.request.dataScopeFilter');

/**
 * T47 — DataScopeGuard
 *
 * Reads `req.user.dataScope` (loading it lazily from the DB if absent) and
 * attaches a normalized {@link DataScopeFilter} to the request under the
 * {@link DATA_SCOPE_FILTER} symbol. Services may then read it via:
 *
 *   const filter = req[DATA_SCOPE_FILTER] as DataScopeFilter | undefined;
 *
 * The guard never DENIES on its own — it only enriches the request. Authorization
 * remains the responsibility of {@link RbacGuard} and the per-feature ABAC rules.
 */
@Injectable()
export class DataScopeGuard implements CanActivate {
  private readonly logger = new Logger(DataScopeGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Record<string | symbol, unknown>>();
    const session = request['user'] as
      | { userId?: string; branchId?: string | null; dataScope?: UserDataScope | null }
      | undefined;

    if (!session?.userId) {
      // No authenticated user — let JwtAuthGuard handle the rejection.
      return true;
    }

    let scope: UserDataScope | null | undefined = session.dataScope;
    if (scope === undefined) {
      try {
        const user = await this.prisma.user.findUnique({
          where: { id: session.userId },
          select: { dataScope: true, branchId: true },
        });
        scope = (user?.dataScope as UserDataScope | null) ?? null;
        // Cache for the request lifetime.
        session.dataScope = scope;
        if (!session.branchId && user?.branchId) session.branchId = user.branchId;
      } catch (err) {
        this.logger.error('Failed to load user data scope', err as Error);
        scope = null;
      }
    }

    const filter: DataScopeFilter = {};
    if (scope?.ownBranchOnly && session.branchId) {
      filter.branchId = session.branchId;
    }
    if (scope?.warehouseIds && scope.warehouseIds.length > 0) {
      filter.warehouseIds = [...scope.warehouseIds];
    }
    if (typeof scope?.amountCap === 'number' && scope.amountCap >= 0) {
      filter.amountCap = scope.amountCap;
    }

    request[DATA_SCOPE_FILTER] = filter;
    return true;
  }
}

/**
 * Helper for services — pulls the filter off the request without exposing
 * the symbol contract to call sites.
 */
export function getDataScopeFilter(req: unknown): DataScopeFilter | undefined {
  if (!req || typeof req !== 'object') return undefined;
  const value = (req as Record<string | symbol, unknown>)[DATA_SCOPE_FILTER];
  return (value as DataScopeFilter | undefined) ?? undefined;
}

/**
 * Enforce the scope's amountCap against an arbitrary monetary value.
 * Throws ForbiddenException with a localized Arabic message on violation.
 */
export function enforceAmountCap(filter: DataScopeFilter | undefined, amount: number): void {
  if (!filter || typeof filter.amountCap !== 'number') return;
  if (amount > filter.amountCap) {
    throw new ForbiddenException({
      code: 'DATA_SCOPE_AMOUNT_CAP',
      messageAr: `المبلغ ${amount} يتجاوز الحد المسموح ${filter.amountCap}`,
    });
  }
}
