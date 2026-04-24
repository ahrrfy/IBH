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
import { UsersService } from './users.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';
import { createUserSchema } from '@erp/validation-schemas';
import type { CreateUserInput } from '@erp/validation-schemas';
import type { UserSession } from '@erp/shared-types';
import { z } from 'zod';

const assignRolesSchema = z.object({
  roleIds: z.array(z.string()).min(1),
});

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RequirePermission('User', 'create')
  async create(
    @Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput,
    @CurrentUser() user: UserSession,
  ) {
    return this.usersService.create(body, user.companyId, user);
  }

  @Get()
  @RequirePermission('User', 'read')
  async findAll(
    @CurrentUser() user: UserSession,
    @Query('page')     page?: string,
    @Query('limit')    limit?: string,
    @Query('search')   search?: string,
    @Query('branchId') branchId?: string,
    @Query('active')   active?: string,
  ) {
    return this.usersService.findAll(user.companyId, {
      page:     page ? parseInt(page, 10) : 1,
      limit:    limit ? parseInt(limit, 10) : 20,
      search,
      branchId,
      isActive: active !== undefined ? active === 'true' : undefined,
    });
  }

  @Get(':id')
  @RequirePermission('User', 'read')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: UserSession,
  ) {
    return this.usersService.findOne(id, user.companyId);
  }

  @Put(':id')
  @RequirePermission('User', 'update')
  async update(
    @Param('id') id: string,
    @Body() body: { nameAr?: string; nameEn?: string; branchId?: string; status?: string },
    @CurrentUser() user: UserSession,
  ) {
    return this.usersService.update(id, user.companyId, body, user);
  }

  @Delete(':id')
  @RequirePermission('User', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: UserSession,
  ) {
    await this.usersService.softDelete(id, user.companyId, user);
  }

  @Put(':id/roles')
  @RequirePermission('User', 'update')
  async assignRoles(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(assignRolesSchema)) body: { roleIds: string[] },
    @CurrentUser() user: UserSession,
  ) {
    await this.usersService.assignRoles(id, user.companyId, body.roleIds, user);
    return { success: true };
  }
}
