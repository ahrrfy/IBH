import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ModuleRef } from '@nestjs/core';
import { AuditModule } from '../../engines/audit/audit.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PostingModule } from '../../engines/posting/posting.module';

import { DataMigrationController } from './data-migration.controller';
import { DataMigrationService } from './data-migration.service';

// Parsers
import { CsvParser } from './parsers/csv.parser';
import { XlsxParser } from './parsers/xlsx.parser';
import { JsonParser } from './parsers/json.parser';

// Mappers
import { AutoMapper } from './mappers/auto-mapper';

// Transformers
import { ArabicTextTransformer } from './transformers/arabic-text.transformer';
import { CurrencyTransformer } from './transformers/currency.transformer';
import { DateTransformer } from './transformers/date.transformer';
import { PhoneTransformer } from './transformers/phone.transformer';

// Validators
import { FormatValidator } from './validators/format.validator';
import { BusinessRuleValidator } from './validators/business-rule.validator';
import { ReferentialIntegrityValidator } from './validators/referential-integrity.validator';
import { ValidationPipeline } from './validators/validation-pipeline';

// Importers
import { ALL_IMPORTERS } from './importers/entity-importers';

// Processor + Reports + Utilities
import { ImportProcessor } from './processors/import.processor';
import { ErrorReportService } from './reports/error-report.service';
import { SummaryService } from './reports/summary.service';
import { DuplicateDetector } from './duplicate-detection/duplicate-detector';
import { RollbackService } from './rollback/rollback.service';
import { TemplateGeneratorService } from './templates/template-generator.service';
import type { IEntityImporter } from './importers/importer.interface';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'data-migration' }),
    AuditModule,
    InventoryModule,
    PostingModule,
  ],
  controllers: [DataMigrationController],
  providers: [
    DataMigrationService,
    CsvParser,
    XlsxParser,
    JsonParser,
    AutoMapper,
    ArabicTextTransformer,
    CurrencyTransformer,
    DateTransformer,
    PhoneTransformer,
    FormatValidator,
    BusinessRuleValidator,
    ReferentialIntegrityValidator,
    ValidationPipeline,
    ...ALL_IMPORTERS,
    ImportProcessor,
    ErrorReportService,
    SummaryService,
    DuplicateDetector,
    RollbackService,
    TemplateGeneratorService,
  ],
})
export class DataMigrationModule implements OnModuleInit {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly service: DataMigrationService,
  ) {}

  onModuleInit(): void {
    const importers: IEntityImporter[] = ALL_IMPORTERS.map((cls) =>
      this.moduleRef.get(cls, { strict: false }),
    );
    this.service.registerImporters(importers);
  }
}
