import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('customers')
export class CustomersController {
  constructor(private readonly svc: CustomersService) {}

  @Get()
  @RequirePermission('Customer', 'read')
  async findAll(
    @CurrentUser() user: UserSession,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.svc.findAll(user.companyId, {
      page: page ? +page : 1,
      limit: limit ? +limit : 50,
      search,
      type,
      isActive: isActive === undefined ? undefined : isActive === 'true',
    });
  }

  @Get('aging-report')
  @RequirePermission('Customer', 'read')
  async aging(@CurrentUser() user: UserSession) {
    return this.svc.getAgingReport(user.companyId);
  }

  @Get('by-phone/:phone')
  @RequirePermission('Customer', 'read')
  async byPhone(@CurrentUser() user: UserSession, @Param('phone') phone: string) {
    return this.svc.findByPhone(phone, user.companyId);
  }

  @Get(':id')
  @RequirePermission('Customer', 'read')
  async findOne(@CurrentUser() user: UserSession, @Param('id') id: string) {
    return this.svc.findOne(id, user.companyId);
  }

  @Post()
  @RequirePermission('Customer', 'create')
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: UserSession, @Body() dto: any) {
    return this.svc.create(user.companyId, dto, user);
  }

  @Put(':id')
  @RequirePermission('Customer', 'update')
  async update(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.svc.update(id, user.companyId, dto, user);
  }

  @Delete(':id')
  @RequirePermission('Customer', 'delete')
  async remove(@CurrentUser() user: UserSession, @Param('id') id: string) {
    return this.svc.softDelete(id, user.companyId, user);
  }

  @Post(':id/loyalty-adjust')
  @RequirePermission('Customer', 'update')
  async loyalty(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() dto: { delta: number; reason: string },
  ) {
    return this.svc.adjustLoyaltyPoints(id, user.companyId, dto.delta, dto.reason, user);
  }
}
