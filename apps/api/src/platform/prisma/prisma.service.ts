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
             set_config('app.current_user_id', '', true)
    `;
  }
}
