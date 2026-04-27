import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { PoliciesService } from './policies.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import {
  CreatePolicySchema,
  UpdatePolicySchema,
  AcknowledgePolicySchema,
} from './dto/policies.dto';

/**
 * HR policies admin endpoints + employee policy-ack portal (T52).
 *
 * Admin endpoints require RBAC. The employee-facing endpoints
 * (`/hr/policies/me/*`) are auth-required but per-employee scoped:
 * they look up the employee linked to the current user and reject if none.
 */
@Controller('hr/policies')
export class PoliciesController {
  constructor(
    private readonly svc: PoliciesService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Admin ──────────────────────────────────────────────────────────
  @Post()
  @RequirePermission('Employee', 'create')
  create(@Body() body: unknown, @CurrentUser() user: UserSession) {
    const dto = CreatePolicySchema.parse(body);
    return this.svc.createPolicy(dto, user);
  }

  @Get()
  @RequirePermission('Employee', 'read')
  list(@CurrentUser() user: UserSession) {
    return this.svc.listPolicies(user.companyId);
  }

  @Get(':id')
  @RequirePermission('Employee', 'read')
  get(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.getPolicy(id, user.companyId);
  }

  @Patch(':id')
  @RequirePermission('Employee', 'update')
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: UserSession,
  ) {
    const dto = UpdatePolicySchema.parse(body);
    return this.svc.updatePolicy(id, dto, user);
  }

  @Post(':id/publish')
  @RequirePermission('Employee', 'update')
  publish(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.publish(id, user);
  }

  // ── Employee (per-user scoped) ────────────────────────────────────
  /** List policies + my ack status. Auth required, scoped to caller's employee row. */
  @Get('me/list')
  async listMine(@CurrentUser() user: UserSession) {
    const employee = await this.requireEmployee(user);
    return this.svc.listForEmployee(user.companyId, employee.id);
  }

  /** Submit a new acknowledgment for the calling employee. Append-only. */
  @Post('me/acknowledge')
  async ackMine(
    @Body() body: unknown,
    @CurrentUser() user: UserSession,
    @Req() req: Request,
  ) {
    const dto = AcknowledgePolicySchema.parse(body);
    const employee = await this.requireEmployee(user);
    const ip = (req.ip || req.headers['x-forwarded-for'] || '').toString().slice(0, 64);
    return this.svc.acknowledge(dto, employee.id, user, ip);
  }

  private async requireEmployee(user: UserSession) {
    const e = await this.prisma.employee.findFirst({
      where: { companyId: user.companyId, userId: user.userId, status: 'active' },
      select: { id: true },
    });
    if (!e) {
      throw new NotFoundException({
        code: 'EMPLOYEE_RECORD_NOT_LINKED',
        messageAr: 'لا يوجد سجل موظف مربوط بحسابك',
      });
    }
    return e;
  }
}
