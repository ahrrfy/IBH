import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ContractsService } from './contracts.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';
import {
  CreateContractTemplateSchema,
  UpdateContractTemplateSchema,
  CreateContractSchema,
} from './dto/contracts.dto';

/**
 * HR contracts admin endpoints (T52).
 * Employees do NOT hit this controller — they use the policy-ack portal in T52.
 */
@Controller('hr/contracts')
export class ContractsController {
  constructor(private readonly svc: ContractsService) {}

  // ── Templates ──
  @Post('templates')
  @RequirePermission('Employee', 'create')
  createTemplate(@Body() body: unknown, @CurrentUser() user: UserSession) {
    const dto = CreateContractTemplateSchema.parse(body);
    return this.svc.createTemplate(dto, user);
  }

  @Get('templates')
  @RequirePermission('Employee', 'read')
  listTemplates(@CurrentUser() user: UserSession) {
    return this.svc.listTemplates(user.companyId);
  }

  @Patch('templates/:id')
  @RequirePermission('Employee', 'update')
  updateTemplate(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: UserSession,
  ) {
    const dto = UpdateContractTemplateSchema.parse(body);
    return this.svc.updateTemplate(id, dto, user);
  }

  @Patch('templates/:id/status')
  @RequirePermission('Employee', 'update')
  setTemplateStatus(
    @Param('id') id: string,
    @Body() body: { status: 'draft' | 'active' | 'archived' },
    @CurrentUser() user: UserSession,
  ) {
    return this.svc.setTemplateStatus(id, body.status, user);
  }

  // ── Contracts ──
  @Post()
  @RequirePermission('Employee', 'create')
  createContract(@Body() body: unknown, @CurrentUser() user: UserSession) {
    const dto = CreateContractSchema.parse(body);
    return this.svc.createContract(dto, user);
  }

  @Get()
  @RequirePermission('Employee', 'read')
  listContracts(
    @CurrentUser() user: UserSession,
    @Query('status') status?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.svc.listContracts(user.companyId, { status, employeeId });
  }

  @Get(':id')
  @RequirePermission('Employee', 'read')
  getContract(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.getContract(id, user.companyId);
  }

  @Patch(':id/activate')
  @RequirePermission('Employee', 'update')
  activate(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.activate(id, user);
  }

  @Get(':id/pdf')
  @RequirePermission('Employee', 'read')
  @Header('Content-Type', 'application/pdf')
  async pdf(
    @Param('id') id: string,
    @CurrentUser() user: UserSession,
    @Res() res: Response,
  ) {
    const buf = await this.svc.renderPdf(id, user.companyId);
    res.setHeader('Content-Disposition', `inline; filename="contract-${id}.pdf"`);
    res.send(buf);
  }

  /** Manual trigger for the 30-day renewal-reminder sweep (also wired to cron). */
  @Post('renewal-sweep')
  @RequirePermission('Employee', 'update')
  runRenewalSweep() {
    return this.svc.runRenewalSweep();
  }
}
