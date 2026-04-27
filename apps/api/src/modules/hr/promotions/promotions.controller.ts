import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';
import {
  CreateSalaryBandSchema,
  UpdateSalaryBandSchema,
  CreatePromotionSchema,
  ApprovePromotionSchema,
  RejectPromotionSchema,
} from './dto/promotions.dto';

/**
 * HR Promotions + Salary Bands endpoints (T53).
 *
 * Salary bands define allowable compensation ranges per grade/band.
 * Promotions go through a 2-step approval: HR Manager → Director.
 * Auto-suggest: GET /hr/promotions/suggest returns Tier 3 rule-based candidates.
 */
@Controller('hr')
export class PromotionsController {
  constructor(private readonly svc: PromotionsService) {}

  // ── Salary Bands ─────────────────────────────────────────────────────────

  @Post('salary-bands')
  @RequirePermission('Employee', 'create')
  createSalaryBand(@Body() body: unknown, @CurrentUser() user: UserSession) {
    const dto = CreateSalaryBandSchema.parse(body);
    return this.svc.createSalaryBand(dto, user);
  }

  @Get('salary-bands')
  @RequirePermission('Employee', 'read')
  listSalaryBands(@CurrentUser() user: UserSession) {
    return this.svc.listSalaryBands(user.companyId);
  }

  @Get('salary-bands/:id')
  @RequirePermission('Employee', 'read')
  getSalaryBand(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.findOneSalaryBand(id, user.companyId);
  }

  @Patch('salary-bands/:id')
  @RequirePermission('Employee', 'update')
  updateSalaryBand(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: UserSession,
  ) {
    const dto = UpdateSalaryBandSchema.parse(body);
    return this.svc.updateSalaryBand(id, dto, user);
  }

  // ── Promotions ────────────────────────────────────────────────────────────

  @Post('promotions')
  @RequirePermission('Employee', 'create')
  createPromotion(@Body() body: unknown, @CurrentUser() user: UserSession) {
    const dto = CreatePromotionSchema.parse(body);
    return this.svc.createPromotion(dto, user);
  }

  @Get('promotions')
  @RequirePermission('Employee', 'read')
  listPromotions(
    @Query('status') status: string | undefined,
    @Query('employeeId') employeeId: string | undefined,
    @CurrentUser() user: UserSession,
  ) {
    return this.svc.listPromotions(user.companyId, { status, employeeId });
  }

  /**
   * Auto-suggest promotion candidates based on Tier 3 rules
   * (tenure ≥ 12 months + attendance ≥ 90%).
   */
  @Get('promotions/suggest')
  @RequirePermission('Employee', 'read')
  suggestCandidates(@CurrentUser() user: UserSession) {
    return this.svc.suggestCandidates(user.companyId);
  }

  @Get('promotions/:id')
  @RequirePermission('Employee', 'read')
  getPromotion(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.findOnePromotion(id, user.companyId);
  }

  @Patch('promotions/:id/submit')
  @RequirePermission('Employee', 'update')
  submitPromotion(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.submitPromotion(id, user);
  }

  /** HR Manager approval — step 1 of 2. */
  @Patch('promotions/:id/hr-approve')
  @RequirePermission('Employee', 'approve')
  hrApprove(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: UserSession,
  ) {
    const dto = ApprovePromotionSchema.parse(body);
    return this.svc.hrApprove(id, dto, user);
  }

  /** Director final approval — step 2 of 2. Updates employee record. */
  @Patch('promotions/:id/director-approve')
  @RequirePermission('Employee', 'approve')
  directorApprove(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: UserSession,
  ) {
    const dto = ApprovePromotionSchema.parse(body);
    return this.svc.directorApprove(id, dto, user);
  }

  /** Reject at either pending step. Requires a rejection note. */
  @Patch('promotions/:id/reject')
  @RequirePermission('Employee', 'approve')
  rejectPromotion(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: UserSession,
  ) {
    const dto = RejectPromotionSchema.parse(body);
    return this.svc.rejectPromotion(id, dto, user);
  }
}
