import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { REDIS_CLIENT, REDIS_KEYS } from '../../../platform/redis/redis.constants';
import type Redis from 'ioredis';
import type { JwtPayload, UserSession } from '@erp/shared-types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey:    config.getOrThrow<string>('JWT_SECRET'),
      issuer:         'erp.ruya.iq',
      audience:       'erp-api',
    });
  }

  async validate(payload: JwtPayload): Promise<UserSession> {
    // Check if user was globally logged out (password change, etc.)
    const revoked = await this.redis.exists(REDIS_KEYS.revokedToken(payload.sub));
    if (revoked) {
      throw new UnauthorizedException({ code: 'TOKEN_EXPIRED', messageAr: 'انتهت صلاحية الجلسة' });
    }

    // Return the session object — injected as request.user
    const session: UserSession = {
      userId:             payload.sub,
      companyId:          payload.cid,
      branchId:           payload.bid,
      tenantId:           payload.cid,
      roles:              payload.roles as never[],
      permissions:        [], // populated on demand by RbacGuard
      locale:             'ar',
      expiresAt:          new Date(payload.exp * 1000).toISOString(),
      deviceId:           '',
      ipAddress:          '',
    };

    return session;
  }
}
