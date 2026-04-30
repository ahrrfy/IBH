import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Res,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { RequirePermission } from '../../engines/auth/decorators/require-permission.decorator';
import { CurrentUser } from '../../engines/auth/decorators/current-user.decorator';
import { DataMigrationService } from './data-migration.service';
import {
  createImportSessionSchema,
  selectSheetSchema,
  confirmMappingSchema,
  listSessionsQuerySchema,
  IMPORTABLE_ENTITY_TYPES,
  type ImportableEntityType,
} from './dto/data-migration.dto';

interface UploadedFileDto {
  buffer: Buffer;
  originalname: string;
  size: number;
  mimetype: string;
}

@Controller('data-migration')
export class DataMigrationController {
  constructor(private readonly service: DataMigrationService) {}

  // ─── Entity Types + Templates ────────────────────────────────────────────

  @Get('entity-types')
  @RequirePermission('DataMigration', 'read')
  getEntityTypes() {
    return this.service.getEntityTypes();
  }

  @Get('templates/:entityType')
  @RequirePermission('DataMigration', 'read')
  async getTemplate(@Param('entityType') entityType: string, @Res() res: Response) {
    if (!IMPORTABLE_ENTITY_TYPES.includes(entityType as any)) {
      return res.status(400).json({ messageAr: 'نوع كيان غير معروف', messageEn: 'Unknown entity type' });
    }
    const buffer = await this.service.getTemplate(entityType as ImportableEntityType);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=template-${entityType}.xlsx`);
    return res.send(buffer);
  }

  // ─── Sessions ────────────────────────────────────────────────────────────

  @Get('sessions')
  @RequirePermission('DataMigration', 'read')
  listSessions(@CurrentUser() user: any, @Query() query: any) {
    const parsed = listSessionsQuerySchema.parse(query);
    return this.service.listSessions(user.companyId, parsed);
  }

  @Get('sessions/:id')
  @RequirePermission('DataMigration', 'read')
  getSession(@Param('id') id: string) {
    return this.service.getSession(id);
  }

  // ─── Step 1: Upload ──────────────────────────────────────────────────────

  @Post('sessions')
  @RequirePermission('DataMigration', 'create')
  @UseInterceptors(FileInterceptor('file'))
  async createSession(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 })],
      }),
    )
    file: UploadedFileDto,
    @Body('entityType') entityType: string,
    @CurrentUser() user: any,
  ) {
    const parsed = createImportSessionSchema.parse({ entityType });
    return this.service.createSession(
      { buffer: file.buffer, originalname: file.originalname, size: file.size },
      parsed.entityType,
      { userId: user.userId, companyId: user.companyId, branchId: user.branchId },
    );
  }

  // ─── Step 2: Select Sheet ────────────────────────────────────────────────

  @Patch('sessions/:id/sheet')
  @RequirePermission('DataMigration', 'create')
  @UseInterceptors(FileInterceptor('file'))
  async selectSheet(
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFile() file: UploadedFileDto,
  ) {
    const parsed = selectSheetSchema.parse(body);
    return this.service.selectSheet(id, parsed.sheetName, file.buffer);
  }

  // ─── Step 3: Auto-Map + Confirm ──────────────────────────────────────────

  @Get('sessions/:id/auto-map')
  @RequirePermission('DataMigration', 'read')
  getAutoMap(@Param('id') id: string) {
    return this.service.getAutoMap(id);
  }

  @Patch('sessions/:id/mapping')
  @RequirePermission('DataMigration', 'create')
  confirmMapping(@Param('id') id: string, @Body() body: any) {
    const parsed = confirmMappingSchema.parse(body);
    return this.service.confirmMapping(id, parsed);
  }

  // ─── Step 4: Validate ────────────────────────────────────────────────────

  @Post('sessions/:id/validate')
  @RequirePermission('DataMigration', 'create')
  startValidation(@Param('id') id: string) {
    return this.service.startValidation(id);
  }

  @Get('sessions/:id/preview')
  @RequirePermission('DataMigration', 'read')
  getPreview(@Param('id') id: string) {
    return this.service.getPreview(id);
  }

  // ─── Step 5: Import ──────────────────────────────────────────────────────

  @Post('sessions/:id/import')
  @RequirePermission('DataMigration', 'create')
  startImport(@Param('id') id: string) {
    return this.service.startImport(id);
  }

  @Post('sessions/:id/pause')
  @RequirePermission('DataMigration', 'create')
  pauseImport(@Param('id') id: string) {
    return this.service.pauseImport(id);
  }

  @Post('sessions/:id/resume')
  @RequirePermission('DataMigration', 'create')
  resumeImport(@Param('id') id: string) {
    return this.service.resumeImport(id);
  }

  // ─── Step 6: Summary + Report + Rollback ─────────────────────────────────

  @Get('sessions/:id/summary')
  @RequirePermission('DataMigration', 'read')
  getSummary(@Param('id') id: string) {
    return this.service.getSummary(id);
  }

  @Get('sessions/:id/error-report')
  @RequirePermission('DataMigration', 'read')
  async getErrorReport(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.service.getErrorReport(id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=error-report-${id}.xlsx`);
    return res.send(buffer);
  }

  @Post('sessions/:id/rollback')
  @RequirePermission('DataMigration', 'create')
  rollback(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.rollback(id, user.userId);
  }

  @Get('sessions/:id/errors')
  @RequirePermission('DataMigration', 'read')
  getErrors(@Param('id') id: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.service.getErrors(id, page ? Number(page) : 1, limit ? Number(limit) : 50);
  }
}
