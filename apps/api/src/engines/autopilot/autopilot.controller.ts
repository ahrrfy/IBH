import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import type { UserSession } from '@erp/shared-types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AutopilotEngineService } from './autopilot.service';

// ─── T71 — Autonomous Operations Engine: Manager Endpoints ─────────────────
// Powers the manager dashboard at /(app)/autopilot. All routes are
// company-scoped via the JWT session. Read paths require Settings:read,
// write paths require Settings:update — matching how other admin engines
// (T46 notifications, T42 inventory intelligence) are gated.

const listExceptionsSchema = z.object({
  status: z.enum(['pending', 'resolved', 'dismissed']).optional(),
  domain: z
    .enum([
      'sales',
      'inventory',
      'finance',
      'hr',
      'crm',
      'delivery',
      'procurement',
      'license',
    ])
    .optional(),
  jobId: z.string().max(80).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

const resolveSchema = z.object({
  resolution: z.record(z.unknown()).optional(),
});

const dismissSchema = z.object({
  reason: z.string().max(500).optional(),
});

const runJobSchema = z.object({
  jobId: z.string().min(1).max(80),
});

@Controller('autopilot')
export class AutopilotController {
  constructor(private readonly engine: AutopilotEngineService) {}

  @Get('dashboard')
  @RequirePermission('Settings', 'read')
  dashboard(@CurrentUser() user: UserSession) {
    return this.engine.dashboard(user.companyId);
  }

  @Get('catalogue')
  @RequirePermission('Settings', 'read')
  catalogue() {
    const items = this.engine.catalogue();
    return { items, total: items.length };
  }

  @Get('exceptions')
  @RequirePermission('Settings', 'read')
  async exceptions(@CurrentUser() user: UserSession, @Query() raw: unknown) {
    const query = listExceptionsSchema.parse(raw ?? {});
    return this.engine.listExceptions(user.companyId, query);
  }

  @Get('runs')
  @RequirePermission('Settings', 'read')
  async runs(
    @CurrentUser() user: UserSession,
    @Query('jobId') jobId?: string,
    @Query('limit') limit?: string,
  ) {
    const items = await this.engine.listRuns(user.companyId, {
      jobId,
      limit: limit ? Number(limit) : undefined,
    });
    return { items };
  }

  @Post('exceptions/:id/resolve')
  @RequirePermission('Settings', 'update')
  @HttpCode(HttpStatus.OK)
  async resolve(
    @Param('id') id: string,
    @CurrentUser() user: UserSession,
    @Body() raw: unknown,
  ) {
    const body = resolveSchema.parse(raw ?? {});
    return this.engine.resolveException(
      user.companyId,
      id,
      user.userId,
      body.resolution,
    );
  }

  @Post('exceptions/:id/dismiss')
  @RequirePermission('Settings', 'update')
  @HttpCode(HttpStatus.OK)
  async dismiss(
    @Param('id') id: string,
    @CurrentUser() user: UserSession,
    @Body() raw: unknown,
  ) {
    const body = dismissSchema.parse(raw ?? {});
    return this.engine.dismissException(
      user.companyId,
      id,
      user.userId,
      body.reason,
    );
  }

  @Post('jobs/run')
  @RequirePermission('Settings', 'update')
  @HttpCode(HttpStatus.OK)
  async runJob(@CurrentUser() user: UserSession, @Body() raw: unknown) {
    const body = runJobSchema.parse(raw ?? {});
    return this.engine.runJob(body.jobId, user.companyId, {
      trigger: 'manual',
    });
  }
}
