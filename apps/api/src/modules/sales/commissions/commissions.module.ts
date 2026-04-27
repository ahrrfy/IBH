import { Module } from '@nestjs/common';
import { CommissionsController } from './commissions.controller';
import { CommissionsService } from './commissions.service';
import { CommissionsListener } from './commissions.listener';
import { AuditModule } from '../../../engines/audit/audit.module';
import { PostingModule } from '../../../engines/posting/posting.module';

/**
 * SalesCommissionsModule (T43).
 *
 * Self-contained module under the Sales sub-tree. Listens to existing
 * domain events ('invoice.posted', 'sales.return.posted') — never touches
 * payroll code. The HR Payroll integration lives in the read-only bridge
 * file `apps/api/src/modules/hr/payroll/commission-bridge.ts`, which
 * imports CommissionsService from here.
 */
@Module({
  imports: [AuditModule, PostingModule],
  controllers: [CommissionsController],
  providers: [CommissionsService, CommissionsListener],
  exports: [CommissionsService],
})
export class SalesCommissionsModule {}
