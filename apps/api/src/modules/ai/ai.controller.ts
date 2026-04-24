import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AiService } from './ai.service';
import { AnomalyDetectionService } from './anomaly-detection.service';
import { NlQueryService } from './nl-query.service';
import { ForecastingService } from './forecasting.service';
import { CurrentUser } from '../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../engines/auth/decorators/require-permission.decorator';
import { Public } from '../../engines/auth/decorators/public.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly anomalies: AnomalyDetectionService,
    private readonly nlQuery: NlQueryService,
    private readonly forecasting: ForecastingService,
  ) {}

  @Get('health')
  @Public()
  health() {
    return this.ai.healthCheck();
  }

  @Get('anomalies')
  @RequirePermission('AI', 'use')
  anomaliesList(@CurrentUser() session: UserSession) {
    return this.anomalies.runAllChecks(session.companyId);
  }

  @Post('anomalies/explain')
  @RequirePermission('AI', 'use')
  explain(@Body() dto: any) {
    return this.ai.explainAnomaly(dto);
  }

  @Post('nl-query')
  @RequirePermission('AI', 'use')
  nl(@Body() dto: { query: string }, @CurrentUser() session: UserSession) {
    return this.nlQuery.executeQuery(dto.query, session.companyId, session);
  }

  @Post('copilot')
  @RequirePermission('AI', 'use')
  copilot(@Body() dto: any) {
    return this.ai.copilotSuggest(dto);
  }

  @Get('forecast/sales')
  @RequirePermission('AI', 'use')
  forecastSales(@CurrentUser() session: UserSession, @Query() q: any) {
    return this.forecasting.forecastSales(session.companyId, {
      variantId: q.variantId,
      categoryId: q.categoryId,
      horizonDays: q.horizonDays ? Number(q.horizonDays) : 30,
    });
  }

  @Get('forecast/reorder/:variantId')
  @RequirePermission('AI', 'use')
  reorder(@CurrentUser() session: UserSession, @Query('variantId') variantId: string) {
    return this.forecasting.forecastReorderPoint(variantId, session.companyId);
  }

  @Get('forecast/seasonality')
  @RequirePermission('AI', 'use')
  seasonality(@CurrentUser() session: UserSession) {
    return this.forecasting.seasonalityDetection(session.companyId);
  }
}
