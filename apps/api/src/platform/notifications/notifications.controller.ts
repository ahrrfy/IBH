import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../engines/auth/decorators/current-user.decorator';
import type { UserSession } from '@erp/shared-types';
import { NotificationsService } from './notifications.service';
import { ALL_CHANNELS, NotificationChannel } from './notifications.types';

const CHANNEL_VALUES = ALL_CHANNELS as [NotificationChannel, ...NotificationChannel[]];

const HhmmSchema = z
  .string()
  .regex(/^\d{1,2}:\d{2}$/, 'invalid HH:MM')
  .nullable()
  .optional();

const PreferenceSchema = z.object({
  eventType: z.string().min(1).max(80),
  channels: z.array(z.enum(CHANNEL_VALUES)).max(4),
  quietHoursStart: HhmmSchema,
  quietHoursEnd: HhmmSchema,
});

const ListQuerySchema = z.object({
  unread: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional(),
  eventType: z.string().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  /**
   * GET /notifications
   * List the current user's notifications. Supports `?unread=true` and
   * `?eventType=invoice.overdue` filters plus pagination.
   */
  @Get()
  async list(
    @CurrentUser() user: UserSession,
    @Query() query: Record<string, string>,
  ) {
    const parsed = ListQuerySchema.parse(query);
    const unread =
      parsed.unread === true || parsed.unread === 'true' ? true : false;
    return this.service.list(user.userId, {
      unread,
      eventType: parsed.eventType,
      limit: parsed.limit,
      offset: parsed.offset,
    });
  }

  /**
   * POST /notifications/:id/read
   * Mark a single notification as read. Idempotent.
   */
  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
  ): Promise<void> {
    await this.service.markRead(user.userId, id);
  }

  /**
   * POST /notifications/mark-all-read
   * Mark every unread row for the current user as read.
   */
  @Post('mark-all-read')
  async markAllRead(@CurrentUser() user: UserSession) {
    return this.service.markAllRead(user.userId);
  }

  /**
   * GET /notifications/preferences
   * Returns every NotificationPreference row for the current user.
   * Missing rows imply the system default (in-app only).
   */
  @Get('preferences')
  async getPreferences(@CurrentUser() user: UserSession) {
    return this.service.getPreferences(user.userId);
  }

  /**
   * PUT /notifications/preferences
   * Upsert one preference row. To clear quiet hours pass null/empty.
   */
  @Put('preferences')
  async putPreference(
    @CurrentUser() user: UserSession,
    @Body() body: unknown,
  ) {
    const input = PreferenceSchema.parse(body);
    return this.service.upsertPreference(user.userId, {
      eventType: input.eventType,
      channels: input.channels,
      quietHoursStart: input.quietHoursStart ?? null,
      quietHoursEnd: input.quietHoursEnd ?? null,
    });
  }
}
