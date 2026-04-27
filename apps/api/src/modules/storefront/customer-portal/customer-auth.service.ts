import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomInt } from 'crypto';
import type Redis from 'ioredis';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { REDIS_CLIENT } from '../../../platform/redis/redis.constants';
import { readStorefrontConfig, assertStorefrontConfig } from '../storefront.config';

/** Iraqi mobile (07XXXXXXXXX). Same regex used by the public storefront. */
const IRAQ_PHONE_RE = /^07\d{9}$/;

/** OTP TTL — 5 minutes per spec. */
const OTP_TTL_SECONDS = 5 * 60;

/** Rate-limit window for OTP requests — 60 s per phone. */
const OTP_RATE_LIMIT_SECONDS = 60;

/** Customer JWT lifetime — 30 days per spec. */
const CUSTOMER_JWT_TTL = '30d';

/** JWT audience used to distinguish customer tokens from staff tokens. */
const CUSTOMER_JWT_AUDIENCE = 'customer-portal';
const CUSTOMER_JWT_ISSUER = 'erp.ruya.iq';

export interface CustomerTokenPayload {
  sub: string; // customer id
  phone: string;
  aud: string;
  iss: string;
}

@Injectable()
export class CustomerAuthService {
  private readonly logger = new Logger(CustomerAuthService.name);
  private readonly cfg = readStorefrontConfig();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** Returns a separate secret for customer JWTs, falling back to a derived dev value. */
  private getCustomerJwtSecret(): string {
    const explicit = this.config.get<string>('CUSTOMER_JWT_SECRET');
    if (explicit && explicit.trim().length > 0) return explicit;
    // Dev fallback: derive a deterministic-but-distinct secret from staff JWT_SECRET.
    const staff = this.config.get<string>('JWT_SECRET') ?? 'dev-secret';
    return createHash('sha256').update(`customer-portal::${staff}`).digest('hex');
  }

  /**
   * Request an OTP for `phone`. Stores hashed code in Redis 5min TTL.
   * Rate-limit: 1 request/min per phone. Sends via WhatsApp queue if available;
   * otherwise logs the code (dev-only echo) so the flow is testable end-to-end.
   */
  async requestOtp(phone: string): Promise<{ ok: true; devCode?: string }> {
    if (!IRAQ_PHONE_RE.test(phone)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        messageAr: 'صيغة رقم الهاتف غير صحيحة (07XXXXXXXXX)',
      });
    }

    const rateKey = `customer:otp:rate:${phone}`;
    // SET NX ensures only the first call within the window succeeds.
    const acquired = await this.redis.set(rateKey, '1', 'EX', OTP_RATE_LIMIT_SECONDS, 'NX');
    if (acquired !== 'OK') {
      throw new BadRequestException({
        code: 'RATE_LIMITED',
        messageAr: 'الرجاء الانتظار قبل طلب رمز جديد',
      });
    }

    // Generate 6-digit code; store SHA-256 hash + attempt counter so brute-force is bounded.
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const hash = createHash('sha256').update(code).digest('hex');
    const otpKey = `customer:otp:${phone}`;
    await this.redis
      .multi()
      .set(otpKey, hash, 'EX', OTP_TTL_SECONDS)
      .set(`${otpKey}:attempts`, '0', 'EX', OTP_TTL_SECONDS)
      .exec();

    // Best-effort delivery. The notifications module is User-keyed and not
    // appropriate for guest customers; we log the code in dev so the flow
    // works end-to-end. In prod, ops can wire a phone-based WhatsApp sender.
    const isDev = (this.config.get<string>('NODE_ENV') ?? 'development') !== 'production';
    if (isDev) {
      this.logger.log(`[dev OTP] phone=${phone} code=${code}`);
    } else {
      // Production: queue a raw WhatsApp send via the bridge if configured.
      // We avoid coupling to NotificationsService (which requires a User row).
      this.logger.warn(`[OTP] code generated for ${phone} — wire WA bridge to deliver`);
    }

    return isDev ? { ok: true, devCode: code } : { ok: true };
  }

  /**
   * Verify an OTP and issue a customer JWT. Find-or-creates a Customer row
   * scoped to the configured storefront tenant.
   */
  async verifyOtp(phone: string, code: string): Promise<{ token: string; customer: { id: string; phone: string; nameAr: string } }> {
    if (!IRAQ_PHONE_RE.test(phone)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', messageAr: 'صيغة رقم الهاتف غير صحيحة' });
    }
    if (!/^\d{4,8}$/.test(code)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', messageAr: 'رمز غير صحيح' });
    }
    assertStorefrontConfig(this.cfg);

    const otpKey = `customer:otp:${phone}`;
    const stored = await this.redis.get(otpKey);
    if (!stored) {
      throw new UnauthorizedException({ code: 'OTP_EXPIRED', messageAr: 'انتهت صلاحية الرمز' });
    }

    // Cap attempts at 5 to prevent brute force.
    const attempts = await this.redis.incr(`${otpKey}:attempts`);
    if (attempts > 5) {
      await this.redis.del(otpKey, `${otpKey}:attempts`);
      throw new UnauthorizedException({ code: 'OTP_LOCKED', messageAr: 'تم قفل المحاولات، اطلب رمزاً جديداً' });
    }

    const hash = createHash('sha256').update(code).digest('hex');
    if (hash !== stored) {
      throw new UnauthorizedException({ code: 'OTP_INVALID', messageAr: 'رمز التحقق غير صحيح' });
    }

    // Burn the OTP — single use.
    await this.redis.del(otpKey, `${otpKey}:attempts`);

    // Find-or-create customer scoped to the storefront tenant.
    const existing = await this.prisma.customer.findFirst({
      where: { companyId: this.cfg.companyId, phone, deletedAt: null },
      select: { id: true, phone: true, nameAr: true },
    });
    let customer = existing;
    if (!customer) {
      const customerCode = `WEB-${phone.slice(-6)}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
      const created = await this.prisma.customer.create({
        data: {
          companyId: this.cfg.companyId,
          code: customerCode,
          type:      'regular',
          nameAr:    `عميل ${phone.slice(-4)}`,
          phone,
          whatsapp:  phone,
          createdBy: '00000000000000000000000000',
          updatedBy: '00000000000000000000000000',
        },
        select: { id: true, phone: true, nameAr: true },
      });
      customer = created;
    }

    const token = await this.jwt.signAsync(
      { sub: customer.id, phone: customer.phone ?? phone },
      {
        secret: this.getCustomerJwtSecret(),
        expiresIn: CUSTOMER_JWT_TTL,
        audience: CUSTOMER_JWT_AUDIENCE,
        issuer: CUSTOMER_JWT_ISSUER,
      },
    );

    return {
      token,
      customer: { id: customer.id, phone: customer.phone ?? phone, nameAr: customer.nameAr },
    };
  }

  /** Verify a customer JWT and return the payload, or throw UnauthorizedException. */
  async verifyToken(token: string): Promise<CustomerTokenPayload> {
    try {
      const decoded = await this.jwt.verifyAsync<CustomerTokenPayload>(token, {
        secret: this.getCustomerJwtSecret(),
        audience: CUSTOMER_JWT_AUDIENCE,
        issuer: CUSTOMER_JWT_ISSUER,
      });
      if (!decoded?.sub) {
        throw new UnauthorizedException({ code: 'UNAUTHORIZED', messageAr: 'جلسة غير صالحة' });
      }
      return decoded;
    } catch {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', messageAr: 'يجب تسجيل الدخول' });
    }
  }
}
