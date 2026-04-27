import { Controller, Get, Param } from '@nestjs/common';
import { Customer360Service } from './customer-360.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

/**
 * T44 — Customer 360 read endpoint.
 *   GET /sales/customer-360/:id
 */
@Controller('sales/customer-360')
export class Customer360Controller {
  constructor(private readonly svc: Customer360Service) {}

  @Get(':id')
  @RequirePermission('Customer', 'read')
  async get(@CurrentUser() user: UserSession, @Param('id') id: string) {
    return this.svc.get(user.companyId, id);
  }
}
