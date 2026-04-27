/**
 * T45 — Omnichannel Order Inbox controller.
 *
 * Endpoints:
 *   GET    /api/sales/omnichannel/inbox            — paginated list (filters: status, channel)
 *   GET    /api/sales/omnichannel/messages/:id     — single message + draft
 *   POST   /api/sales/omnichannel/messages/:id/approve
 *   POST   /api/sales/omnichannel/messages/:id/reject
 *   POST   /api/sales/omnichannel/ingest/whatsapp  — bridge webhook (signature-validated)
 *
 * Permissions: Sales.read for inbox/get, Sales.create for approve, Sales.update for reject.
 * The /ingest webhook is signature-validated via shared-secret header `x-bridge-signature`.
 */
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { z } from 'zod';
import { createHmac, timingSafeEqual } from 'crypto';
import type { UserSession } from '@erp/shared-types';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import { Public } from '../../../engines/auth/decorators/public.decorator';
import {
  OmnichannelService,
  type ApproveInput,
  type OmnichannelChannel,
  type OmnichannelStatus,
} from './omnichannel.service';

const ApproveSchema = z.object({
  customerId:  z.string().min(26).max(26),
  warehouseId: z.string().min(26).max(26),
  notes:       z.string().max(2000).optional(),
  items: z
    .array(
      z.object({
        variantId:    z.string().min(26).max(26),
        qty:          z.number().positive(),
        unitPriceIqd: z.number().nonnegative(),
      }),
    )
    .min(1),
});

const RejectSchema = z.object({
  reason: z.string().min(1).max(500),
});

const IngestSchema = z.object({
  companyId:  z.string().min(26).max(26),
  externalId: z.string().min(1).max(120),
  fromHandle: z.string().min(1).max(120),
  body:       z.string().min(1).max(8000),
});

const VALID_STATUSES: OmnichannelStatus[] = ['new', 'drafted', 'approved', 'rejected', 'spam'];
const VALID_CHANNELS: OmnichannelChannel[] = ['whatsapp', 'facebook', 'instagram'];

@Controller('sales/omnichannel')
export class OmnichannelController {
  constructor(private readonly svc: OmnichannelService) {}

  @Get('inbox')
  @RequirePermission('SalesOrder', 'read')
  async inbox(
    @CurrentUser() user: UserSession,
    @Query('page')    page?:    string,
    @Query('limit')   limit?:   string,
    @Query('status')  status?:  string,
    @Query('channel') channel?: string,
  ) {
    if (status && !VALID_STATUSES.includes(status as OmnichannelStatus)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', messageAr: 'حالة غير صالحة' });
    }
    if (channel && !VALID_CHANNELS.includes(channel as OmnichannelChannel)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', messageAr: 'قناة غير صالحة' });
    }
    return this.svc.findAll(user.companyId, {
      page:    page  ? Number(page)  : 1,
      limit:   limit ? Number(limit) : 50,
      status:  status  as OmnichannelStatus  | undefined,
      channel: channel as OmnichannelChannel | undefined,
    });
  }

  @Get('messages/:id')
  @RequirePermission('SalesOrder', 'read')
  async getOne(@CurrentUser() user: UserSession, @Param('id') id: string) {
    return this.svc.findOne(id, user.companyId);
  }

  @Post('messages/:id/approve')
  @RequirePermission('SalesOrder', 'create')
  async approve(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = ApproveSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', issues: parsed.error.flatten() });
    }
    return this.svc.approveDraft(id, user.companyId, parsed.data as ApproveInput, user);
  }

  @Post('messages/:id/reject')
  @RequirePermission('SalesOrder', 'update')
  async reject(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = RejectSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', issues: parsed.error.flatten() });
    }
    return this.svc.rejectDraft(id, user.companyId, parsed.data.reason, user);
  }

  /**
   * Bridge webhook — called by apps/whatsapp-bridge after Meta webhook arrives.
   * Validates HMAC-SHA256 signature against env.OMNICHANNEL_BRIDGE_SECRET.
   */
  @Post('ingest/whatsapp')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  async ingestWhatsapp(
    @Headers('x-bridge-signature') signature: string | undefined,
    @Body() body: unknown,
  ) {
    const secret = process.env.OMNICHANNEL_BRIDGE_SECRET;
    if (!secret) {
      // Fail closed: never accept unsigned ingest in production-style envs.
      throw new UnauthorizedException({ code: 'BRIDGE_SECRET_MISSING' });
    }
    const raw = JSON.stringify(body ?? {});
    const expected = createHmac('sha256', secret).update(raw).digest('hex');
    const provided = (signature ?? '').toLowerCase();
    const ok =
      provided.length === expected.length &&
      timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
    if (!ok) throw new UnauthorizedException({ code: 'BAD_SIGNATURE' });

    const parsed = IngestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', issues: parsed.error.flatten() });
    }
    const msg = await this.svc.ingestMessage({
      companyId:  parsed.data.companyId,
      channel:    'whatsapp',
      externalId: parsed.data.externalId,
      fromHandle: parsed.data.fromHandle,
      body:       parsed.data.body,
    });
    return { id: msg.id, status: msg.status };
  }
}
