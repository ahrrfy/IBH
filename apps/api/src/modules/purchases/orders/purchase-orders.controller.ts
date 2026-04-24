import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  PurchaseOrdersService,
  CreatePurchaseOrderDto,
  FindPurchaseOrdersQuery,
} from './purchase-orders.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('purchases/orders')
export class PurchaseOrdersController {
  constructor(private readonly svc: PurchaseOrdersService) {}

  @Get()
  @RequirePermission('Purchase', 'read')
  findAll(
    @CurrentUser() user: UserSession,
    @Query() query: FindPurchaseOrdersQuery,
  ) {
    return this.svc.findAll(user.companyId, query);
  }

  @Get(':id')
  @RequirePermission('Purchase', 'read')
  findOne(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.findOne(id, user.companyId);
  }

  @Post()
  @RequirePermission('Purchase', 'create')
  create(
    @CurrentUser() user: UserSession,
    @Body() dto: CreatePurchaseOrderDto,
  ) {
    return this.svc.create(user.companyId, dto, user);
  }

  @Put(':id')
  @RequirePermission('Purchase', 'update')
  update(
    @Param('id') id: string,
    @CurrentUser() user: UserSession,
    @Body() dto: Partial<CreatePurchaseOrderDto>,
  ) {
    return this.svc.update(id, user.companyId, dto, user);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('Purchase', 'update')
  submit(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.submit(id, user.companyId, user);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('Purchase', 'approve')
  approve(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.approve(id, user.companyId, user);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('Purchase', 'update')
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: UserSession,
    @Body() body: { reason: string },
  ) {
    return this.svc.cancel(id, user.companyId, body.reason, user);
  }
}
