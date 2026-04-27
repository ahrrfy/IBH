import { Module } from '@nestjs/common';
import { AuditModule } from '../../engines/audit/audit.module';
import { LicensingService } from './licensing.service';
import { LicensingController } from './licensing.controller';
import { FingerprintService } from './fingerprint.service';

@Module({
  imports: [AuditModule],
  controllers: [LicensingController],
  providers: [LicensingService, FingerprintService],
  exports: [LicensingService, FingerprintService],
})
export class LicensingModule {}
