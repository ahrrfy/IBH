import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;

  constructor() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    super({ adapter });
    this.pool = pool;
  }

  async onModuleInit() {
    console.log(`[BOOT] ${new Date().toISOString()} PrismaService.onModuleInit -> $connect()`);
    await this.$connect();
    console.log(`[BOOT] ${new Date().toISOString()} PrismaService.onModuleInit -> $connect() resolved`);
    this.logger.log('Database connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
    this.logger.log('Database disconnected');
  }

  async setRlsContext(companyId: string, userId: string): Promise<void> {
    await this.$executeRaw`
      SELECT set_config('app.current_company', ${companyId}, true),
             set_config('app.current_user_id', ${userId}, true)
    `;
  }

  async clearRlsContext(): Promise<void> {
    await this.$executeRaw`
      SELECT set_config('app.current_company', '', true),
             set_config('app.current_user_id', '', true),
             set_config('app.bypass_rls', '0', true)
    `;
  }

  /**
   * I062 — RLS bypass.
   *
   * Enables `rls_bypass_active()` (set by migration 20260430000000) for
   * legitimate cross-tenant operations: super-admin license dashboards,
   * billing sweeps, recruitment public endpoints, system-internal cron
   * jobs that need to scan every tenant.
   *
   * Use the `withBypassedRls(fn)` helper rather than calling this
   * directly so the bypass is always cleared on completion (success or
   * failure). Direct callers MUST clear it themselves.
   *
   * Caller responsibility: this is application-layer trust — never call
   * with a value derived from request input.
   */
  async setRlsBypass(enabled: boolean): Promise<void> {
    const value = enabled ? '1' : '0';
    await this.$executeRaw`SELECT set_config('app.bypass_rls', ${value}, true)`;
  }

  /**
   * Run `fn` with RLS bypass enabled. Bypass is cleared in `finally`,
   * even on exceptions, so partial failures cannot leak elevated scope
   * to subsequent queries on the same connection.
   */
  async withBypassedRls<T>(fn: () => Promise<T>): Promise<T> {
    await this.setRlsBypass(true);
    try {
      return await fn();
    } finally {
      await this.setRlsBypass(false);
    }
  }
}
