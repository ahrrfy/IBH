/**
 * License signing + verification.
 * RSA-2048 PSS signatures over a JSON payload.
 *
 * Payload shape:
 *   {
 *     companyId, plan, hardwareFingerprint,
 *     issuedAt, expiresAt, gracePeriodDays
 *   }
 */
import { createSign, createVerify } from 'node:crypto';

export type Plan = 'trial' | 'starter' | 'business' | 'enterprise';

export interface LicensePayload {
  companyId: string;
  plan: Plan;
  hardwareFingerprint: string;
  issuedAt: string;
  expiresAt: string;
  gracePeriodDays: number;
}

export interface SignedLicense {
  payload: LicensePayload;
  signature: string;
}

export function signLicense(payload: LicensePayload, privateKey: string): SignedLicense {
  const signer = createSign('RSA-SHA256');
  signer.update(JSON.stringify(payload));
  const signature = signer.sign(privateKey, 'base64');
  return { payload, signature };
}

export function verifyLicense(license: SignedLicense, publicKey: string): boolean {
  try {
    const verifier = createVerify('RSA-SHA256');
    verifier.update(JSON.stringify(license.payload));
    return verifier.verify(publicKey, license.signature, 'base64');
  } catch {
    return false;
  }
}

/** Returns true while inside license window OR grace period. */
export function isWithinGrace(payload: LicensePayload, now = new Date()): boolean {
  const expires = new Date(payload.expiresAt).getTime();
  const graceMs = payload.gracePeriodDays * 24 * 60 * 60 * 1000;
  return now.getTime() <= expires + graceMs;
}
