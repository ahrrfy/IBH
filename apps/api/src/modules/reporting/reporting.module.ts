import { Module } from '@nestjs/common';
import { AuditModule } from '../../engines/audit/audit.module';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { DashboardsService } from './dashboards.service';
import { DashboardsController } from './dashboards.controller';

@Module({
  imports: [AuditModule],
  controllers: [ReportsController, DashboardsController],
  providers: [ReportsService, DashboardsService],
  exports: [ReportsService, DashboardsService],
})
export class ReportingModule {}
