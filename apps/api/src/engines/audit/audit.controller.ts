import { Controller, Get, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { AuditService } from './audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

/**
 * Read-only audit log viewer.
 *
 * Append-only is enforced at the DB level (no_update_audit_logs trigger).
 * No POST/PUT/DELETE endpoints — entries are written exclusively by
 * AuditService.log() invoked from business modules.
 */
@Controller('audit-logs')
export class AuditController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Paginated query of audit entries for the current company.
   * Filters: from/to (occurredAt range), action prefix, entityType,
   * entityId, userId.
   */
  @Get()
  @RequirePermission('AuditLog', 'read')
  async findAll(
    @CurrentUser() user: UserSession,
    @Query('limit')      limitQ?: string,
    @Query('cursor')     cursor?: string,
    @Query('from')       from?: string,
    @Query('to')         to?: string,
    @Query('action')     action?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId')   entityId?: string,
    @Query('userId')     userId?: string,
  ) {
    // Cap at 200 to keep latency bounded; default 100.
    const limit = Math.min(200, Math.max(1, Number(limitQ) || 100));

    const where: Prisma.AuditLogWhereInput = { companyId: user.companyId };
    if (from || to) {
      where.occurredAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to   ? { lte: new Date(to) }   : {}),
      };
    }
    if (action)     where.action     = { startsWith: action };
    if (entityType) where.entityType = entityType;
    if (entityId)   where.entityId   = entityId;
    if (userId)     where.userId     = userId;

    const items = await this.prisma.auditLog.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      take:    limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = items.length > limit;
    const trimmed = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? trimmed[trimmed.length - 1]?.id ?? null : null;

    return { items: trimmed, nextCursor, hasMore };
  }

  /**
   * Verify the SHA-256 hash chain for the company's audit trail.
   * Returns { intact, checked } — `intact: false` indicates tampering.
   * Limited to 5000 entries per call (UI shows "verify last N").
   */
  @Get('verify-chain')
  @RequirePermission('AuditLog', 'read')
  async verifyChain(
    @CurrentUser() user: UserSession,
    @Query('limit') limitQ?: string,
  ) {
    const limit = Math.min(5000, Math.max(1, Number(limitQ) || 1000));
    const intact = await this.audit.verifyChain(user.companyId, limit);
    return { intact, checked: limit };
  }
}
