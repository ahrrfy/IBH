/**
 * Shared types for the Notification Dispatch Engine (T46).
 */

export type NotificationChannel = 'inApp' | 'whatsapp' | 'email' | 'sms';

export const ALL_CHANNELS: NotificationChannel[] = [
  'inApp',
  'whatsapp',
  'email',
  'sms',
];

/**
 * Default channel set when no NotificationPreference row exists for a
 * (userId, eventType) pair: deliver in-app only. Conservative — avoids
 * accidentally spamming whatsapp/email/sms before a user opts in.
 */
export const DEFAULT_CHANNELS: NotificationChannel[] = ['inApp'];

export interface DispatchPayload {
  /** Tenant id — required for RLS scoping and reporting. */
  companyId: string;
  /** Recipient. */
  userId: string;
  /** Event identifier, e.g. 'invoice.overdue'. */
  eventType: string;
  /** Short headline shown in the bell dropdown. */
  title: string;
  /** Long-form body shown on the notifications page. */
  body: string;
  /**
   * Event-specific structured data. Used by the UI to deep-link (e.g.
   * { invoiceId } → /finance/invoices/:id) and by external bridges
   * (whatsapp/email) to render templates.
   */
  data?: Record<string, unknown>;
}

export interface QueueJobBase {
  payload: DispatchPayload;
}
