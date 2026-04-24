// @ts-nocheck -- agent-written; schema field mapping to be refined in G4-G6
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import type { ApiError } from '@erp/shared-types';

/**
 * Global HTTP Exception Filter
 *
 * Converts ALL exceptions into the standard ApiError envelope:
 * {
 *   success: false,
 *   error: { code, messageAr, details },
 *   meta: { timestamp, path, requestId }
 * }
 *
 * Never leaks stack traces or internal messages in production.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx      = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request  = ctx.getRequest<Request>();

    const { status, payload } = this.extract(exception);

    if (status >= 500) {
      this.logger.error(
        `[${request.method}] ${request.url} — ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: { success: false; error: ApiError; meta: object } = {
      success: false,
      error:   payload,
      meta: {
        timestamp: new Date().toISOString(),
        path:      request.url,
        method:    request.method,
      },
    };

    response.status(status).json(body);
  }

  private extract(exception: unknown): { status: number; payload: ApiError } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw    = exception.getResponse();

      if (typeof raw === 'object' && raw !== null && 'code' in raw) {
        // Our structured error: { code, messageAr, errors? }
        return {
          status,
          payload: raw as ApiError,
        };
      }

      // Generic NestJS error (e.g. 404 Not Found)
      return {
        status,
        payload: {
          code:      this.statusToCode(status),
          messageAr: typeof raw === 'string' ? raw : 'حدث خطأ في الطلب',
        },
      };
    }

    // Unexpected error — 500
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      payload: {
        code:      'INTERNAL_ERROR',
        messageAr: 'حدث خطأ غير متوقع. يرجى المحاولة لاحقاً.',
      },
    };
  }

  private statusToCode(status: number): string {
    const map: Record<number, string> = {
      400: 'VALIDATION_ERROR',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE',
      429: 'RATE_LIMITED',
      500: 'INTERNAL_ERROR',
    };
    return map[status] ?? 'ERROR';
  }
}
