import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';
import { AutoReorderService } from './auto-reorder.service';

const runSchema = z.object({
  warehouseIds: z.array(z.string().length(26)).max(50).optional(),
  skipScan: z.boolean().optional(),
  dryRun: z.boolean().optional(),
});

@Controller('procurement/auto-reorder')
export class AutoReorderController {
  constructor(private readonly service: AutoReorderService) {}

  @Post('run')
  @RequirePermission('PurchaseOrder', 'create')
  @HttpCode(HttpStatus.OK)
  async run(@CurrentUser() user: UserSession, @Body() raw: unknown) {
    const body = runSchema.parse(raw ?? {});
    return this.service.run(user.companyId, {
      warehouseIds: body.warehouseIds,
      skipScan: body.skipScan,
      dryRun: body.dryRun,
      triggeredBy: user.userId,
    });
  }

  @Get('runs')
  @RequirePermission('PurchaseOrder', 'read')
  async runs(
    @CurrentUser() user: UserSession,
    @Query('limit') limit?: string,
  ) {
    return this.service.listRuns(user.companyId, limit ? parseInt(limit, 10) : 20);
  }
}
