import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { AuditService } from '../../engines/audit/audit.service';
import type { UserSession } from '@erp/shared-types';

// Tables the AI Brain is allowed to query. Anything outside this list — even
// if the FORBIDDEN_KEYWORDS regex passes — is rejected. Table names are
// extracted from the generated SQL by simple tokenization (FROM / JOIN).
const ALLOWED_TABLES = new Set([
  'sales_invoices',
  'customers',
  'inventory_balances',
  'journal_entry_lines',
]);

// Reject any non-SELECT keyword and DDL. Matched as whole words.
const FORBIDDEN_KEYWORDS = /\b(DROP|DELETE|UPDATE|ALTER|INSERT|TRUNCATE|CREATE|GRANT|REVOKE|MERGE|CALL|DO|COPY|EXECUTE)\b/i;

// Cap result rows so a runaway SELECT can't OOM the API.
const MAX_RESULT_ROWS = 5000;

// Hard cap so a single statement can't ship a megabyte to the AI logs.
const MAX_SQL_LEN = 4000;

@Injectable()
export class NlQueryService {
  constructor(private prisma: PrismaService, private config: ConfigService, private audit: AuditService) {}

  private get brainUrl(): string | undefined {
    return this.config.get<string>('AI_BRAIN_URL');
  }

  private get apiKey(): string | undefined {
    return this.config.get<string>('AI_BRAIN_API_KEY');
  }

  // Extract table identifiers that follow FROM or JOIN clauses.
  // Comments and string literals are stripped first so a payload that hides
  // a table name inside a SQL block comment can't smuggle it past the check.
  private extractTables(sql: string): string[] {
    const stripped = sql
      .replace(/'(?:[^']|'')*'/g, "''")              // single-quoted strings
      .replace(/--[^\n\r]*/g, ' ')                   // line comments
      .replace(/\/\*[\s\S]*?\*\//g, ' ');            // block comments

    const tables: string[] = [];
    const re = /\b(?:FROM|JOIN)\s+("?([a-zA-Z_][a-zA-Z0-9_]*)"?)/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(stripped)) !== null) {
      tables.push(match[2].toLowerCase());
    }
    return tables;
  }

  /**
   * Run the AI-generated SELECT inside an explicit READ ONLY transaction so
   * Postgres itself blocks any write attempt — defense in depth on top of the
   * keyword and table-name checks. Rolled back regardless of outcome.
   */
  private async runReadOnly(sql: string, companyId: string): Promise<any[]> {
    return this.prisma.$transaction(async (tx) => {
      // Set the tenant for any RLS policy that reads app.current_company_id.
      await tx.$executeRawUnsafe(`SET LOCAL app.current_company_id = '${companyId.replace(/'/g, "''")}'`);
      // Block writes for the rest of this transaction.
      await tx.$executeRawUnsafe(`SET TRANSACTION READ ONLY`);
      const rows = (await tx.$queryRawUnsafe(sql)) as any[];
      return Array.isArray(rows) ? rows.slice(0, MAX_RESULT_ROWS) : [];
    });
  }

  async executeQuery(nlQuery: string, companyId: string, session: UserSession) {
    if (!this.brainUrl) {
      return { available: false, message: 'تُفعَّل هذه الميزة عند تثبيت نموذج AI' };
    }

    if (!nlQuery || !nlQuery.trim()) {
      throw new BadRequestException({ code: 'QUERY_REQUIRED', messageAr: 'الاستعلام مطلوب' });
    }

    let brainResp: any;
    try {
      const res = await fetch(`${this.brainUrl}/nl-query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          query: nlQuery,
          companyId,
          allowedTables: [...ALLOWED_TABLES],
          userRole: session.roles?.[0] ?? 'user',
        }),
      });
      if (!res.ok) return { available: false, message: 'AI service error' };
      brainResp = await res.json();
    } catch {
      return { available: false, message: 'AI service unavailable' };
    }

    const generatedSql: string | undefined = brainResp?.sql;
    if (!generatedSql) return { available: false, message: 'AI لم يُعِد استعلامًا' };

    const sql = generatedSql.trim();

    // 1. Length cap.
    if (sql.length > MAX_SQL_LEN) {
      throw new BadRequestException({ code: 'SQL_TOO_LONG', messageAr: 'الاستعلام المولّد طويل جداً' });
    }

    // 2. Single statement only — semicolon allowed only as trailing terminator.
    const noTrailing = sql.replace(/;\s*$/, '');
    if (noTrailing.includes(';')) {
      throw new BadRequestException({ code: 'MULTI_STATEMENT', messageAr: 'عبارة متعددة غير مسموحة' });
    }

    // 3. Must start with SELECT (or WITH for CTE) and contain no DDL/DML keywords.
    if (!/^\s*(SELECT|WITH)\b/i.test(sql) || FORBIDDEN_KEYWORDS.test(sql)) {
      throw new BadRequestException({ code: 'UNSAFE_SQL', messageAr: 'الاستعلام المولّد غير آمن' });
    }

    // 4. Every table referenced must be in the whitelist.
    const referenced = this.extractTables(sql);
    if (referenced.length === 0) {
      throw new BadRequestException({ code: 'NO_TABLE', messageAr: 'لا يمكن تحديد الجداول' });
    }
    const offending = referenced.filter((t) => !ALLOWED_TABLES.has(t));
    if (offending.length > 0) {
      throw new BadRequestException({
        code: 'TABLE_NOT_ALLOWED',
        messageAr: `جداول غير مسموحة: ${offending.join(', ')}`,
      });
    }

    let results: any[] = [];
    try {
      results = await this.runReadOnly(sql, companyId);
    } catch (e: any) {
      return { available: true, error: 'SQL execution failed', message: e?.message };
    }

    await this.saveQuery(companyId, nlQuery, sql, session);

    return {
      available: true,
      nlQuery,
      generatedSql: sql,
      rowCount: results.length,
      truncated: results.length === MAX_RESULT_ROWS,
      results,
      chartSuggestion: brainResp?.chartSuggestion ?? null,
    };
  }

  async saveQuery(companyId: string, nlQuery: string, generatedSql: string, session: UserSession) {
    await this.audit.log({
      companyId,
      userId: session.userId,
      action: 'AI_NL_QUERY',
      entityType: 'NLQuery',
      entityId: 'n/a',
      metadata: { nlQuery, generatedSql },
    });
  }
}
