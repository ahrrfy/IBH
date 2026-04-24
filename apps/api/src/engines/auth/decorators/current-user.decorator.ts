import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserSession } from '@erp/shared-types';

/**
 * Extracts the authenticated user session from request.user.
 * Set by JwtStrategy.validate() after token verification.
 *
 * @example
 * async getMe(@CurrentUser() user: UserSession) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserSession => {
    const request = ctx.switchToHttp().getRequest<{ user: UserSession }>();
    return request.user;
  },
);
