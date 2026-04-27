import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bull';

// Engines (M01)
import { AuthModule }     from './engines/auth/auth.module';
import { AuditModule }    from './engines/audit/audit.module';
import { SequenceModule } from './engines/sequence/sequence.module';
import { PolicyModule }   from './engines/policy/policy.module';
import { PostingModule }  from './engines/posting/posting.module';
import { WorkflowModule } from './engines/workflow/workflow.module';

// Core Infrastructure
import { PrismaModule }   from './platform/prisma/prisma.module';
import { RedisModule }    from './platform/redis/redis.module';
import { HealthModule }   from './platform/health/health.module';
import { RealtimeModule } from './platform/realtime/realtime.module';

// Business Modules (Wave 1)
import { CoreModule }      from './modules/core/core.module';
import { ProductsModule }  from './modules/products/products.module';
import { InventoryModule } from './modules/inventory/inventory.module';

// Business Modules (Wave 2)
import { SalesModule }     from './modules/sales/sales.module';
import { POSModule }       from './modules/pos/pos.module';
import { DeliveryModule }  from './modules/delivery/delivery.module';

// Business Modules (Wave 3)
import { PurchasesModule } from './modules/purchases/purchases.module';

// Business Modules (Wave 4)
import { FinanceModule }   from './modules/finance/finance.module';
import { AssetsModule }    from './modules/assets/assets.module';

// Business Modules (Wave 5)
import { HrModule }        from './modules/hr/hr.module';
import { JobOrdersModule } from './modules/job-orders/job-orders.module';
import { MarketingModule } from './modules/marketing/marketing.module';

// Business Modules (Wave 6)
import { CrmModule }       from './modules/crm/crm.module';
import { LicensingModule } from './modules/licensing/licensing.module';
import { AiModule }        from './modules/ai/ai.module';
import { ReportingModule } from './modules/reporting/reporting.module';

@Module({
  imports: [
    // ── Config ────────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      cache: true,
    }),

    // ── Rate Limiting ──────────────────────────────────────────────────────
    ThrottlerModule.forRoot([
      { name: 'global', ttl: 60_000, limit: 100 },
      { name: 'auth',   ttl: 60_000, limit: 10 },
    ]),

    // ── Event Bus ──────────────────────────────────────────────────────────
    EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),

    // ── BullMQ / Redis ─────────────────────────────────────────────────────
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get('REDIS_PASSWORD'),
          db: 0,
        },
        prefix: 'erp:queue',
      }),
      inject: [ConfigService],
    }),

    // ── Infrastructure ─────────────────────────────────────────────────────
    PrismaModule,
    RedisModule,
    HealthModule,
    RealtimeModule,

    // ── Engines (M01) ──────────────────────────────────────────────────────
    AuthModule,
    AuditModule,
    SequenceModule,
    PolicyModule,
    PostingModule,
    WorkflowModule,

    // ── Business Modules — Wave 1 ───────────────────────────────────────────
    CoreModule,
    ProductsModule,
    InventoryModule,

    // ── Business Modules — Wave 2 ───────────────────────────────────────────
    SalesModule,
    POSModule,
    DeliveryModule,

    // ── Business Modules — Wave 3 ───────────────────────────────────────────
    PurchasesModule,

    // ── Business Modules — Wave 4 ───────────────────────────────────────────
    FinanceModule,
    AssetsModule,

    // ── Business Modules — Wave 5 ───────────────────────────────────────────
    HrModule,
    JobOrdersModule,
    MarketingModule,

    // ── Business Modules — Wave 6 ───────────────────────────────────────────
    CrmModule,
    LicensingModule,
    AiModule,
    ReportingModule,
  ],
})
export class AppModule {}
