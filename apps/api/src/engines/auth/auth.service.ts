import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'crypto';
import * as argon2 from 'argon2';
import { ulid } from 'ulid';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TotpService } from './totp.service';
import { REDIS_CLIENT, REDIS_KEYS } from '../../platform/redis/redis.constants';
import { Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import type { LoginRequest, LoginResponse, AuthenticatedUser, JwtPayload } from '@erp/shared-types';
import type { Prisma } from '@prisma/client';

/** Shape of the User row fetched in login flows — includes company + userRoles */
type LoginUser = Prisma.UserGetPayload<{
  include: {
    company: { select: { id: true; code: true; nameAr: true; plan: true; isActive: true } };
    userRoles: { include: { role: { select: { name: true; permissions: true } } } };
  };
}>;

// Result of step 1 (password verified) — second step requires TOTP code
export interface MfaChallenge {
  requires2FA: true;
  mfaToken: string;          // short-lived token, exchanged for full JWT
  userId: string;
  hint: string;              // 'authenticator' | 'backup_code'
}

export type LoginResult = LoginResponse | MfaChallenge;

const MFA_TOKEN_TTL_SECONDS = 5 * 60; // 5 minutes

// ─── Auth Service ─────────────────────────────────────────────────────────────
// Implements: login, refresh, logout, 2FA, password management
// Security:   Argon2id, JWT, TOTP, brute-force protection, session tracking

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const ACCESS_TOKEN_EXPIRES = '15m';
const REFRESH_TOKEN_EXPIRES_DAYS = 30;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly totp: TotpService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ─── Login ────────────────────────────────────────────────────────────────
  // Two-step:
  //   Step 1: emailOrUsername + password → either full LoginResponse, or
  //           MfaChallenge { requires2FA, mfaToken } if user has TOTP enabled.
  //   Step 2: verifyMfaAndLogin(mfaToken, code) → full LoginResponse.

  async login(req: {
    emailOrUsername?: string;
    email?: string;             // legacy
    password: string;
    deviceId?: string;
    ipAddress: string;
    userAgent: string;
  }): Promise<LoginResult> {
    const identifier = (req.emailOrUsername ?? req.email ?? '').trim().toLowerCase();
    if (!identifier) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', messageAr: 'البريد أو اسم المستخدم مطلوب' });
    }

    // Rate check by identifier + IP
    await this.checkLoginRateLimit(identifier, req.ipAddress);

    // Find user — by username (global unique) OR by email (company-scoped, take first)
    const user = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { username: identifier },
          { email: identifier },
        ],
      },
      include: {
        company: { select: { id: true, code: true, nameAr: true, plan: true, isActive: true } },
        userRoles: { include: { role: { select: { name: true, permissions: true } } } },
      },
    });

    if (!user) {
      await this.recordFailedLogin(identifier, req.ipAddress);
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', messageAr: 'بيانات الدخول غير صحيحة' });
    }

    if (!user.company.isActive && !user.isSystemOwner) {
      throw new ForbiddenException({ code: 'FORBIDDEN', messageAr: 'الشركة غير نشطة' });
    }

    if (user.status === 'locked' && user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_LOCKED',
        messageAr: `الحساب مقفل حتى ${user.lockedUntil.toLocaleString('ar-IQ')}`,
      });
    }

    if (user.status === 'inactive') {
      throw new ForbiddenException({ code: 'FORBIDDEN', messageAr: 'الحساب غير نشط' });
    }

    // Verify password
    const passwordValid = await argon2.verify(user.passwordHash, req.password);
    if (!passwordValid) {
      await this.recordFailedLogin(identifier, req.ipAddress);
      await this.incrementFailedAttempts(user.id);
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', messageAr: 'بيانات الدخول غير صحيحة' });
    }

    const roles = user.userRoles.map((ur) => ur.role.name);

    // ─── 2FA branch ────────────────────────────────────────────────────
    // If user has 2FA enabled OR policy mandates it but they haven't set up,
    // we issue an MFA challenge instead of a full session.
    if (user.requires2FA) {
      // Issue short-lived MFA token, store in Redis
      const mfaToken = randomUUID();
      const payload = {
        userId: user.id,
        deviceId: req.deviceId ?? randomUUID(),
        ipAddress: req.ipAddress,
        userAgent: req.userAgent,
        roles,
        ts: Date.now(),
      };
      await this.redis.setex(
        REDIS_KEYS.loginAttempts(`mfa:${mfaToken}`),
        MFA_TOKEN_TTL_SECONDS,
        JSON.stringify(payload),
      );
      return {
        requires2FA: true,
        mfaToken,
        userId: user.id,
        hint: 'authenticator',
      };
    }

    // ─── Direct login (no 2FA) ─────────────────────────────────────────
    return this.completeLogin({
      user,
      roles,
      deviceId: req.deviceId ?? randomUUID(),
      ipAddress: req.ipAddress,
      userAgent: req.userAgent,
    });
  }

  /**
   * Step 2 of login: exchange MFA token + TOTP code for full session.
   */
  async verifyMfaAndLogin(
    mfaToken: string,
    code: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<LoginResponse> {
    const key = REDIS_KEYS.loginAttempts(`mfa:${mfaToken}`);
    const raw = await this.redis.get(key);
    if (!raw) {
      throw new UnauthorizedException({ code: 'MFA_TOKEN_EXPIRED', messageAr: 'انتهت صلاحية رمز المصادقة، حاول مجدداً' });
    }
    const payload = JSON.parse(raw) as { userId: string; deviceId: string; ipAddress: string; roles: string[] };

    const ok = await this.totp.verifyCode(payload.userId, code);
    if (!ok) {
      throw new UnauthorizedException({ code: 'TOTP_INVALID_CODE', messageAr: 'الرمز غير صحيح' });
    }

    // Single-use: delete the MFA token
    await this.redis.del(key);

    // Re-fetch user (for completeLogin)
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        company: { select: { id: true, code: true, nameAr: true, plan: true, isActive: true } },
        userRoles: { include: { role: { select: { name: true, permissions: true } } } },
      },
    });
    if (!user) throw new UnauthorizedException({ code: 'UNAUTHORIZED', messageAr: 'المستخدم غير موجود' });

    return this.completeLogin({
      user,
      roles: payload.roles,
      deviceId: payload.deviceId,
      ipAddress,
      userAgent,
    });
  }

  /** Internal — both direct + post-MFA paths converge here */
  private async completeLogin(params: {
    user: LoginUser;
    roles: string[];
    deviceId: string;
    ipAddress: string;
    userAgent: string;
  }): Promise<LoginResponse> {
    const { user, roles, deviceId, ipAddress, userAgent } = params;

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress,
      },
    });

    await this.clearLoginRateLimit(user.email);
    if (user.username) await this.clearLoginRateLimit(user.username);

    const accessToken  = this.generateAccessToken(user.id, user.companyId, user.branchId, roles);
    const refreshToken = await this.generateRefreshToken(user.id, deviceId, ipAddress);

    await this.audit.log({
      companyId:  user.companyId,
      userId:     user.id,
      userEmail:  user.email,
      action:     'login',
      entityType: 'User',
      entityId:   user.id,
      ipAddress,
      userAgent,
    });

    const authUser: AuthenticatedUser = {
      id:              user.id,
      email:           user.email,
      nameAr:          user.nameAr,
      nameEn:          user.nameEn ?? undefined,
      companyId:       user.companyId,
      companyNameAr:   user.company?.nameAr ?? '',
      branchId:        user.branchId,
      branchNameAr:    null,
      roles:           roles as never[],
      avatarUrl:       user.avatarUrl,
      locale:          (user.locale ?? 'ar') as 'ar' | 'en' | 'ku',
      requires2FA:     user.requires2FA,
      twoFactorVerified: user.requires2FA,
      isSystemOwner:   user.isSystemOwner ?? false,
    };

    return { accessToken, refreshToken, user: authUser };
  }

  // ─── Token Generation ─────────────────────────────────────────────────────

  private generateAccessToken(
    userId: string,
    companyId: string,
    branchId: string | null,
    roles: string[],
  ): string {
    // Don't set iat/exp manually — JwtModule's signOptions.expiresIn handles it
    const payload = {
      sub:   userId,
      cid:   companyId,
      bid:   branchId,
      roles,
      jti:   ulid(),
    };
    return this.jwtService.sign(payload);
  }

  private async generateRefreshToken(
    userId: string,
    deviceId: string,
    ipAddress: string,
  ): Promise<string> {
    const token = randomBytes(48).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 86400_000);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, deviceId, deviceType: 'web', ipAddress, expiresAt },
    });

    return token;
  }

  // ─── Refresh Token ────────────────────────────────────────────────────────

  async refresh(refreshToken: string, ipAddress: string): Promise<{ accessToken: string }> {
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: { userRoles: { include: { role: true } } },
        },
      },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException({ code: 'TOKEN_EXPIRED', messageAr: 'انتهت صلاحية الجلسة' });
    }

    const roles = stored.user.userRoles.map(ur => ur.role.name);
    const accessToken = this.generateAccessToken(
      stored.userId,
      stored.user.companyId,
      stored.user.branchId,
      roles,
    );

    return { accessToken };
  }

  // ─── Logout ───────────────────────────────────────────────────────────────

  async logout(userId: string, refreshToken: string): Promise<void> {
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    await this.prisma.refreshToken.updateMany({
      where: { userId, tokenHash },
      data: { revokedAt: new Date() },
    });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    // Revoke all active JWTs via Redis blacklist
    await this.redis.setex(REDIS_KEYS.revokedToken(userId), 86400, '1');
  }

  // ─── Password Hashing ─────────────────────────────────────────────────────

  async hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain, {
      type:      argon2.argon2id,
      memoryCost: 65536,  // 64 MB
      timeCost:   3,
      parallelism: 4,
    });
  }

  async changePassword(params: {
    userId: string;
    companyId: string;
    currentPassword: string;
    newPassword: string;
    ipAddress: string;
    userEmail: string;
  }): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: params.userId } });

    const valid = await argon2.verify(user.passwordHash, params.currentPassword);
    if (!valid) throw new BadRequestException({ code: 'UNAUTHORIZED', messageAr: 'كلمة المرور الحالية غير صحيحة' });

    const newHash = await this.hashPassword(params.newPassword);
    await this.prisma.user.update({
      where: { id: params.userId },
      data: { passwordHash: newHash, updatedBy: params.userId },
    });

    // Revoke all sessions after password change
    await this.logoutAll(params.userId);

    await this.audit.log({
      companyId:  params.companyId,
      userId:     params.userId,
      userEmail:  params.userEmail,
      action:     'password_changed',
      entityType: 'User',
      entityId:   params.userId,
      ipAddress:  params.ipAddress,
    });
  }

  // ─── Brute Force Protection ───────────────────────────────────────────────

  private async checkLoginRateLimit(email: string, ip: string): Promise<void> {
    const emailKey = REDIS_KEYS.loginAttempts(email);
    const ipKey    = REDIS_KEYS.loginAttempts(ip);
    const [emailCount, ipCount] = await Promise.all([
      this.redis.get(emailKey),
      this.redis.get(ipKey),
    ]);

    if (Number(emailCount) >= MAX_FAILED_ATTEMPTS || Number(ipCount) >= MAX_FAILED_ATTEMPTS * 3) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_LOCKED',
        messageAr: `تم تجاوز عدد المحاولات. حاول مجدداً بعد ${LOCKOUT_MINUTES} دقيقة`,
      });
    }
  }

  private async recordFailedLogin(email: string, ip: string): Promise<void> {
    const ttl = LOCKOUT_MINUTES * 60;
    await Promise.all([
      this.redis.incr(REDIS_KEYS.loginAttempts(email)).then(() =>
        this.redis.expire(REDIS_KEYS.loginAttempts(email), ttl),
      ),
      this.redis.incr(REDIS_KEYS.loginAttempts(ip)).then(() =>
        this.redis.expire(REDIS_KEYS.loginAttempts(ip), ttl),
      ),
    ]);
  }

  private async clearLoginRateLimit(email: string): Promise<void> {
    await this.redis.del(REDIS_KEYS.loginAttempts(email));
  }

  private async incrementFailedAttempts(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { failedLoginCount: true },
    });

    if (!user) return;

    const newCount = (user.failedLoginCount ?? 0) + 1;
    const shouldLock = newCount >= MAX_FAILED_ATTEMPTS;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: newCount,
        status:           shouldLock ? 'locked' : undefined,
        lockedUntil:      shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : undefined,
      },
    });
  }
}
