import { Module } from '@nestjs/common';
import { DeliveryCompaniesController } from './delivery-companies.controller';
import { DeliveryCompaniesService } from './delivery-companies.service';
import { DeliveryZonesService } from './delivery-zones.service';
import { AutoAssignService } from './auto-assign.service';
import { AuditModule } from '../../../engines/audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [DeliveryCompaniesController],
  providers: [DeliveryCompaniesService, DeliveryZonesService, AutoAssignService],
  exports: [DeliveryCompaniesService, DeliveryZonesService, AutoAssignService],
})
export class DeliveryCompaniesModule {}
