import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

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
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const protectedEndpoints = [
    '/sales/invoices',
    '/sales/customers',
    '/purchases/orders',
    '/finance/gl/trial-balance',
    '/hr/employees',
    '/inventory/warehouses',
  ];

  for (const path of protectedEndpoints) {
    it(`GET ${path} → 401 without token`, async () => {
      const res = await request(app.getHttpServer()).get(path);
      expect([401, 403]).toContain(res.status);
    });
  }
});
