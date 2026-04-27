import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../engines/auth/decorators/public.decorator';
import { OnlineOrdersService } from './online-orders.service';

/**
 * Online-orders controller (T55).
 *
 * Two surfaces, both public (no auth):
 *
 *   POST /payments/webhook/:gateway
 *     Provider-side IPN. Each gateway's `parseWebhook` validates the
 *     signature; this controller only routes. Stub gateways throw — that's
 *     fine, they're never reached by a real provider in the current build.
 *
 *   GET  /public/orders/:trackingId/status
 *     Customer-facing tracking endpoint. Returns the minimum non-PII status
 *     payload — see `OnlineOrdersService.getPublicStatus`.
 */
@Controller()
export class OnlineOrdersController {
  constructor(private readonly online: OnlineOrdersService) {}

  @Public()
  @Post('payments/webhook/:gateway')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async webhook(
    @Param('gateway') gateway: string,
    @Headers()        headers: Record<string, string | string[] | undefined>,
    @Body()           body:    unknown,
  ) {
    return this.online.handleWebhook(gateway, { headers, body });
  }

  @Public()
  @Get('public/orders/:trackingId/status')
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  async status(@Param('trackingId') trackingId: string) {
    return this.online.getPublicStatus(trackingId);
  }
}
