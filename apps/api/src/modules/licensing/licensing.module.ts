import { Module } from '@nestjs/common';
import { AuditModule } from '../../engines/audit/audit.module';
import { LicensingService } from './licensing.service';
import { LicensingController } from './licensing.controller';

@Module({
  imports: [AuditModule],
  controllers: [LicensingController],
  providers: [LicensingService],
  exports: [LicensingService],
})
export class LicensingModule {}
