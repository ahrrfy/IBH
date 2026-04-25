/**
 * Unit tests for license sign/verify primitives.
 * Run with: npx tsx --test test/license.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { signLicense, verifyLicense, isWithinGrace, type LicensePayload } from '../src/license.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const pubPem  = publicKey .export({ type: 'spki',  format: 'pem' }) as string;

const basePayload: LicensePayload = {
  companyId: '01HZZZZZZZZZZZZZZZZZZZTEST1',
  plan: 'business',
  hardwareFingerprint: 'hw-test-1',
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 365 * 86_400_000).toISOString(),
  gracePeriodDays: 30,
};

test('signed license verifies with matching public key', () => {
  const signed = signLicense(basePayload, privPem);
  assert.equal(verifyLicense(signed, pubPem), true);
});

test('tampered payload fails verification', () => {
  const signed = signLicense(basePayload, privPem);
  signed.payload.plan = 'enterprise';
  assert.equal(verifyLicense(signed, pubPem), false);
});

test('isWithinGrace true inside window', () => {
  assert.equal(isWithinGrace(basePayload), true);
});

test('isWithinGrace true within grace after expiry', () => {
  const expired: LicensePayload = {
    ...basePayload,
    expiresAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
  };
  assert.equal(isWithinGrace(expired), true); // 10d ago < 30d grace
});

test('isWithinGrace false past grace', () => {
  const expired: LicensePayload = {
    ...basePayload,
    expiresAt: new Date(Date.now() - 60 * 86_400_000).toISOString(),
  };
  assert.equal(isWithinGrace(expired), false); // 60d ago > 30d grace
});
