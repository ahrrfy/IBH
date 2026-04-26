import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CurrentUser } from '../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // ─── Warehouses ───────────────────────────────────────────────────────────

  @Get('warehouses')
  @RequirePermission('Inventory', 'read')
  async getWarehouses(
    @CurrentUser() user: UserSession,
    @Query('branchId') branchId?: string,
  ) {
    return this.inventoryService.getWarehouses(user.companyId, branchId);
  }

  @Post('warehouses')
  @RequirePermission('Inventory', 'create')
  async createWarehouse(
    @Body() body: { code: string; nameAr: string; nameEn?: string; branchId: string; type: string; address?: string },
    @CurrentUser() user: UserSession,
  ) {
    return this.inventoryService.createWarehouse(user.companyId, body, user);
  }

  // ─── Stock Summary ────────────────────────────────────────────────────────

  @Get('stock')
  @RequirePermission('Inventory', 'read')
  async getStockSummary(
    @CurrentUser() user: UserSession,
    @Query('warehouseId') warehouseId?: string,
    @Query('page')        page?: string,
    @Query('limit')       limit?: string,
    @Query('search')      search?: string,
    @Query('lowStock')    lowStock?: string,
  ) {
    return this.inventoryService.getStockSummary(user.companyId, {
      warehouseId,
      page:     page     ? parseInt(page, 10)    : 1,
      limit:    limit    ? parseInt(limit, 10)   : 50,
      search,
      lowStock: lowStock === 'true',
    });
  }

  @Get('stock/:variantId/ledger')
  @RequirePermission('Inventory', 'read')
  async getLedgerHistory(
    @Param('variantId') variantId: string,
    @CurrentUser() user: UserSession,
    @Query('warehouseId') warehouseId: string,
    @Query('page')  page?: string,
    @Query('limit') limit?: string,
    @Query('from')  from?: string,
    @Query('to')    to?: string,
  ) {
    return this.inventoryService.getLedgerHistory(
      variantId,
      warehouseId,
      user.companyId,
      {
        page:  page  ? parseInt(page, 10)  : 1,
        limit: limit ? parseInt(limit, 10) : 50,
        from:  from  ? new Date(from) : undefined,
        to:    to    ? new Date(to)   : undefined,
      },
    );
  }

  // ─── Low Stock Alerts ─────────────────────────────────────────────────────

  @Get('alerts/low-stock')
  @RequirePermission('Inventory', 'read')
  async getLowStockAlerts(@CurrentUser() user: UserSession) {
    return this.inventoryService.getLowStockAlerts(user.companyId);
  }

  // ─── Reorder Points ───────────────────────────────────────────────────────

  @Post('reorder-points')
  @RequirePermission('Inventory', 'update')
  async setReorderPoint(
    @Body() body: {
      variantId: string;
      warehouseId: string;
      reorderPoint: number;
      safetyStock: number;
    },
    @CurrentUser() user: UserSession,
  ) {
    return this.inventoryService.setReorderPoint(
      user.companyId,
      { ...body, isAiGenerated: false },
      user,
    );
  }

  // ─── Stock Transfers ──────────────────────────────────────────────────────

  @Get('transfers')
  @RequirePermission('Inventory', 'read')
  async listTransfers(
    @CurrentUser() user: UserSession,
    @Query('status') status?: string,
    @Query('limit')  limit?: string,
  ) {
    return this.inventoryService.listTransfers(user.companyId, {
      status,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Get('transfers/:id')
  @RequirePermission('Inventory', 'read')
  async getTransfer(
    @Param('id') id: string,
    @CurrentUser() user: UserSession,
  ) {
    return this.inventoryService.getTransferById(id, user.companyId);
  }

  @Post('transfers')
  @RequirePermission('Inventory', 'create')
  async createTransfer(
    @Body() body: {
      fromWarehouseId: string;
      toWarehouseId: string;
      lines: Array<{ variantId: string; qty: number; notes?: string }>;
      notes?: string;
    },
    @CurrentUser() user: UserSession,
  ) {
    return this.inventoryService.createTransfer(user.companyId, body, user);
  }

  @Post('transfers/:id/approve')
  @RequirePermission('Inventory', 'approve')
  @HttpCode(HttpStatus.OK)
  async approveTransfer(
    @Param('id') id: string,
    @CurrentUser() user: UserSession,
  ) {
    return this.inventoryService.approveTransfer(id, user.companyId, user);
  }

  // ─── Stocktaking ──────────────────────────────────────────────────────────

  @Post('stocktaking')
  @RequirePermission('Stocktaking', 'create')
  async createStocktakingSession(
    @Body() body: { warehouseId: string; notes?: string },
    @CurrentUser() user: UserSession,
  ) {
    return this.inventoryService.createStocktakingSession(
      user.companyId,
      body.warehouseId,
      body.notes,
      user,
    );
  }

  @Post('stocktaking/:id/count')
  @RequirePermission('Stocktaking', 'update')
  @HttpCode(HttpStatus.OK)
  async submitCount(
    @Param('id') id: string,
    @Body('lines') lines: Array<{ variantId: string; qtyActual: number; notes?: string }>,
    @CurrentUser() user: UserSession,
  ) {
    return this.inventoryService.submitStocktakingCount(id, user.companyId, lines, user);
  }

  @Post('stocktaking/:id/approve')
  @RequirePermission('Stocktaking', 'approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  async approveStocktaking(
    @Param('id') id: string,
    @CurrentUser() user: UserSession,
  ) {
    await this.inventoryService.approveStocktaking(id, user.companyId, user);
  }
}
