import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { AuditService } from '../../engines/audit/audit.service';
import { CsvParser } from './parsers/csv.parser';
import { XlsxParser } from './parsers/xlsx.parser';
import { JsonParser } from './parsers/json.parser';
import { AutoMapper } from './mappers/auto-mapper';
import { ErrorReportService } from './reports/error-report.service';
import { SummaryService } from './reports/summary.service';
import { RollbackService } from './rollback/rollback.service';
import { TemplateGeneratorService } from './templates/template-generator.service';
import { ImportProcessor } from './processors/import.processor';
import type { IEntityImporter } from './importers/importer.interface';
import {
  IMPORTABLE_ENTITY_TYPES,
  ENTITY_DEPENDENCIES,
  ENTITY_LABELS,
  type ImportableEntityType,
  type ConfirmMappingDto,
} from './dto/data-migration.dto';
import type { ParseResult, SheetInfo } from './parsers/parser.interface';

@Injectable()
export class DataMigrationService implements OnModuleInit {
  private readonly logger = new Logger(DataMigrationService.name);
  private importers: IEntityImporter[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectQueue('data-migration') private readonly importQueue: Queue,
    private readonly csvParser: CsvParser,
    private readonly xlsxParser: XlsxParser,
    private readonly jsonParser: JsonParser,
    private readonly autoMapper: AutoMapper,
    private readonly errorReportService: ErrorReportService,
    private readonly summaryService: SummaryService,
    private readonly rollbackService: RollbackService,
    private readonly templateGenerator: TemplateGeneratorService,
    private readonly importProcessor: ImportProcessor,
  ) {}

  registerImporters(importers: IEntityImporter[]): void {
    this.importers = importers;
    this.importProcessor.registerImporters(importers);
    this.rollbackService.registerImporters(importers);
    this.templateGenerator.registerImporters(importers);
  }

  onModuleInit(): void {
    this.logger.log(`DataMigration: ${this.importers.length} importers registered`);
  }

  // ─── Step 1: Upload ──────────────────────────────────────────────────────

  async createSession(
    file: { buffer: Buffer; originalname: string; size: number },
    entityType: ImportableEntityType,
    user: { userId: string; companyId: string; branchId: string | null },
  ) {
    const format = this.detectFormat(file.originalname);

    const missing = await this.checkDependencies(entityType, user.companyId);
    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'MISSING_DEPENDENCIES',
        messageAr: `يجب استيراد التبعيات أولاً: ${missing.map((d) => ENTITY_LABELS[d]?.ar).join('، ')}`,
        messageEn: `Import dependencies first: ${missing.map((d) => ENTITY_LABELS[d]?.en).join(', ')}`,
        missing,
      });
    }

    const parser = this.getParser(format);
    let sheets: SheetInfo[] = [];
    if (format === 'xlsx') {
      sheets = await parser.listSheets(file.buffer);
    }

    let parseResult: ParseResult | null = null;
    if (format !== 'xlsx' || sheets.length <= 1) {
      parseResult = await parser.parse(file.buffer, sheets[0]?.name);
    }

    const session = await this.prisma.importSession.create({
      data: {
        companyId: user.companyId,
        branchId: user.branchId,
        entityType,
        status: format === 'xlsx' && sheets.length > 1 ? 'sheet_selection' : 'mapping',
        fileName: file.originalname,
        fileFormat: format,
        fileSizeBytes: file.size,
        totalRows: parseResult?.totalRows ?? 0,
        createdBy: user.userId,
      },
    });

    if (parseResult && parseResult.rows.length > 0) {
      await this.storeRows(session.id, parseResult.rows);
    }

    await this.auditLog('DataMigration.Create', session.id, user);

    return {
      sessionId: session.id,
      status: session.status,
      sheets: sheets.length > 1 ? sheets : undefined,
      columns: parseResult?.headers,
      sampleRows: parseResult?.rows.slice(0, 5),
      totalRows: parseResult?.totalRows ?? 0,
    };
  }

  // ─── Step 2: Select Sheet ────────────────────────────────────────────────

  async selectSheet(sessionId: string, sheetName: string, fileBuffer: Buffer) {
    const session = await this.getSession(sessionId);
    if (session.status !== 'sheet_selection') {
      throw new BadRequestException('Session is not in sheet_selection status');
    }

    const parseResult = await this.xlsxParser.parse(fileBuffer, sheetName);
    if (parseResult.rows.length === 0) {
      throw new BadRequestException({ messageAr: 'الورقة فارغة', messageEn: 'Sheet is empty' });
    }

    await this.storeRows(sessionId, parseResult.rows);

    await this.prisma.importSession.update({
      where: { id: sessionId },
      data: { status: 'mapping', sheetName, totalRows: parseResult.totalRows },
    });

    return {
      columns: parseResult.headers,
      sampleRows: parseResult.rows.slice(0, 5),
      totalRows: parseResult.totalRows,
    };
  }

  // ─── Step 3: Auto-Map + Confirm ──────────────────────────────────────────

  async getAutoMap(sessionId: string) {
    const session = await this.getSession(sessionId);
    const sampleRow = await this.prisma.importRow.findFirst({
      where: { sessionId },
      orderBy: { rowNumber: 'asc' },
    });
    if (!sampleRow) throw new BadRequestException('No rows found');

    const sourceColumns = Object.keys(sampleRow.sourceData as object);
    return this.autoMapper.autoMap(session.entityType as ImportableEntityType, sourceColumns);
  }

  async confirmMapping(sessionId: string, dto: ConfirmMappingDto) {
    await this.prisma.importSession.update({
      where: { id: sessionId },
      data: {
        status: 'mapping',
        fieldMapping: dto.mapping as any,
        options: dto.options as any,
      },
    });
    return { status: 'mapping_confirmed' };
  }

  // ─── Step 4: Validate ────────────────────────────────────────────────────

  async startValidation(sessionId: string) {
    const session = await this.getSession(sessionId);
    const mapping = session.fieldMapping as Record<string, string>;
    const options = (session.options ?? {}) as Record<string, string>;

    await this.importQueue.add('validate', {
      sessionId,
      companyId: session.companyId,
      branchId: session.branchId,
      userId: session.createdBy,
      entityType: session.entityType,
      mapping,
      dateFormat: options['dateFormat'] ?? 'auto',
      duplicateStrategy: options['duplicateStrategy'] ?? 'skip',
    });

    return { status: 'validating' };
  }

  async getPreview(sessionId: string) {
    const session = await this.getSession(sessionId);

    const sampleValid = await this.prisma.importRow.findMany({
      where: { sessionId, status: { in: ['valid', 'warning'] } },
      take: 10,
      orderBy: { rowNumber: 'asc' },
    });

    const sampleErrors = await this.prisma.importRow.findMany({
      where: { sessionId, status: 'error' },
      take: 10,
      orderBy: { rowNumber: 'asc' },
    });

    return {
      summary: {
        total: session.totalRows,
        valid: session.validRows,
        errors: session.errorRows,
        status: session.status,
      },
      sampleValid: sampleValid.map((r) => ({
        rowNumber: r.rowNumber,
        data: r.transformedData ?? r.sourceData,
        warnings: r.warnings,
      })),
      sampleErrors: sampleErrors.map((r) => ({
        rowNumber: r.rowNumber,
        data: r.sourceData,
        errors: r.validationErrors,
      })),
    };
  }

  // ─── Step 5: Import ──────────────────────────────────────────────────────

  async startImport(sessionId: string) {
    const session = await this.getSession(sessionId);
    if (!['ready', 'paused'].includes(session.status)) {
      throw new BadRequestException(`Cannot import from status: ${session.status}`);
    }

    const mapping = session.fieldMapping as Record<string, string>;
    const options = (session.options ?? {}) as Record<string, string>;

    await this.importQueue.add('import', {
      sessionId,
      companyId: session.companyId,
      branchId: session.branchId,
      userId: session.createdBy,
      entityType: session.entityType,
      mapping,
      dateFormat: options['dateFormat'] ?? 'auto',
      duplicateStrategy: options['duplicateStrategy'] ?? 'skip',
    });

    return { status: 'importing' };
  }

  async pauseImport(sessionId: string) {
    await this.prisma.importSession.update({
      where: { id: sessionId },
      data: { status: 'paused' },
    });
    return { status: 'paused' };
  }

  async resumeImport(sessionId: string) {
    return this.startImport(sessionId);
  }

  // ─── Step 6: Summary + Report + Rollback ─────────────────────────────────

  async getSummary(sessionId: string) {
    return this.summaryService.getSummary(sessionId);
  }

  async getErrorReport(sessionId: string): Promise<Buffer> {
    return this.errorReportService.generateErrorReport(sessionId);
  }

  async rollback(sessionId: string, userId: string) {
    const result = await this.rollbackService.rollback(sessionId, userId);
    const session = await this.getSession(sessionId);
    await this.auditLog('DataMigration.Rollback', sessionId, {
      userId,
      companyId: session.companyId,
      branchId: session.branchId,
    });
    return result;
  }

  // ─── Templates ───────────────────────────────────────────────────────────

  async getTemplate(entityType: ImportableEntityType): Promise<Buffer> {
    return this.templateGenerator.generateTemplate(entityType);
  }

  // ─── Entity Types ────────────────────────────────────────────────────────

  getEntityTypes() {
    return IMPORTABLE_ENTITY_TYPES.map((et) => ({
      type: et,
      label: ENTITY_LABELS[et],
      dependencies: ENTITY_DEPENDENCIES[et],
    }));
  }

  // ─── Sessions ────────────────────────────────────────────────────────────

  async getSession(sessionId: string) {
    const session = await this.prisma.importSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  async listSessions(
    companyId: string,
    filters: { status?: string; entityType?: string; page: number; limit: number },
  ) {
    const where: any = { companyId };
    if (filters.status) where.status = filters.status;
    if (filters.entityType) where.entityType = filters.entityType;

    const [items, total] = await Promise.all([
      this.prisma.importSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      this.prisma.importSession.count({ where }),
    ]);

    return { items, total, page: filters.page, limit: filters.limit };
  }

  async getErrors(sessionId: string, page = 1, limit = 50) {
    const [items, total] = await Promise.all([
      this.prisma.importRow.findMany({
        where: { sessionId, status: 'error' },
        orderBy: { rowNumber: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.importRow.count({ where: { sessionId, status: 'error' } }),
    ]);
    return { items, total, page, limit };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private detectFormat(filename: string): 'csv' | 'xlsx' | 'json' {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'csv') return 'csv';
    if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
    if (ext === 'json') return 'json';
    throw new BadRequestException({
      messageAr: 'صيغة الملف غير مدعومة. استخدم CSV أو XLSX أو JSON',
      messageEn: 'Unsupported format. Use CSV, XLSX, or JSON',
    });
  }

  private getParser(format: string) {
    switch (format) {
      case 'csv': return this.csvParser;
      case 'xlsx': return this.xlsxParser;
      case 'json': return this.jsonParser;
      default: throw new BadRequestException('Unsupported format');
    }
  }

  private async storeRows(sessionId: string, rows: Record<string, unknown>[]): Promise<void> {
    const data = rows.map((row, idx) => ({
      sessionId,
      rowNumber: idx + 1,
      status: 'pending',
      sourceData: row as any,
    }));

    for (let i = 0; i < data.length; i += 500) {
      await this.prisma.importRow.createMany({ data: data.slice(i, i + 500) });
    }
  }

  private async checkDependencies(
    entityType: ImportableEntityType,
    companyId: string,
  ): Promise<ImportableEntityType[]> {
    const deps = ENTITY_DEPENDENCIES[entityType];
    const missing: ImportableEntityType[] = [];

    for (const dep of deps) {
      const hasData = await this.hasDataForEntity(dep, companyId);
      if (!hasData) {
        const session = await this.prisma.importSession.findFirst({
          where: { companyId, entityType: dep, status: { in: ['completed', 'completed_partial'] } },
        });
        if (!session) missing.push(dep);
      }
    }

    return missing;
  }

  private async hasDataForEntity(
    entityType: ImportableEntityType,
    companyId: string,
  ): Promise<boolean> {
    // Each table tracks soft-delete differently:
    //   - 'deletedAt'  → row excluded when deletedAt IS NOT NULL
    //   - 'isActive'   → row excluded when isActive = false
    //   - 'none'       → no soft-delete column (count any row)
    const tableMap: Record<string, { table: string; soft: 'deletedAt' | 'isActive' | 'none' }> = {
      product_category:  { table: 'productCategory', soft: 'isActive' },
      unit_of_measure:   { table: 'unitOfMeasure',   soft: 'isActive' },
      product_template:  { table: 'productTemplate', soft: 'deletedAt' },
      product_variant:   { table: 'productVariant',  soft: 'deletedAt' },
      warehouse:         { table: 'warehouse',       soft: 'deletedAt' },
      customer:          { table: 'customer',        soft: 'deletedAt' },
      supplier:          { table: 'supplier',        soft: 'deletedAt' },
      chart_of_accounts: { table: 'chartOfAccount',  soft: 'isActive' },
      department:        { table: 'department',      soft: 'isActive' },
    };

    const entry = tableMap[entityType];
    if (!entry) return false;

    const db = this.prisma as any;
    if (!db[entry.table]) return false;

    const where: any = { companyId };
    if (entry.soft === 'deletedAt') where.deletedAt = null;
    if (entry.soft === 'isActive') where.isActive = true;

    const count = await db[entry.table].count({ where });
    return count > 0;
  }

  private async auditLog(
    action: string,
    entityId: string,
    user: { userId: string; companyId: string; branchId: string | null },
  ) {
    await this.audit.log({
      companyId: user.companyId,
      userId: user.userId,
      action: action as any,
      entityType: 'ImportSession',
      entityId,
    });
  }
}
