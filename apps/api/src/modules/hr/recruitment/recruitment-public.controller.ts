import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../../engines/auth/decorators/public.decorator';
import { RecruitmentService } from './recruitment.service';
import { SubmitApplicationSchema } from './dto/recruitment.dto';

/**
 * Public job board endpoints (T51).
 *
 * No authentication. Aggressively rate-limited:
 *   - listing/details: 30 req/min/IP (browsing)
 *   - submission:       3 req/15min/IP (anti-spam on apply)
 *
 * Tenant routing for now is best-effort via `?company=` query param;
 * full host-based tenant resolution lands with T58 licensing/host-routing.
 */
@Public()
@Controller('public/jobs')
export class RecruitmentPublicController {
  constructor(private readonly svc: RecruitmentService) {}

  @Get()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  list(@Query('company') companyId?: string) {
    return this.svc.publicListOpen(companyId);
  }

  @Get(':slug')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  getOne(@Param('slug') slug: string, @Query('company') companyId?: string) {
    return this.svc.publicGetBySlug(slug, companyId);
  }

  @Post(':slug/apply')
  @Throttle({ default: { ttl: 15 * 60_000, limit: 3 } })
  apply(@Param('slug') slug: string, @Body() body: unknown, @Req() req: Request) {
    const dto = SubmitApplicationSchema.parse(body);
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      req.ip ||
      undefined;
    const ua = (req.headers['user-agent'] as string | undefined) || undefined;
    return this.svc.submitApplication(slug, dto, { ip, ua });
  }
}
