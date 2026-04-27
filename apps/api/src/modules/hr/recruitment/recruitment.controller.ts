import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { RecruitmentService } from './recruitment.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';
import {
  CreateJobPostingSchema,
  UpdateJobPostingSchema,
  TransitionApplicationSchema,
  ScheduleInterviewSchema,
  RecordInterviewOutcomeSchema,
  CreateOfferLetterSchema,
} from './dto/recruitment.dto';

/**
 * Internal recruitment endpoints — RBAC-protected.
 * Public application intake lives in `recruitment-public.controller.ts`.
 */
@Controller('hr/recruitment')
export class RecruitmentController {
  constructor(private readonly svc: RecruitmentService) {}

  // ── Job postings ──────────────────────────────────────────────────────
  @Post('postings')
  @RequirePermission('Employee', 'create')
  createPosting(@Body() body: unknown, @CurrentUser() user: UserSession) {
    const dto = CreateJobPostingSchema.parse(body);
    return this.svc.createJobPosting(dto, user);
  }

  @Get('postings')
  @RequirePermission('Employee', 'read')
  listPostings(
    @CurrentUser() user: UserSession,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.svc.listJobPostings(user.companyId, { status, search });
  }

  @Get('postings/:id')
  @RequirePermission('Employee', 'read')
  getPosting(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.getJobPosting(id, user.companyId);
  }

  @Patch('postings/:id')
  @RequirePermission('Employee', 'update')
  updatePosting(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: UserSession) {
    const dto = UpdateJobPostingSchema.parse(body);
    return this.svc.updateJobPosting(id, dto, user);
  }

  @Post('postings/:id/open')
  @RequirePermission('Employee', 'approve')
  openPosting(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.setJobPostingStatus(id, 'open', user);
  }

  @Post('postings/:id/pause')
  @RequirePermission('Employee', 'approve')
  pausePosting(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.setJobPostingStatus(id, 'paused', user);
  }

  @Post('postings/:id/close')
  @RequirePermission('Employee', 'approve')
  closePosting(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.setJobPostingStatus(id, 'closed', user);
  }

  // ── Applications kanban ───────────────────────────────────────────────
  @Get('applications')
  @RequirePermission('Employee', 'read')
  listApps(
    @CurrentUser() user: UserSession,
    @Query('jobPostingId') jobPostingId?: string,
    @Query('status') status?: string,
  ) {
    return this.svc.listApplications(user.companyId, { jobPostingId, status });
  }

  @Get('applications/:id')
  @RequirePermission('Employee', 'read')
  getApp(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.getApplication(id, user.companyId);
  }

  @Post('applications/:id/transition')
  @RequirePermission('Employee', 'update')
  transitionApp(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: UserSession,
  ) {
    const dto = TransitionApplicationSchema.parse(body);
    return this.svc.transitionApplication(id, dto, user);
  }

  // ── Interview rounds ──────────────────────────────────────────────────
  @Post('applications/:id/interviews')
  @RequirePermission('Employee', 'update')
  scheduleInterview(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: UserSession,
  ) {
    const dto = ScheduleInterviewSchema.parse(body);
    return this.svc.scheduleInterview(id, dto, user);
  }

  @Patch('interviews/:stageId')
  @RequirePermission('Employee', 'update')
  recordOutcome(
    @Param('stageId') stageId: string,
    @Body() body: unknown,
    @CurrentUser() user: UserSession,
  ) {
    const dto = RecordInterviewOutcomeSchema.parse(body);
    return this.svc.recordInterviewOutcome(stageId, dto, user);
  }

  // ── Offer letters ─────────────────────────────────────────────────────
  @Post('applications/:id/offer')
  @RequirePermission('Employee', 'approve')
  createOffer(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: UserSession,
  ) {
    const dto = CreateOfferLetterSchema.parse(body);
    return this.svc.createOffer(id, dto, user);
  }

  @Post('offers/:offerId/send')
  @RequirePermission('Employee', 'approve')
  sendOffer(@Param('offerId') offerId: string, @CurrentUser() user: UserSession) {
    return this.svc.sendOffer(offerId, user);
  }
}
