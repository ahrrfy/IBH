import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { AuditService } from '../../engines/audit/audit.service';
import type { UserSession } from '@erp/shared-types';

const ALLOWED_TABLES = ['sales_invoices', 'customers', 'inventory_balances', 'journal_entry_lines'];
const FORBIDDEN_KEYWORDS = /\b(DROP|DELETE|UPDATE|ALTER|INSERT|TRUNCATE|CREATE|GRANT|REVOKE)\b/i;

@Injectable()
export class NlQueryService {
  constructor(private prisma: PrismaService, private config: ConfigService, private audit: AuditService) {}

  private get brainUrl(): string | undefined {
    return this.config.get<string>('AI_BRAIN_URL');
  }

  private get apiKey(): string | undefined {
    return this.config.get<string>('AI_BRAIN_API_KEY');
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
          allowedTables: ALLOWED_TABLES,
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

    if (FORBIDDEN_KEYWORDS.test(generatedSql) || !/^\s*SELECT\b/i.test(generatedSql.trim())) {
      throw new BadRequestException({ code: 'UNSAFE_SQL', messageAr: 'الاستعلام المولّد غير آمن' });
    }

    let results: any[] = [];
    try {
      results = (await this.prisma.$queryRawUnsafe(generatedSql)) as any[];
    } catch (e: any) {
      return { available: true, error: 'SQL execution failed', message: e?.message };
    }

    await this.saveQuery(companyId, nlQuery, generatedSql, session);

    return {
      available: true,
      nlQuery,
      generatedSql,
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
