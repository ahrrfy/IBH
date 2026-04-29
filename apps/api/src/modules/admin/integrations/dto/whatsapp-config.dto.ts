import { z } from 'zod';

/**
 * WhatsApp Business API configuration shape (Meta Cloud API).
 * Each tenant supplies its own credentials so multiple companies can
 * integrate independently without a shared global token.
 *
 * Where to obtain each value:
 *   - token: Meta Business Suite → System Users → Generate token (long-lived)
 *   - phoneNumberId: Meta WhatsApp Manager → Phone Numbers
 *   - businessAccountId: Meta Business Suite → Business Settings → Accounts
 *   - webhookVerifyToken: free-form secret you choose; Meta will echo it
 *     back during webhook verification handshake.
 */
export const WhatsAppConfigSchema = z.object({
  token: z.string().min(20, 'Token must be at least 20 characters'),
  phoneNumberId: z.string().min(5, 'Phone number ID is required'),
  businessAccountId: z.string().min(5, 'Business account ID is required'),
  webhookVerifyToken: z.string().min(8, 'Webhook verify token must be at least 8 characters'),
  /// Optional: which API version to target (defaults to v22.0)
  apiVersion: z.string().optional().default('v22.0'),
});

export type WhatsAppConfig = z.infer<typeof WhatsAppConfigSchema>;

/** Body shape for PUT /admin/integrations/whatsapp */
export const SetWhatsAppConfigSchema = z.object({
  isEnabled: z.boolean(),
  config: WhatsAppConfigSchema,
});

export type SetWhatsAppConfigDto = z.infer<typeof SetWhatsAppConfigSchema>;

/** Response shape — omits the secret token, returns only safe fields. */
export type WhatsAppConfigPublicView = {
  isEnabled: boolean;
  /// Last 4 chars of the token, masked: "****abcd"
  tokenMasked: string | null;
  phoneNumberId: string | null;
  businessAccountId: string | null;
  apiVersion: string | null;
  /// From publicMetadata
  lastTestedAt: string | null;
  lastTestStatus: 'success' | 'failed' | null;
  lastTestError: string | null;
};
