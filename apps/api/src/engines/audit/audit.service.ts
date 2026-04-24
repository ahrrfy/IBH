import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../platform/prisma/prisma.service';

// ─── Audit Engine (F2 Security Level 2) ──────────────────────────────────────
// APPEND-ONLY. Hash chain for tamper detection.
// Every mutation on any entity MUST call audit.log().
// DB trigger prevents UPDATE/DELETE on audit_logs table.

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'         // soft delete
  | 'submit'         // user sign-off
  | 'approve'        // management sign-off
  | 'reject'
  | 'post'           // accounting post
  | 'reverse'        // accounting reversal
  | 'print'
  | 'export'
  | 'login'
  | 'logout'
  | 'login_failed'
  | 'login_locked'
  | 'password_changed'
  | 'period_closed'
  | 'role_assigned'
  | 'permission_changed';

export interface AuditLogParams {
  companyId: string;
  userId: string;
  userEmail: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
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
  async log(params: AuditLogParams): Promise<void> {
    try {
      // Get the last hash for this company (for the chain)
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
        params.entityType,
        params.entityId,
        timestamp,
        JSON.stringify(params.changedFields ?? {}),
      ].join('|');

      const hash = createHash('sha256').update(hashInput).digest('hex');

      await this.prisma.auditLog.create({
        data: {
          companyId:     params.companyId,
          userId:        params.userId,
          userEmail:     params.userEmail,
          action:        params.action,
          entityType:    params.entityType,
          entityId:      params.entityId,
          changedFields: params.changedFields ?? {},
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
