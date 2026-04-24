import type { DomainEvent, ULID } from '@erp/shared-types';
import { EVENT_TYPES } from '@erp/shared-types';

// ─── Fluent event builder ─────────────────────────────────────────────────────
// Avoids manually constructing event objects everywhere.

function generateUlid(): string {
  // Minimal ULID generator — in production NestJS uses the 'ulid' package
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).slice(2, 18).toUpperCase();
  return (timestamp.toString(36).toUpperCase().padStart(10, '0') + randomPart).slice(0, 26);
}

export function buildEvent<T>(params: {
  type: string;
  aggregateId: ULID;
  aggregateType: string;
  companyId: ULID;
  branchId: ULID | null;
  triggeredBy: ULID;
  data: T;
  correlationId?: string;
}): DomainEvent<T> {
  return {
    eventId: generateUlid(),
    eventType: params.type,
    aggregateId: params.aggregateId,
    aggregateType: params.aggregateType,
    companyId: params.companyId,
    branchId: params.branchId,
    occurredAt: new Date().toISOString(),
    triggeredBy: params.triggeredBy,
    data: params.data,
    correlationId: params.correlationId ?? generateUlid(),
    version: 1,
  };
}

export { EVENT_TYPES };
