import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });
  }

  async onModuleInit() {
    console.log(`[BOOT] ${new Date().toISOString()} PrismaService.onModuleInit -> $connect()`);
    await this.$connect();
    console.log(`[BOOT] ${new Date().toISOString()} PrismaService.onModuleInit -> $connect() resolved`);
    this.logger.log('✅ Database connected');

    // Log slow queries in development
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.$on as any)('query', (e: { query: string; duration: number }) => {
        if (e.duration > 500) {
          this.logger.warn(`Slow query (${e.duration}ms): ${e.query.substring(0, 100)}`);
        }
      });
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  /**
   * Set RLS context for the current request.
   * This MUST be called at the beginning of every request
   * to enforce PostgreSQL Row Level Security.
   */
  async setRlsContext(companyId: string, userId: string): Promise<void> {
    await this.$executeRaw`
      SELECT set_config('app.current_company', ${companyId}, true),
             set_config('app.current_user_id', ${userId}, true)
    `;
  }

  /**
   * Clear RLS context — call after request completes
   */
  async clearRlsContext(): Promise<void> {
    await this.$executeRaw`
      SELECT set_config('app.current_company', '', true),
             set_config('app.current_user_id', '', true)
    `;
  }
}
