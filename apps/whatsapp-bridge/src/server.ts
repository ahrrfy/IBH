/**
 * Al-Ruya WhatsApp Bridge
 * ──────────────────────
 * Receives WhatsApp Cloud API webhooks (orders, payments, support)
 * and forwards normalized events to the Al-Ruya ERP API. Also exposes
 * a /send endpoint that the ERP can call to push outbound messages
 * (invoice PDFs, OTPs, delivery updates).
 */

import Fastify from 'fastify';
import axios from 'axios';
import { z } from 'zod';
import 'dotenv/config';

const PORT       = Number(process.env.PORT ?? 8002);
const VERIFY_TOK = process.env.WHATSAPP_VERIFY_TOKEN ?? 'al-ruya-verify';
const WA_TOKEN   = process.env.WHATSAPP_ACCESS_TOKEN ?? '';
const WA_PHONE   = process.env.WHATSAPP_PHONE_ID ?? '';
const ERP_URL    = process.env.ERP_API_URL ?? 'http://api:3000';
const ERP_TOKEN  = process.env.ERP_API_TOKEN ?? '';

const fastify = Fastify({ logger: true });

fastify.get('/health', async () => ({ status: 'ok', service: 'whatsapp-bridge' }));

// Meta verification handshake (GET) — required when registering the webhook.
fastify.get('/webhook', async (req, reply) => {
  const q = req.query as Record<string, string>;
  if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === VERIFY_TOK) {
    return reply.code(200).send(q['hub.challenge']);
  }
  return reply.code(403).send();
});

// Incoming messages — extract phone + text and forward to ERP CRM.
fastify.post('/webhook', async (req, reply) => {
  const body = req.body as any;
  try {
    const change = body?.entry?.[0]?.changes?.[0]?.value;
    const msg    = change?.messages?.[0];
    if (msg) {
      const payload = {
        from:    msg.from as string,
        type:    msg.type as string,
        text:    msg.text?.body as string | undefined,
        msgId:   msg.id as string,
        timestamp: msg.timestamp as string,
      };
      await axios.post(`${ERP_URL}/crm/whatsapp/inbox`, payload, {
        headers: { Authorization: `Bearer ${ERP_TOKEN}` },
        timeout: 5000,
      }).catch((err) => fastify.log.warn({ err: err.message }, 'forward to ERP failed'));
    }
  } catch (err: any) {
    fastify.log.error({ err: err.message }, 'webhook parse failed');
  }
  return reply.code(200).send();
});

// Outbound: ERP → WhatsApp Cloud API.
const SendSchema = z.object({
  to:   z.string().min(8),
  text: z.string().min(1).max(4096),
});

fastify.post('/send', async (req, reply) => {
  const parsed = SendSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

  if (!WA_TOKEN || !WA_PHONE) {
    fastify.log.warn('WHATSAPP creds missing — message logged, not sent');
    return { sent: false, reason: 'missing_credentials' };
  }
  const { to, text } = parsed.data;
  await axios.post(
    `https://graph.facebook.com/v21.0/${WA_PHONE}/messages`,
    { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } },
    { headers: { Authorization: `Bearer ${WA_TOKEN}` } },
  );
  return { sent: true };
});

fastify.listen({ port: PORT, host: '0.0.0.0' }).catch((err) => {
  fastify.log.error(err);
  process.exit(1);
});
