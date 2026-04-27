/**
 * PosConflictsController — I003: POS Offline Sync Conflict Resolution
 *
 * Exposes:
 *   GET  /pos/conflicts          — list conflicts (paginated, filterable)
 *   POST /pos/conflicts/:id/resolve — manager resolves a conflict
 *
 * Permission model:
 *   Read:    pos.conflict.read   (Branch Manager, Store Manager)
 *   Resolve: pos.conflict.resolve (Branch Manager, Store Manager)
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';
import { PosConflictsService } from './conflicts.service';

@Controller('pos/conflicts')
export class PosConflictsController {
  constructor(private readonly service: PosConflictsService) {}

  /**
   * List POS sync conflicts — paginated, filterable by resolution status / branch.
   *
   * @example GET /api/v1/pos/conflicts?resolution=pending_review&page=1&pageSize=25
   */
  @Get()
  @RequirePermission('pos.conflict.read')
  list(
    @Query() query: { page?: number; pageSize?: number; resolution?: string; branchId?: string },
    @CurrentUser() user: UserSession,
  ) {
    return this.service.listConflicts(query, user);
  }

  /**
   * Manager resolves a pending conflict.
   *
   * @example POST /api/v1/pos/conflicts/:id/resolve
   * Body: { resolution: 'manager_accepted' | 'manager_rejected', notes?: string }
   */
  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('pos.conflict.resolve')
  resolve(
    @Param('id') id: string,
    @Body() body: { resolution: 'manager_accepted' | 'manager_rejected'; notes?: string },
    @CurrentUser() user: UserSession,
  ) {
    return this.service.resolveConflict(id, body.resolution, body.notes, user);
  }
}
