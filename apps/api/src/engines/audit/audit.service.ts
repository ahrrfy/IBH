import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../platform/prisma/prisma.service';

// ─── Audit Engine (F2 Security Level 2) ──────────────────────────────────────
// APPEND-ONLY. Hash chain for tamper detection.
// Every mutation on any entity MUST call audit.log().
// DB trigger prevents UPDATE/DELETE on audit_logs table.

// Free-form — any module.action string is accepted; the full namespaced form
// is preserved in the DB so you can filter by prefix (e.g. 'sales.*').
export type AuditAction = string;

export interface AuditLogParams {
  companyId: string;
  userId: string;
  userEmail?: string;
  action: AuditAction;
  // Canonical field names
  entityType?: string;
  entityId?: string;
  // Aliases used by Wave 2-6 services
  entity?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  changedFields?: Record<string, { old: unknown; new: unknown }>;
  ipAddress?: string;
  userAgent?: string;
  deviceType?: string;
  reason?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Write an immutable audit record.
   * Computes hash = SHA256(previousHash + companyId + userId + action + entityId + timestamp)
   */
  async log(params: AuditLogParams, _tx?: any): Promise<void> {
    try {
      const entityType = params.entityType ?? params.entity ?? 'Unknown';
      const entityId = params.entityId ?? '';
      // Merge before/after/metadata into changedFields if not explicitly set
      const changedFields: Record<string, unknown> = params.changedFields
        ? { ...(params.changedFields as any) }
        : {};
      if (params.before !== undefined) changedFields['__before'] = params.before;
      if (params.after !== undefined) changedFields['__after'] = params.after;
      if (params.metadata !== undefined) changedFields['__meta'] = params.metadata;

      const lastEntry = await this.prisma.auditLog.findFirst({
        where: { companyId: params.companyId },
        orderBy: { occurredAt: 'desc' },
        select: { hash: true },
      });

      const previousHash = lastEntry?.hash ?? '0'.repeat(64);
      const timestamp = new Date().toISOString();

      const hashInput = [
        previousHash,
        params.companyId,
        params.userId,
        params.action,
        entityType,
        entityId,
        timestamp,
        JSON.stringify(changedFields),
      ].join('|');

      const hash = createHash('sha256').update(hashInput).digest('hex');

      await this.prisma.auditLog.create({
        data: {
          companyId:     params.companyId,
          userId:        params.userId,
          userEmail:     params.userEmail ?? params.userId,
          action:        params.action,
          entityType,
          entityId,
          changedFields: changedFields as any,
          ipAddress:     params.ipAddress,
          userAgent:     params.userAgent,
          deviceType:    params.deviceType,
          reason:        params.reason,
          occurredAt:    new Date(timestamp),
          hash,
          previousHash,
        },
      });
    } catch (error) {
      // Audit failure is CRITICAL — log but never throw (don't break the operation)
      this.logger.error(`CRITICAL: Audit log failed: ${(error as Error).message}`, {
        companyId: params.companyId,
        action: params.action,
        entityId: params.entityId,
      });
      // TODO: In production, send alert to monitoring system
    }
  }

  /**
   * Verify the integrity of the audit chain for a company.
   * Returns true if the chain is intact, false if tampered.
   */
  async verifyChain(companyId: string, limit = 1000): Promise<boolean> {
    const entries = await this.prisma.auditLog.findMany({
      where: { companyId },
      orderBy: { occurredAt: 'asc' },
      take: limit,
      select: {
        hash: true,
        previousHash: true,
        companyId: true,
        userId: true,
        action: true,
        entityType: true,
        entityId: true,
        changedFields: true,
        occurredAt: true,
      },
    });

    if (entries.length === 0) return true;

    for (let i = 1; i < entries.length; i++) {
      const current = entries[i];
      const previous = entries[i - 1];

      if (current.previousHash !== previous.hash) {
        this.logger.error(`TAMPER DETECTED: Audit chain broken at entry ${i}`, {
          companyId,
          expectedPrevHash: previous.hash,
          foundPrevHash: current.previousHash,
        });
        return false;
      }
    }

    return true;
  }

  /**
   * Get audit history for an entity.
   */
  async getEntityHistory(params: {
    companyId: string;
    entityType: string;
    entityId: string;
    limit?: number;
  }) {
    return this.prisma.auditLog.findMany({
      where: {
        companyId:  params.companyId,
        entityType: params.entityType,
        entityId:   params.entityId,
      },
      orderBy: { occurredAt: 'desc' },
      take: params.limit ?? 50,
    });
  }
}
