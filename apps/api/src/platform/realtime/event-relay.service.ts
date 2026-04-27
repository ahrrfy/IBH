import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Domain event payload contract.
 *
 * Any module emitting a real-time-routable event MUST include at least one of:
 *   companyId, branchId, userId
 * so the relay can fan out to the right rooms.
 *
 * Example:
 *   this.events.emit('inventory.changed', {
 *     companyId, branchId, productId, qty, reason: 'sale'
 *   });
 */
export interface DomainEventPayload {
  companyId?: string | null;
  branchId?: string | null;
  userId?: string | null;
  [key: string]: unknown;
}

/**
 * EventRelayService (T31).
 *
 * Listens to wildcard EventEmitter2 events and forwards them to the
 * appropriate WebSocket rooms. Routing is name-based:
 *
 *   notification.*        -> user:<userId>      (per-user)
 *   pos.*, delivery.*,    -> branch:<branchId>  (operational, branch-scoped)
 *   inventory.*, stock.*,
 *   sales.*, purchases.*
 *   license.*, plan.*,    -> company:<companyId>(tenant-wide)
 *   audit.*
 *
 * Events without the required scope keys are dropped (with a debug log) to
 * prevent accidental cross-tenant leaks.
 */
@Injectable()
export class EventRelayService {
  private readonly logger = new Logger(EventRelayService.name);

  constructor(private readonly gateway: RealtimeGateway) {}

  @OnEvent('**', { async: true, promisify: true })
  handle(payloadOrUndefined: unknown, ...rest: unknown[]): void {
    // EventEmitter2 with wildcard passes the event name on `this.event`,
    // but in async mode we rely on the payload being a DomainEventPayload
    // and read the event name from a special `__event` field if provided.
    // For simplicity we use a single explicit emitter helper (see emit-realtime.ts)
    // — but to remain compatible with raw `events.emit('foo.bar', payload)` calls,
    // we accept (payload) and require the caller to set `payload.__event`.
    const payload = payloadOrUndefined as (DomainEventPayload & { __event?: string }) | undefined;
    if (!payload || typeof payload !== 'object') return;

    const eventName = payload.__event;
    if (!eventName || typeof eventName !== 'string') {
      // No __event tag → not intended for the relay, ignore silently.
      return;
    }

    const rooms = this.routeRooms(eventName, payload);
    if (rooms.length === 0) {
      this.logger.debug(`drop ${eventName}: no scope keys`);
      return;
    }

    // Strip routing meta before broadcasting.
    const { __event: _e, ...clientPayload } = payload;
    this.gateway.broadcast(rooms, eventName, clientPayload);
  }

  private routeRooms(eventName: string, p: DomainEventPayload): string[] {
    const rooms: string[] = [];

    if (eventName.startsWith('notification.')) {
      if (p.userId) rooms.push(`user:${p.userId}`);
      return rooms;
    }

    if (
      eventName.startsWith('license.') ||
      eventName.startsWith('plan.') ||
      eventName.startsWith('audit.')
    ) {
      if (p.companyId) rooms.push(`company:${p.companyId}`);
      return rooms;
    }

    // Default: branch-scoped operational events.
    if (p.branchId) rooms.push(`branch:${p.branchId}`);
    else if (p.companyId) rooms.push(`company:${p.companyId}`);
    return rooms;
  }
}
