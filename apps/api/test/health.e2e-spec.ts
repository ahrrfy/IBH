import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Smoke test — the app boots, DB connects, /health returns 200.
 * Requires a running PostgreSQL with migrations applied:
 *   docker compose -f infra/docker-compose.dev.yml up -d
 *   pnpm --filter api exec prisma migrate deploy
 */
describe('Health (e2e)', () => {
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

  it('GET /health → 200 with status ok', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({
      status: expect.any(String),
      checks: { database: expect.any(String) },
    });
  });
});
