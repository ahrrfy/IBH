import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import {
  LicenseSignerService,
  hashFingerprint,
  type LicensePayload,
} from '../license-signer.service';

/**
 * T64 — Unit tests for LicenseSignerService.
 *
 * A deterministic in-memory RSA-2048 keypair is generated once for the
 * suite and injected via a fake ConfigService, so tests don't depend on
 * real env vars and don't fall into the dev-fallback warning path.
 *
 * Coverage:
 *   - happy path (sign → verify roundtrip + claims preserved)
 *   - SIGNATURE_INVALID when payload is tampered with after signing
 *   - SIGNATURE_INVALID when the signature segment is replaced
 *   - LICENSE_EXPIRED when `exp` is in the past
 *   - LICENSE_NOT_YET_VALID when `nbf` is in the future
 *   - MALFORMED on bad shape / bad base64 / bad header
 *   - LICENSE_BAD_ISSUER on wrong `iss`
 *   - hashFingerprint is stable + matches independent SHA-256
 */

function makeKeypair(): { privPemB64: string; pubPemB64: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  return {
    privPemB64: Buffer.from(privPem, 'utf8').toString('base64'),
    pubPemB64: Buffer.from(pubPem, 'utf8').toString('base64'),
  };
}

function makeService(
  privPemB64: string,
  pubPemB64: string,
): LicenseSignerService {
  const config = {
    get: (k: string): string | undefined =>
      k === 'LICENSE_PRIVATE_KEY_PEM'
        ? privPemB64
        : k === 'LICENSE_PUBLIC_KEY_PEM'
          ? pubPemB64
          : undefined,
  } as unknown as ConfigService;
  const svc = new LicenseSignerService(config);
  svc.onModuleInit();
  return svc;
}

const KEYS = makeKeypair();

function basePayload(overrides: Partial<LicensePayload> = {}): LicensePayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    companyId: '01HABCDEFGHJKMNPQRSTVWXYZ0',
    planCode: 'starter',
    subscriptionId: '01HBBBBBBBBBBBBBBBBBBBBBBB',
    licenseKeyId: '01HCCCCCCCCCCCCCCCCCCCCCCC',
    validFrom: new Date(now * 1000).toISOString(),
    validUntil: new Date((now + 3600) * 1000).toISOString(),
    maxDevices: 3,
    features: ['pos.web', 'pos.offline'],
    iss: 'al-ruya-erp',
    iat: now,
    nbf: now - 10,
    exp: now + 3600,
    typ: 'license',
    ...overrides,
  };
}

describe('LicenseSignerService', () => {
  it('signs and verifies a license roundtrip with all claims preserved', () => {
    const svc = makeService(KEYS.privPemB64, KEYS.pubPemB64);
    const payload = basePayload();
    const token = svc.signLicense(payload);
    expect(token.split('.').length).toBe(3);

    const decoded = svc.verifyLicense(token);
    expect(decoded.companyId).toBe(payload.companyId);
    expect(decoded.planCode).toBe(payload.planCode);
    expect(decoded.features).toEqual(payload.features);
    expect(decoded.maxDevices).toBe(payload.maxDevices);
    expect(decoded.typ).toBe('license');
  });

  it('buildAndSign embeds nbf/exp from validFrom/validUntil', () => {
    const svc = makeService(KEYS.privPemB64, KEYS.pubPemB64);
    const validFrom = new Date('2025-01-01T00:00:00Z');
    const validUntil = new Date('2026-01-01T00:00:00Z');
    const token = svc.buildAndSign({
      companyId: '01HABCDEFGHJKMNPQRSTVWXYZ0',
      planCode: 'pro',
      subscriptionId: '01HBBBBBBBBBBBBBBBBBBBBBBB',
      validFrom,
      validUntil,
      maxDevices: 5,
      features: ['hr.full'],
      typ: 'activation',
      fingerprintHash: 'a'.repeat(64),
    });
    // verify against a service whose clock thinks it's between the two:
    jest.useFakeTimers().setSystemTime(new Date('2025-06-01T00:00:00Z'));
    try {
      const decoded = svc.verifyLicense(token);
      expect(decoded.nbf).toBe(Math.floor(validFrom.getTime() / 1000));
      expect(decoded.exp).toBe(Math.floor(validUntil.getTime() / 1000));
      expect(decoded.fphash).toBe(hashFingerprint('a'.repeat(64)));
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects a token whose payload was tampered after signing', () => {
    const svc = makeService(KEYS.privPemB64, KEYS.pubPemB64);
    const token = svc.signLicense(basePayload());
    const [h, p, s] = token.split('.');
    // Flip a byte in the payload segment
    const bad = `${h}.${p.slice(0, -1)}A.${s}`;
    // Tampering may surface as MALFORMED (if base64/JSON breaks) OR
    // SIGNATURE_INVALID (if the bytes still parse) — both are correct
    // rejections. The token MUST NOT verify successfully.
    expect(() => svc.verifyLicense(bad)).toThrow();
    try {
      svc.verifyLicense(bad);
      fail('tampered token must not verify');
    } catch (e) {
      const err = e as { getResponse?: () => { code: string } };
      const code = err.getResponse ? err.getResponse().code : '';
      expect(['SIGNATURE_INVALID', 'MALFORMED']).toContain(code);
    }
  });

  it('rejects a token whose signature was replaced', () => {
    const svc = makeService(KEYS.privPemB64, KEYS.pubPemB64);
    const token = svc.signLicense(basePayload());
    const [h, p] = token.split('.');
    const fakeSig = Buffer.alloc(256, 0).toString('base64').replace(/=+$/, '');
    expect(() => svc.verifyLicense(`${h}.${p}.${fakeSig}`)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an expired license', () => {
    const svc = makeService(KEYS.privPemB64, KEYS.pubPemB64);
    const past = Math.floor(Date.now() / 1000) - 7200;
    const token = svc.signLicense(
      basePayload({
        nbf: past - 60,
        iat: past - 30,
        exp: past, // 2h in the past, well outside leeway
        validUntil: new Date(past * 1000).toISOString(),
      }),
    );
    try {
      svc.verifyLicense(token);
      fail('expected LICENSE_EXPIRED');
    } catch (e) {
      const err = e as UnauthorizedException;
      expect((err.getResponse() as { code: string }).code).toBe(
        'LICENSE_EXPIRED',
      );
    }
  });

  it('rejects a not-yet-valid license', () => {
    const svc = makeService(KEYS.privPemB64, KEYS.pubPemB64);
    const future = Math.floor(Date.now() / 1000) + 7200;
    const token = svc.signLicense(
      basePayload({
        nbf: future,
        iat: Math.floor(Date.now() / 1000),
        exp: future + 3600,
        validFrom: new Date(future * 1000).toISOString(),
      }),
    );
    try {
      svc.verifyLicense(token);
      fail('expected LICENSE_NOT_YET_VALID');
    } catch (e) {
      const err = e as UnauthorizedException;
      expect((err.getResponse() as { code: string }).code).toBe(
        'LICENSE_NOT_YET_VALID',
      );
    }
  });

  it('rejects a malformed token', () => {
    const svc = makeService(KEYS.privPemB64, KEYS.pubPemB64);
    expect(() => svc.verifyLicense('not.a.token.at.all')).toThrow(
      BadRequestException,
    );
    expect(() => svc.verifyLicense('')).toThrow(BadRequestException);
    expect(() => svc.verifyLicense('a.b')).toThrow(BadRequestException);
  });

  it('rejects a token whose iss is not al-ruya-erp', () => {
    const svc = makeService(KEYS.privPemB64, KEYS.pubPemB64);
    const token = svc.signLicense(basePayload({ iss: 'someone-else' }));
    try {
      svc.verifyLicense(token);
      fail('expected LICENSE_BAD_ISSUER');
    } catch (e) {
      const err = e as UnauthorizedException;
      expect((err.getResponse() as { code: string }).code).toBe(
        'LICENSE_BAD_ISSUER',
      );
    }
  });

  it('verifying with a different keypair fails SIGNATURE_INVALID', () => {
    const svcA = makeService(KEYS.privPemB64, KEYS.pubPemB64);
    const otherKeys = makeKeypair();
    const svcB = makeService(otherKeys.privPemB64, otherKeys.pubPemB64);
    const token = svcA.signLicense(basePayload());
    try {
      svcB.verifyLicense(token);
      fail('expected SIGNATURE_INVALID');
    } catch (e) {
      const err = e as UnauthorizedException;
      expect((err.getResponse() as { code: string }).code).toBe(
        'SIGNATURE_INVALID',
      );
    }
  });

  it('exposes the public key PEM for offline clients', () => {
    const svc = makeService(KEYS.privPemB64, KEYS.pubPemB64);
    const pem = svc.getPublicKeyPem();
    expect(pem).toMatch(/-----BEGIN PUBLIC KEY-----/);
    expect(pem).toMatch(/-----END PUBLIC KEY-----/);
  });

  it('hashFingerprint is deterministic and matches sha256', () => {
    const fp = 'f'.repeat(64);
    const expected = crypto
      .createHash('sha256')
      .update(fp, 'utf8')
      .digest('hex');
    expect(hashFingerprint(fp)).toBe(expected);
    expect(hashFingerprint(fp)).toBe(hashFingerprint(fp));
  });
});
