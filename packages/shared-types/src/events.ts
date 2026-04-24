import type { ULID, DateTimeISO } from './common';

// ─── Domain Events — published via Redis BullMQ ───────────────────────────────
// Pattern: module publishes event → other modules subscribe → no direct coupling

export interface DomainEvent<T = unknown> {
  /** Unique event ID (ULID) */
  eventId: ULID;
  /** Event type — namespaced: "sales.invoice.created" */
  eventType: string;
  /** Aggregate root ID this event is about */
  aggregateId: ULID;
  /** Aggregate type: "Invoice", "SalesOrder"... */
  aggregateType: string;
  companyId: ULID;
  branchId: ULID | null;
  occurredAt: DateTimeISO;
  triggeredBy: ULID;        // userId
  /** Event payload — type-safe per event type */
  data: T;
  /** Correlation ID for tracing across services */
  correlationId: string;
  version: number;          // event schema version
}

// ─── Typed Event Payloads ─────────────────────────────────────────────────────

export interface SalesInvoiceCreatedEvent {
  invoiceId: ULID;
  invoiceNumber: string;
  customerId: ULID;
  totalAmount: number;
  currency: string;
  paymentMethod: string;
  lines: Array<{ variantId: ULID; qty: number; unitCost: number }>;
}

export interface StockMovementEvent {
  variantId: ULID;
  warehouseId: ULID;
  qtyChange: number;
  balanceAfter: number;
  referenceType: string;
  referenceId: ULID;
}

export interface PaymentReceivedEvent {
  paymentId: ULID;
  customerId: ULID;
  amount: number;
  currency: string;
  method: string;
  invoiceId: ULID | null;
}

export interface UserLoginEvent {
  userId: ULID;
  deviceType: string;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  failureReason?: string;
}

export interface AnomalyDetectedEvent {
  anomalyType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedEntityType: string;
  affectedEntityId: ULID;
  description: string;
  detectedBy: 'tier2_ml' | 'tier3_rules';
  score: number | null;
}

// ─── Event Type Constants ─────────────────────────────────────────────────────
export const EVENT_TYPES = {
  // Sales
  SALES_INVOICE_CREATED:   'sales.invoice.created',
  SALES_INVOICE_POSTED:    'sales.invoice.posted',
  SALES_RETURN_CREATED:    'sales.return.created',
  SALES_ORDER_CONFIRMED:   'sales.order.confirmed',

  // Inventory
  STOCK_MOVED:             'inventory.stock.moved',
  STOCK_LOW:               'inventory.stock.low',
  REORDER_TRIGGERED:       'inventory.reorder.triggered',

  // POS
  POS_SHIFT_OPENED:        'pos.shift.opened',
  POS_SHIFT_CLOSED:        'pos.shift.closed',
  POS_SALE_COMPLETED:      'pos.sale.completed',

  // Finance
  JOURNAL_ENTRY_POSTED:    'finance.journal_entry.posted',
  PAYMENT_RECEIVED:        'finance.payment.received',
  PAYMENT_MADE:            'finance.payment.made',
  PERIOD_CLOSED:           'finance.period.closed',

  // HR
  SALARY_RUN_POSTED:       'hr.salary_run.posted',
  EMPLOYEE_HIRED:          'hr.employee.hired',
  EMPLOYEE_TERMINATED:     'hr.employee.terminated',

  // AI
  ANOMALY_DETECTED:        'ai.anomaly.detected',
  FORECAST_UPDATED:        'ai.forecast.updated',

  // System
  APPROVAL_REQUESTED:      'system.approval.requested',
  APPROVAL_GRANTED:        'system.approval.granted',
  APPROVAL_REJECTED:       'system.approval.rejected',
  BACKUP_COMPLETED:        'system.backup.completed',
  BACKUP_FAILED:           'system.backup.failed',
} as const;

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];
