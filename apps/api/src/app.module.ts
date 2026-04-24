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

// Business Modules (Wave 1)
import { CoreModule }      from './modules/core/core.module';
import { ProductsModule }  from './modules/products/products.module';
import { InventoryModule } from './modules/inventory/inventory.module';

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

    // ── Engines (M01) ──────────────────────────────────────────────────────
    AuthModule,
    AuditModule,
    SequenceModule,
    PolicyModule,
    PostingModule,
    WorkflowModule,

    // ── Business Modules ───────────────────────────────────────────────────
    CoreModule,
    ProductsModule,
    InventoryModule,
  ],
})
export class AppModule {}
