import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { CustomerAuthService } from './customer-auth.service';

/**
 * Guards customer-portal endpoints. Verifies a customer JWT (separate audience
 * + secret from the staff JWT) and sets `req.customerId`. Used together with
 * `@Public()` to bypass the global staff JwtAuthGuard.
 */
@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(private readonly auth: CustomerAuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { customerId?: string; customerPhone?: string }>();
    const header = req.headers?.authorization;
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', messageAr: 'يجب تسجيل الدخول' });
    }
    const token = header.slice('bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', messageAr: 'يجب تسجيل الدخول' });
    }
    const payload = await this.auth.verifyToken(token);
    req.customerId = payload.sub;
    req.customerPhone = payload.phone;
    return true;
  }
}
