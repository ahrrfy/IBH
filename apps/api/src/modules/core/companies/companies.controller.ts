import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
} from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('company')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  // ── Company ────────────────────────────────────────────────────────────────

  @Get()
  @RequirePermission('Company', 'read')
  async getMyCompany(@CurrentUser() user: UserSession) {
    return this.companiesService.getMyCompany(user.companyId);
  }

  @Put()
  @RequirePermission('Company', 'update')
  async updateCompany(
    @Body() body: { nameAr?: string; nameEn?: string; phone?: string; address?: string; logoUrl?: string },
    @CurrentUser() user: UserSession,
  ) {
    return this.companiesService.updateCompany(user.companyId, body, user);
  }

  // ── Branches ───────────────────────────────────────────────────────────────

  @Get('branches')
  @RequirePermission('Branch', 'read')
  async getBranches(@CurrentUser() user: UserSession) {
    return this.companiesService.getBranches(user.companyId);
  }

  @Post('branches')
  @RequirePermission('Branch', 'create')
  async createBranch(
    @Body() body: { code: string; nameAr: string; nameEn?: string; phone?: string; address?: string },
    @CurrentUser() user: UserSession,
  ) {
    return this.companiesService.createBranch(user.companyId, body, user);
  }

  @Put('branches/:id')
  @RequirePermission('Branch', 'update')
  async updateBranch(
    @Param('id') id: string,
    @Body() body: { nameAr?: string; nameEn?: string; phone?: string; address?: string; isActive?: boolean },
    @CurrentUser() user: UserSession,
  ) {
    return this.companiesService.updateBranch(id, user.companyId, body, user);
  }

  // ── Roles ──────────────────────────────────────────────────────────────────

  @Get('roles')
  @RequirePermission('Role', 'read')
  async getRoles(@CurrentUser() user: UserSession) {
    return this.companiesService.getRoles(user.companyId);
  }

  @Post('roles')
  @RequirePermission('Role', 'create')
  async createRole(
    @Body() body: {
      name: string;
      displayNameAr: string;
      displayNameEn?: string;
      permissions: Record<string, number>;
    },
    @CurrentUser() user: UserSession,
  ) {
    return this.companiesService.createRole(user.companyId, body, user);
  }

  @Put('roles/:id/permissions')
  @RequirePermission('Role', 'update')
  async updateRolePermissions(
    @Param('id') id: string,
    @Body() body: {
      permissions: Record<string, number>;
      // T47 — RBAC Enterprise: optional extension fields
      parentRoleId?: string | null;
      validFrom?: string | null;
      validUntil?: string | null;
      sodRules?: Array<{
        conflictingActions: string[];
        description?: string;
      }>;
    },
    @CurrentUser() user: UserSession,
  ) {
    return this.companiesService.updateRolePermissions(
      id,
      user.companyId,
      body.permissions,
      user,
      {
        parentRoleId: body.parentRoleId,
        validFrom: body.validFrom,
        validUntil: body.validUntil,
        sodRules: body.sodRules,
      },
    );
  }
}
