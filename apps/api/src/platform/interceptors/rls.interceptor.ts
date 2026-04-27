import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import type { UserSession } from '@erp/shared-types';

/**
 * RLS Interceptor
 *
 * Runs BEFORE every controller method (after authentication).
 * Sets PostgreSQL session variables so Row Level Security policies
 * automatically filter data to the authenticated user's company.
 *
 * Security guarantee: Even if a controller accidentally queries the wrong
 * company's data, PostgreSQL RLS blocks it at the DB level.
 *
 * Must be registered as APP_INTERCEPTOR AFTER JwtAuthGuard so that
 * request.user is already populated.
 */
@Injectable()
export class RlsInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RlsInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      user?: UserSession;
      rlsSet?: boolean;
    }>();

    const session = request.user;

    // Public routes (no user session) — skip RLS
    if (!session) {
      return next.handle();
    }

    // Avoid setting twice per request (e.g. from nested interceptors)
    if (request.rlsSet) {
      return next.handle();
    }

    request.rlsSet = true;

    // We use a standard Observable to keep the RLS context synchronous with the request.
    // The actual DB calls inside controllers will use the same connection pool session.
    return new Observable(observer => {
      this.prisma
        .setRlsContext(session.companyId, session.userId)
        .then(() => {
          next.handle().subscribe({
            next:     (value) => observer.next(value),
            error:    (err)   => observer.error(err),
            complete: ()      => observer.complete(),
          });
        })
        .catch(err => {
          // FAIL-CLOSED: if we can't set the RLS session vars we cannot guarantee
          // company-scoped queries — refuse the request rather than risk cross-company
          // data exposure if any policy uses USING (true) as a fallback.
          this.logger.error('Failed to set RLS context — refusing request', err);
          observer.error(
            new InternalServerErrorException({
              code: 'RLS_CONTEXT_FAILED',
              messageAr: 'تعذّر تأمين سياق الجلسة — حاول لاحقاً',
              messageEn: 'Failed to establish security context — please retry',
            }),
          );
        });
    });
  }
}
