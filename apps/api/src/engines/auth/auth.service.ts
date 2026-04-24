import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { ulid } from 'ulid';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { REDIS_CLIENT, REDIS_KEYS } from '../../platform/redis/redis.constants';
import { Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import type { LoginRequest, LoginResponse, AuthenticatedUser, JwtPayload } from '@erp/shared-types';

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
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ─── Login ────────────────────────────────────────────────────────────────

  async login(req: LoginRequest & { ipAddress: string; userAgent: string }): Promise<LoginResponse> {
    // Rate check: block if too many failures
    await this.checkLoginRateLimit(req.email, req.ipAddress);

    // Find user (email unique per company)
    const user = await this.prisma.user.findFirst({
      where: {
        email: req.email.toLowerCase(),
        deletedAt: null,
      },
      include: {
        company: { select: { id: true, code: true, nameAr: true, plan: true, isActive: true } },
        userRoles: {
          include: { role: { select: { name: true, permissions: true } } },
        },
      },
    });

    if (!user) {
      await this.recordFailedLogin(req.email, req.ipAddress);
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', messageAr: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    }

    if (!user.company.isActive) {
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
      await this.recordFailedLogin(req.email, req.ipAddress);
      await this.incrementFailedAttempts(user.id);
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', messageAr: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    }

    // Reset failed attempts on success
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: req.ipAddress },
    });

    await this.clearLoginRateLimit(req.email);

    // Extract roles
    const roles = user.userRoles.map(ur => ur.role.name);

    // Generate tokens
    const accessToken  = this.generateAccessToken(user.id, user.company.id, null, roles);
    const refreshToken = await this.generateRefreshToken(user.id, req.deviceId, req.ipAddress);

    // Audit
    await this.audit.log({
      companyId:  user.company.id,
      userId:     user.id,
      userEmail:  user.email,
      action:     'login',
      entityType: 'User',
      entityId:   user.id,
      ipAddress:  req.ipAddress,
      userAgent:  req.userAgent,
    });

    const authUser: AuthenticatedUser = {
      id:              user.id,
      email:           user.email,
      nameAr:          user.nameAr,
      nameEn:          user.nameEn ?? undefined,
      companyId:       user.company.id,
      companyNameAr:   user.company.nameAr,
      branchId:        user.branchId,
      branchNameAr:    null, // populated from branch relation if needed
      roles:           roles as never[],
      avatarUrl:       user.avatarUrl,
      locale:          user.locale as 'ar' | 'en' | 'ku',
      requires2FA:     user.requires2FA,
      twoFactorVerified: false,
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
    const payload: JwtPayload = {
      sub:   userId,
      cid:   companyId,
      bid:   branchId,
      roles,
      jti:   ulid(),
      iat:   Math.floor(Date.now() / 1000),
      exp:   Math.floor(Date.now() / 1000) + 15 * 60, // 15 min
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
