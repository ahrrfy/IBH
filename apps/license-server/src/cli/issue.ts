#!/usr/bin/env node
/**
 * One-shot CLI to mint a license. Usage:
 *   tsx src/cli/issue.ts <companyId> <plan> <hwFingerprint> <validDays>
 * Reads RSA private key from LICENSE_RSA_PRIVATE_KEY.
 */
import 'dotenv/config';
import { signLicense, type LicensePayload, type Plan } from '../license.js';

const [companyId, plan, hw, daysStr] = process.argv.slice(2);
if (!companyId || !plan || !hw || !daysStr) {
  console.error('usage: issue <companyId> <plan> <hwFingerprint> <validDays>');
  process.exit(1);
}

const validDays = Number(daysStr);
const now = new Date();
const expires = new Date(now.getTime() + validDays * 86_400_000);

const payload: LicensePayload = {
  companyId,
  plan: plan as Plan,
  hardwareFingerprint: hw,
  issuedAt: now.toISOString(),
  expiresAt: expires.toISOString(),
  gracePeriodDays: 30,
};
const signed = signLicense(payload, process.env.LICENSE_RSA_PRIVATE_KEY ?? '');
console.log(Buffer.from(JSON.stringify(signed)).toString('base64'));
