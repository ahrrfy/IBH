import { Module } from '@nestjs/common';
import { AuditModule } from '../../engines/audit/audit.module';
import { SequenceModule } from '../../engines/sequence/sequence.module';
import { PostingModule } from '../../engines/posting/posting.module';
import { GLService } from './gl/gl.service';
import { GLController } from './gl/gl.controller';
import { BankAccountsService } from './banks/bank-accounts.service';
import { BankAccountsController } from './banks/bank-accounts.controller';
import { ReconciliationService } from './banks/reconciliation.service';
import { ReconciliationController } from './banks/reconciliation.controller';
import { PaymentReceiptsService } from './ar/payment-receipts.service';
import { PaymentReceiptsController } from './ar/payment-receipts.controller';
import { PeriodCloseService } from './period/period-close.service';
import { PeriodCloseController } from './period/period-close.controller';
import { FinancialReportsService } from './reports/financial-reports.service';
import { FinancialReportsController } from './reports/financial-reports.controller';
import { AccountMappingService } from './account-mapping/account-mapping.service';
import { AccountMappingController } from './account-mapping/account-mapping.controller';

@Module({
  imports: [AuditModule, SequenceModule, PostingModule],
  controllers: [
    GLController,
    BankAccountsController,
    ReconciliationController,
    PaymentReceiptsController,
    PeriodCloseController,
    FinancialReportsController,
    AccountMappingController,
  ],
  providers: [
    GLService,
    BankAccountsService,
    ReconciliationService,
    PaymentReceiptsService,
    PeriodCloseService,
    FinancialReportsService,
    AccountMappingService,
  ],
  exports: [GLService, BankAccountsService, FinancialReportsService, AccountMappingService],
})
export class FinanceModule {}
