import { Module } from '@nestjs/common';
import { AuditModule } from '../../../engines/audit/audit.module';
import { AdminLicensingController } from './admin-licensing.controller';
import { AdminLicensingService } from './admin-licensing.service';

@Module({
  imports: [AuditModule],
  controllers: [AdminLicensingController],
  providers: [AdminLicensingService],
  exports: [AdminLicensingService],
})
export class AdminLicensingModule {}
