import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  BudgetService,
  CreateBudgetDto,
  UpdateBudgetDto,
} from './budget.service';
import { VarianceService } from './variance.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('finance/budgets')
export class BudgetController {
  constructor(
    private readonly budgets: BudgetService,
    private readonly variance: VarianceService,
  ) {}

  @Get()
  @RequirePermission('GL', 'read')
  list(
    @CurrentUser() session: UserSession,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('status') status?: string,
  ) {
    return this.budgets.list(session.companyId, {
      fiscalYear: fiscalYear ? Number(fiscalYear) : undefined,
      status,
    });
  }

  @Get(':id')
  @RequirePermission('GL', 'read')
  get(@Param('id') id: string, @CurrentUser() session: UserSession) {
    return this.budgets.get(id, session.companyId);
  }

  @Post()
  @RequirePermission('GL', 'create')
  create(@Body() dto: CreateBudgetDto, @CurrentUser() session: UserSession) {
    return this.budgets.create(dto, session);
  }

  @Put(':id')
  @RequirePermission('GL', 'update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBudgetDto,
    @CurrentUser() session: UserSession,
  ) {
    return this.budgets.update(id, dto, session);
  }

  @Post(':id/activate')
  @RequirePermission('GL', 'submit')
  activate(@Param('id') id: string, @CurrentUser() session: UserSession) {
    return this.budgets.activate(id, session);
  }

  @Post(':id/close')
  @RequirePermission('GL', 'submit')
  close(@Param('id') id: string, @CurrentUser() session: UserSession) {
    return this.budgets.close(id, session);
  }

  @Get(':id/variance')
  @RequirePermission('GL', 'read')
  variance_report(
    @Param('id') id: string,
    @CurrentUser() session: UserSession,
    @Query('period') period?: string,
  ) {
    return this.variance.getVariance(
      id,
      session.companyId,
      period ? Number(period) : undefined,
    );
  }
}
