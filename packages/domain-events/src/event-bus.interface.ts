import type { DomainEvent, EventType } from '@erp/shared-types';

// ─── Event Bus Interface — implemented by NestJS BullMQ adapter ───────────────

export interface IEventBus {
  /** Publish a domain event to the queue */
  publish<T>(event: DomainEvent<T>): Promise<void>;

  /** Publish multiple events atomically */
  publishMany(events: DomainEvent[]): Promise<void>;
}

export interface IEventHandler<T = unknown> {
  eventType: EventType | string;
  handle(event: DomainEvent<T>): Promise<void>;
}

/** Decorator metadata key for event handler registration */
export const EVENT_HANDLER_METADATA = 'erp:event_handler';
