import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { DomainEventPayload } from './event-relay.service';

/**
 * Helper to emit a domain event that the EventRelayService will pick up.
 *
 * Usage:
 *   import { emitRealtime } from '../../platform/realtime/emit-realtime';
 *   emitRealtime(this.events, 'inventory.changed', {
 *     companyId, branchId, productId, qty, reason: 'sale',
 *   });
 *
 * The helper tags the payload with `__event` so the wildcard listener in
 * EventRelayService knows the event name (NestJS' EventEmitter2 wildcard
 * mode does not pass the name as a separate argument in promisify+async mode).
 */
export function emitRealtime(
  events: EventEmitter2,
  eventName: string,
  payload: DomainEventPayload,
): boolean {
  return events.emit(eventName, { ...payload, __event: eventName });
}
