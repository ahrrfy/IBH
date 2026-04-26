import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/engines/auth/guards/jwt-auth.guard';
import { PrismaService } from '../src/platform/prisma/prisma.service';
import { RlsInterceptor } from '../src/platform/interceptors/rls.interceptor';

/**
 * RBAC denial path: protected endpoints must reject requests that
 * carry no JWT — the auth guard returns 401, never silently allows.
 */
describe('Auth — RBAC unauthenticated denial (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    // Match main.ts global setup — without these the JwtAuthGuard never
    // runs and protected routes 500 instead of 401.
    const reflector = app.get(Reflector);
    const prisma = app.get(PrismaService);
    app.useGlobalGuards(new JwtAuthGuard(reflector));
    app.useGlobalInterceptors(new RlsInterceptor(prisma));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  // Paths must match @Controller() decorators exactly — no global prefix or
  // versioning is applied in the test NestJS app (setGlobalPrefix / enableVersioning
  // are main.ts bootstrap calls, not module-level).
  const protectedEndpoints = [
    '/sales-invoices',           // SalesInvoicesController @Controller('sales-invoices')
    '/customers',                // CustomersController     @Controller('customers')
    '/purchases/orders',         // PurchaseOrdersController @Controller('purchases/orders')
    '/finance/gl/trial-balance', // GlController @Controller('finance/gl')
    '/hr/employees',             // EmployeesController @Controller('hr/employees')
    '/inventory/warehouses',     // InventoryController @Controller('inventory')
  ];

  for (const path of protectedEndpoints) {
    it(`GET ${path} → 401 without token`, async () => {
      const res = await request(app.getHttpServer()).get(path);
      expect([401, 403]).toContain(res.status);
    });
  }
});
