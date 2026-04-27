import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * T64 — License Signer Service.
 *
 * Issues and verifies RSA-2048 signed license tokens in a compact
 * JWT-style envelope:
 *
 *   base64url(header) "." base64url(payload) "." base64url(signature)
 *
 * Header is fixed: `{"alg":"RS256","typ":"LIC"}`. Signature is computed
 * over the ASCII bytes of `<header>.<payload>` using `RSASSA-PKCS1-v1_5`
 * with SHA-256 (Node's `crypto.createSign('RSA-SHA256')`).
 *
 * The service is offline-verifiable by design: any client (Tauri Desktop
 * / POS / Web) can bundle the public key and call `verifyLicense` with
 * zero network round-trip.
 *
 * ## Key material
 *
 * Loaded from env on module init:
 *   - `LICENSE_PRIVATE_KEY_PEM` — base64-encoded RSA-2048 PEM (PKCS#8)
 *   - `LICENSE_PUBLIC_KEY_PEM`  — base64-encoded RSA-2048 PEM (SPKI)
 *
 * If either is missing, a dev keypair is generated in-memory and a
 * loud warning is logged. **Production must set both env vars** so
 * the signing key is stable across restarts.
 */

/** Canonical claims embedded in every license token. */
export interface LicensePayload {
  /** Tenant the license is bound to. */
  companyId: string;
  /** Plan code the subscription resolves to (e.g. `starter`, `pro`). */
  planCode: string;
  /** Subscription row this token was minted from. */
  subscriptionId: string;
  /** Optional license-key DB row id (set on the long-lived token). */
  licenseKeyId?: string;
  /** ISO-8601 instant the license becomes valid. */
  validFrom: string;
  /** ISO-8601 instant the license stops being valid. */
  validUntil: string;
  /** Hard cap on bound hardware fingerprints. */
  maxDevices: number;
  /** Feature codes enabled for the tenant. */
  features: string[];
  /** Issuer — fixed to `al-ruya-erp` for this product. */
  iss: string;
  /** Issued-at, seconds since epoch. */
  iat: number;
  /** Not-before, seconds since epoch. */
  nbf: number;
  /** Expires-at, seconds since epoch. */
  exp: number;
  /**
   * Optional binding hash — set on short-lived activation tokens to
   * cryptographically tie the token to a specific device fingerprint.
   * Format: lowercase hex SHA-256(fingerprintHash).
   */
  fphash?: string;
  /** Token type — `license` (long-lived) or `activation` (short-lived). */
  typ: 'license' | 'activation';
}

const HEADER = { alg: 'RS256', typ: 'LIC' } as const;
const HEADER_B64URL = base64url(JSON.stringify(HEADER));
const ISSUER = 'al-ruya-erp';

@Injectable()
export class LicenseSignerService implements OnModuleInit {
  private readonly logger = new Logger(LicenseSignerService.name);
  private privateKey!: crypto.KeyObject;
  private publicKeyPem!: string;
  private publicKey!: crypto.KeyObject;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const privB64 = this.config.get<string>('LICENSE_PRIVATE_KEY_PEM');
    const pubB64 = this.config.get<string>('LICENSE_PUBLIC_KEY_PEM');

    if (privB64 && pubB64) {
      const privPem = Buffer.from(privB64, 'base64').toString('utf8');
      const pubPem = Buffer.from(pubB64, 'base64').toString('utf8');
      try {
        this.privateKey = crypto.createPrivateKey(privPem);
        this.publicKey = crypto.createPublicKey(pubPem);
        this.publicKeyPem = pubPem;
      } catch (err) {
        throw new Error(
          `LICENSE_PRIVATE_KEY_PEM / LICENSE_PUBLIC_KEY_PEM are set but invalid: ${(err as Error).message}`,
        );
      }
      this.logger.log('License signer loaded RSA-2048 key material from env');
      return;
    }

    // Dev fallback — generate ephemeral keypair so the API still boots.
    // In production, NEVER ship without these env vars set.
    this.logger.warn(
      '⚠️  LICENSE_PRIVATE_KEY_PEM / LICENSE_PUBLIC_KEY_PEM not set — ' +
        'generating EPHEMERAL dev keypair. License tokens will be invalidated ' +
        'on every API restart. SET THESE ENV VARS BEFORE PRODUCTION DEPLOY.',
    );
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    this.privateKey = privateKey;
    this.publicKey = publicKey;
    this.publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  }

  /**
   * Sign a payload with the server private key. Caller supplies semantic
   * claims; `iss`/`iat`/`nbf`/`exp`/`typ` may be set by caller and are
   * passed through verbatim. Returns a JWT-style compact token.
   */
  signLicense(payload: LicensePayload): string {
    const payloadB64url = base64url(JSON.stringify(payload));
    const signingInput = `${HEADER_B64URL}.${payloadB64url}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signingInput);
    signer.end();
    const signature = signer.sign(this.privateKey);
    return `${signingInput}.${base64urlBuf(signature)}`;
  }

  /**
   * Verify a token's signature and time-window claims, then return the
   * decoded payload. Throws domain-specific errors so callers can
   * branch on `code` for UX:
   *
   *   - `MALFORMED`            — wrong segment count, bad base64, bad JSON
   *   - `SIGNATURE_INVALID`    — public key did not validate the signature
   *   - `LICENSE_EXPIRED`      — `now > exp`
   *   - `LICENSE_NOT_YET_VALID` — `now < nbf`
   *   - `LICENSE_BAD_ISSUER`   — `iss !== 'al-ruya-erp'`
   *
   * Time window is checked with a 30-second leeway to absorb clock skew
   * between API and clients (POS terminals on consumer hardware drift).
   */
  verifyLicense(token: string): LicensePayload {
    if (typeof token !== 'string' || token.length === 0) {
      throw new BadRequestException({
        code: 'MALFORMED',
        messageAr: 'صيغة الترخيص غير صحيحة',
      });
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new BadRequestException({
        code: 'MALFORMED',
        messageAr: 'صيغة الترخيص غير صحيحة',
      });
    }
    const [headerB64url, payloadB64url, signatureB64url] = parts;

    let header: { alg?: string; typ?: string };
    let payload: LicensePayload;
    try {
      header = JSON.parse(base64urlDecode(headerB64url).toString('utf8'));
      payload = JSON.parse(base64urlDecode(payloadB64url).toString('utf8'));
    } catch {
      throw new BadRequestException({
        code: 'MALFORMED',
        messageAr: 'تعذّر قراءة محتوى الترخيص',
      });
    }

    if (header.alg !== 'RS256' || header.typ !== 'LIC') {
      throw new BadRequestException({
        code: 'MALFORMED',
        messageAr: 'نوع الترخيص غير مدعوم',
      });
    }

    const signingInput = `${headerB64url}.${payloadB64url}`;
    let signatureBuf: Buffer;
    try {
      signatureBuf = base64urlDecode(signatureB64url);
    } catch {
      throw new BadRequestException({
        code: 'MALFORMED',
        messageAr: 'توقيع الترخيص غير صحيح الترميز',
      });
    }

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(signingInput);
    verifier.end();
    let ok = false;
    try {
      ok = verifier.verify(this.publicKey, signatureBuf);
    } catch {
      ok = false;
    }
    if (!ok) {
      throw new UnauthorizedException({
        code: 'SIGNATURE_INVALID',
        messageAr: 'توقيع الترخيص غير صالح',
      });
    }

    if (payload.iss !== ISSUER) {
      throw new UnauthorizedException({
        code: 'LICENSE_BAD_ISSUER',
        messageAr: 'مُصدر الترخيص غير معروف',
      });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const LEEWAY_SEC = 30;
    if (typeof payload.nbf === 'number' && nowSec + LEEWAY_SEC < payload.nbf) {
      throw new UnauthorizedException({
        code: 'LICENSE_NOT_YET_VALID',
        messageAr: 'الترخيص لم يصبح نافذاً بعد',
      });
    }
    if (typeof payload.exp === 'number' && nowSec - LEEWAY_SEC > payload.exp) {
      throw new UnauthorizedException({
        code: 'LICENSE_EXPIRED',
        messageAr: 'انتهت صلاحية الترخيص',
      });
    }

    return payload;
  }

  /** Public-key PEM, suitable for serving to offline clients. */
  getPublicKeyPem(): string {
    return this.publicKeyPem;
  }

  /**
   * Convenience — build a fully-claimed payload from semantic inputs and
   * sign it. Use this from controllers/services so claim shape stays
   * consistent across `issue` / `activate` / `renew`.
   */
  buildAndSign(args: {
    companyId: string;
    planCode: string;
    subscriptionId: string;
    licenseKeyId?: string;
    validFrom: Date;
    validUntil: Date;
    maxDevices: number;
    features: string[];
    typ: 'license' | 'activation';
    fingerprintHash?: string;
  }): string {
    const iat = Math.floor(Date.now() / 1000);
    const payload: LicensePayload = {
      companyId: args.companyId,
      planCode: args.planCode,
      subscriptionId: args.subscriptionId,
      licenseKeyId: args.licenseKeyId,
      validFrom: args.validFrom.toISOString(),
      validUntil: args.validUntil.toISOString(),
      maxDevices: args.maxDevices,
      features: args.features,
      iss: ISSUER,
      iat,
      nbf: Math.floor(args.validFrom.getTime() / 1000),
      exp: Math.floor(args.validUntil.getTime() / 1000),
      typ: args.typ,
      fphash: args.fingerprintHash
        ? hashFingerprint(args.fingerprintHash)
        : undefined,
    };
    return this.signLicense(payload);
  }
}

/**
 * Hash a fingerprint hash (yes, again) so the activation token does not
 * carry the raw device fingerprint as a claim. Clients re-hash their
 * fingerprint and compare.
 */
export function hashFingerprint(fingerprintHash: string): string {
  return crypto.createHash('sha256').update(fingerprintHash, 'utf8').digest('hex');
}

// ---------- base64url helpers (RFC 7515 §2) ---------------------------------

function base64url(input: string): string {
  return base64urlBuf(Buffer.from(input, 'utf8'));
}

function base64urlBuf(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64');
}
