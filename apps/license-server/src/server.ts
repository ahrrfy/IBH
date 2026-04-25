/**
 * Al-Ruya License Server (standalone).
 *
 * Endpoints:
 *   POST /heartbeat   — { licenseKey } → { valid, expiresAt, plan }
 *   POST /issue       — admin-only: mint a new RSA-signed license
 *   GET  /health      — liveness
 *
 * The signed license itself is opaque to this server after issuance —
 * the verifying side (POS, ERP) holds the public key and validates
 * offline. The heartbeat exists only to (a) detect revocations and
 * (b) record telemetry. If the server is unreachable, the client
 * falls back to its 30-day grace check (offline-friendly).
 */
import Fastify from 'fastify';
import { z } from 'zod';
import 'dotenv/config';
import {
  signLicense,
  verifyLicense,
  isWithinGrace,
  type LicensePayload,
  type Plan,
} from './license.js';

const PORT = Number(process.env.PORT ?? 8003);
const PRIVATE_KEY = process.env.LICENSE_RSA_PRIVATE_KEY ?? '';
const PUBLIC_KEY  = process.env.LICENSE_RSA_PUBLIC_KEY  ?? '';
const ADMIN_TOKEN = process.env.LICENSE_ADMIN_TOKEN ?? '';

// In-memory revocation list — production should use Postgres.
const revoked = new Set<string>();

const fastify = Fastify({ logger: true });

fastify.get('/health', async () => ({ status: 'ok', service: 'license-server' }));

const HeartbeatSchema = z.object({ licenseKey: z.string().min(1) });

fastify.post('/heartbeat', async (req, reply) => {
  const parsed = HeartbeatSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_payload' });

  let signed: { payload: LicensePayload; signature: string };
  try {
    signed = JSON.parse(Buffer.from(parsed.data.licenseKey, 'base64').toString('utf8'));
  } catch {
    return { valid: false, reason: 'malformed_key' };
  }

  if (!verifyLicense(signed, PUBLIC_KEY)) {
    return { valid: false, reason: 'bad_signature' };
  }
  if (revoked.has(signed.payload.companyId)) {
    return { valid: false, reason: 'revoked' };
  }
  const valid = isWithinGrace(signed.payload);
  return {
    valid,
    plan: signed.payload.plan,
    expiresAt: signed.payload.expiresAt,
    gracePeriodDays: signed.payload.gracePeriodDays,
  };
});

const IssueSchema = z.object({
  companyId: z.string().length(26),
  plan: z.enum(['trial', 'starter', 'business', 'enterprise']),
  hardwareFingerprint: z.string().min(8),
  validDays: z.number().int().min(1).max(3650),
  gracePeriodDays: z.number().int().min(0).max(90).default(30),
});

fastify.post('/issue', async (req, reply) => {
  const auth = req.headers.authorization ?? '';
  if (auth !== `Bearer ${ADMIN_TOKEN}` || !ADMIN_TOKEN) {
    return reply.code(401).send({ error: 'unauthorized' });
  }
  const parsed = IssueSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

  const now = new Date();
  const expires = new Date(now.getTime() + parsed.data.validDays * 86_400_000);
  const payload: LicensePayload = {
    companyId: parsed.data.companyId,
    plan: parsed.data.plan as Plan,
    hardwareFingerprint: parsed.data.hardwareFingerprint,
    issuedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    gracePeriodDays: parsed.data.gracePeriodDays,
  };
  const signed = signLicense(payload, PRIVATE_KEY);
  const licenseKey = Buffer.from(JSON.stringify(signed)).toString('base64');
  return { licenseKey, payload };
});

fastify.post('/revoke', async (req, reply) => {
  const auth = req.headers.authorization ?? '';
  if (auth !== `Bearer ${ADMIN_TOKEN}` || !ADMIN_TOKEN) {
    return reply.code(401).send({ error: 'unauthorized' });
  }
  const { companyId } = (req.body ?? {}) as { companyId?: string };
  if (!companyId) return reply.code(400).send({ error: 'missing_companyId' });
  revoked.add(companyId);
  return { revoked: companyId };
});

fastify.listen({ port: PORT, host: '0.0.0.0' }).catch((err) => {
  fastify.log.error(err);
  process.exit(1);
});
