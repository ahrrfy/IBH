import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';
import { InventoryIntelligenceService } from './intelligence.service';

const scanSchema = z.object({
  warehouseIds: z.array(z.string().length(26)).max(50).optional(),
  variantIds: z.array(z.string().length(26)).max(2000).optional(),
});

const listFlagsSchema = z.object({
  ruleCode: z.string().regex(/^Q(0[1-9]|1[0-2])$/).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  warehouseId: z.string().length(26).optional(),
  onlyOpen: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

@Controller('inventory/intelligence')
export class InventoryIntelligenceController {
  constructor(private readonly service: InventoryIntelligenceService) {}

  @Get('catalogue')
  @RequirePermission('Inventory', 'read')
  catalogue() {
    return { items: this.service.catalogue() };
  }

  @Get('summary')
  @RequirePermission('Inventory', 'read')
  async summary(@CurrentUser() user: UserSession) {
    return this.service.summary(user.companyId);
  }

  @Get('flags')
  @RequirePermission('Inventory', 'read')
  async flags(@CurrentUser() user: UserSession, @Query() rawQuery: unknown) {
    const query = listFlagsSchema.parse(rawQuery ?? {});
    return this.service.listFlags(user.companyId, query);
  }

  @Post('scan')
  @RequirePermission('Inventory', 'update')
  @HttpCode(HttpStatus.OK)
  async scan(@CurrentUser() user: UserSession, @Body() rawBody: unknown) {
    const body = scanSchema.parse(rawBody ?? {});
    return this.service.scan(user.companyId, {
      warehouseIds: body.warehouseIds,
      variantIds: body.variantIds,
      triggeredBy: user.userId,
    });
  }

  @Post('flags/:id/resolve')
  @RequirePermission('Inventory', 'update')
  @HttpCode(HttpStatus.OK)
  async resolve(
    @Param('id') id: string,
    @CurrentUser() user: UserSession,
    @Body() body: { reason?: string },
  ) {
    return this.service.resolveFlag(user.companyId, id, user.userId, body?.reason);
  }
}
