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
import { AutopilotModule } from './engines/autopilot/autopilot.module';

// Core Infrastructure
import { PrismaModule }   from './platform/prisma/prisma.module';
import { RedisModule }    from './platform/redis/redis.module';
import { HealthModule }   from './platform/health/health.module';
import { RealtimeModule } from './platform/realtime/realtime.module';
import { NotificationsModule } from './platform/notifications/notifications.module';
import { EncryptionModule } from './platform/encryption/encryption.module';
import { PlatformLicensingModule } from './platform/licensing/licensing.module';
import { LicensingMirrorModule } from './platform/licensing/licensing-mirror.module';
import { ExpiryWatcherModule } from './platform/licensing/expiry-watcher.module';
import { IntegrationsModule } from './modules/admin/integrations/integrations.module';

// Business Modules (Wave 1)
import { CoreModule }      from './modules/core/core.module';
import { ProductsModule }  from './modules/products/products.module';
import { InventoryModule } from './modules/inventory/inventory.module';

// Business Modules (Wave 2)
import { SalesModule }     from './modules/sales/sales.module';
import { POSModule }       from './modules/pos/pos.module';
// I050 — DeliveryCompaniesModule must be imported BEFORE DeliveryModule so its
// static `/delivery/companies` route registers before DeliveryController's
// wildcard `/delivery/:id`. NestJS uses Map insertion order when resolving
// routes, and modules imported deeper in the tree (DeliveryModule imports
// DeliveryCompaniesModule) get inserted AFTER their parent, which is the
// opposite of what we want here.
import { DeliveryCompaniesModule } from './modules/delivery/delivery-companies/delivery-companies.module';
import { DeliveryModule }  from './modules/delivery/delivery.module';

// Business Modules (Wave 3)
import { PurchasesModule } from './modules/purchases/purchases.module';

// Smart Inventory Engine (T42 — Wave 5 expansion)
import { InventoryIntelligenceModule } from './modules/inventory/intelligence/intelligence.module';
import { ProcurementAutoReorderModule } from './modules/procurement/auto-reorder/auto-reorder.module';

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
import { AdminLicensingModule } from './modules/admin/licensing/admin-licensing.module';
import { AiModule }        from './modules/ai/ai.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { StorefrontModule } from './modules/storefront/storefront.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { OnlineOrdersModule } from './modules/sales/online-orders/online-orders.module';

const isTest = process.env.NODE_ENV === 'test';

// 5.D — Split kill-switch into two independent flags so we can re-enable
// the billing cron + autopilot jobs (the actually-needed background work)
// without re-enabling the global LicenseGuard (which 403s every endpoint
// on greenfield installs that haven't seeded a Subscription yet).
//
// LICENSE_GUARD_DISABLED=1 (default 1)  → skip PlatformLicensingModule
//   Guard is OFF by default until a Subscription row exists. The read-only
//   /licensing/me/features endpoint is provided by LicensingMirrorModule
//   in coreImports regardless, so the web shell still boots.
//
// BACKGROUND_JOBS_DISABLED=1 (default 0) → skip AdminLicensing + Autopilot +
//   ExpiryWatcher. These are the BullMQ-heavy modules. Default OFF (i.e.
//   jobs RUN) now that I047's Optional()-injection fix in BillingSweepProcessor
//   has stabilised dev/prod against ECONNREFUSED on Redis.
const skipBackgroundJobs = isTest || process.env.BACKGROUND_JOBS_DISABLED === '1';
const skipLicenseGuard   = isTest || process.env.LICENSE_GUARD_DISABLED   !== '0';

const coreImports = [
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
  NotificationsModule,
  EncryptionModule,
  // PlatformLicensingModule moved to backgroundJobImports — its global
  // LicenseGuard blocks every endpoint until a subscription is seeded.
  // I052 — but the read-only mirror (/licensing/me/features) must always
  // be reachable so the web shell can boot. Always-on, no global guard.
  LicensingMirrorModule,

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
  // I050 — register DeliveryCompaniesModule before DeliveryModule so the
  // static /delivery/companies (and /delivery/zones, /delivery/rates) routes
  // win over the wildcard /delivery/:id handler. See the import comment.
  DeliveryCompaniesModule,
  DeliveryModule,

  // ── Business Modules — Wave 3 ───────────────────────────────────────────
  PurchasesModule,

  // ── T42 Smart Inventory + Auto-Reorder ─────────────────────────────────
  InventoryIntelligenceModule,
  ProcurementAutoReorderModule,

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

  // ── Public Storefront (T54) ─────────────────────────────────────────────
  StorefrontModule,

  // ── E-commerce ↔ ERP integration (T55) ─────────────────────────────────
  PaymentsModule,
  OnlineOrdersModule,

  // ── Admin: per-tenant integrations (WhatsApp, SMTP, SMS, ...) ──────────
  IntegrationsModule,
];

// Background-job modules with heavy BullMQ queue connections.
// Skipped in test to keep AppModule bootstrap under 30s on CI.
// Also skipped in production via BACKGROUND_JOBS_DISABLED=1 because:
//   - PlatformLicensingModule registers a global LicenseGuard that 403s
//     every authed request when there's no active subscription (greenfield
//     installs). Until subscriptions are seeded, this blocks the entire app.
//     Gated separately by LICENSE_GUARD_DISABLED (default ON until seeded).
//   - AdminLicensing/ExpiryWatcher/Autopilot inflate boot time with
//     50+ BullMQ-bound providers — gated by BACKGROUND_JOBS_DISABLED.
const licenseGuardImports = [PlatformLicensingModule];
const backgroundJobImports = [
  AdminLicensingModule,
  ExpiryWatcherModule,
  AutopilotModule,
];

@Module({
  imports: [
    ...coreImports,
    ...(skipLicenseGuard ? [] : licenseGuardImports),
    ...(skipBackgroundJobs ? [] : backgroundJobImports),
  ],
})
export class AppModule {}
