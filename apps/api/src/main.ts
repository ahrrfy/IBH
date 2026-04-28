import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './platform/filters/http-exception.filter';
import { RlsInterceptor } from './platform/interceptors/rls.interceptor';
import { JwtAuthGuard } from './engines/auth/guards/jwt-auth.guard';
import { PrismaService } from './platform/prisma/prisma.service';

// I046 — bootstrap breadcrumbs. Production has been hanging silently between
// "Redis connected" and `app.listen()` with no Nest log indicating which
// onModuleInit/onApplicationBootstrap hook is the culprit. These plain
// console.log markers bypass Nest's Logger (which buffers / filters by level)
// so we always see how far we got. Remove once the hang is identified+fixed.
const trace = (m: string) => console.log(`[BOOT] ${new Date().toISOString()} ${m}`);

async function bootstrap() {
  trace('1. bootstrap() entered');
  const isProd = process.env.NODE_ENV === 'production';
  trace(`2. NODE_ENV=${process.env.NODE_ENV} PORT=${process.env.PORT}`);
  trace('3. about to call NestFactory.create(AppModule)');
  const app = await NestFactory.create(AppModule, {
    logger: isProd ? ['error', 'warn', 'log'] : ['error', 'warn', 'log', 'debug', 'verbose'],
  });
  trace('4. ✅ NestFactory.create() resolved — all onModuleInit hooks completed');

  // ─── Pre-flight security checks ──────────────────────────────────────────
  // Fail fast in production if critical secrets are missing or weak.
  if (isProd) {
    const jwt = process.env.JWT_SECRET;
    if (!jwt || jwt.length < 32) {
      console.error('❌ JWT_SECRET must be set and ≥ 32 characters in production');
      process.exit(1);
    }
    if (jwt.includes('CHANGE_ME') || jwt === 'devsecret') {
      console.error('❌ JWT_SECRET appears to be a default — rotate it before going live');
      process.exit(1);
    }
    if (!process.env.DATABASE_URL) {
      console.error('❌ DATABASE_URL not set');
      process.exit(1);
    }
  }

  // ─── Security headers (strict) ────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // 'self' covers our own API responses; nothing else by default
          scriptSrc:  ["'self'"],
          styleSrc:   ["'self'", "'unsafe-inline'"],  // tailwind injects inline styles
          imgSrc:     ["'self'", 'data:', 'blob:'],
          fontSrc:    ["'self'", 'data:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],                  // anti-clickjacking
          objectSrc:      ["'none'"],
          baseUri:        ["'self'"],
          formAction:     ["'self'"],
          upgradeInsecureRequests: [],
        },
      },
      hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-site' },
      noSniff: true,
      frameguard: { action: 'deny' },
      hidePoweredBy: true,
      permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    }),
  );

  // ─── Compression ──────────────────────────────────────────────────────────
  app.use(compression());

  // ─── CORS — strict whitelist (deny by default in prod) ─────────────────
  const corsRaw = process.env.CORS_ORIGINS ?? process.env.ALLOWED_ORIGINS ?? '';
  const allowedOrigins = corsRaw.split(',').map((s) => s.trim()).filter(Boolean);

  if (isProd && allowedOrigins.length === 0) {
    console.error('❌ CORS_ORIGINS must be set in production (comma-separated)');
    process.exit(1);
  }

  app.enableCors({
    origin: (origin, cb) => {
      // Allow same-origin / no-origin (curl, server-to-server)
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      if (!isProd && origin.startsWith('http://localhost:')) return cb(null, true);
      cb(new Error('CORS: origin not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 600,
  });

  // ─── Trust proxy (we sit behind nginx) — for correct req.ip ──────────────
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // ─── Global prefix & versioning ──────────────────────────────────────────
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // ─── Global exception filter ─────────────────────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());

  // ─── Global JWT guard ────────────────────────────────────────────────────
  const reflector = app.get(Reflector);
  app.useGlobalGuards(new JwtAuthGuard(reflector));

  // ─── RLS interceptor ─────────────────────────────────────────────────────
  const prisma = app.get(PrismaService);
  app.useGlobalInterceptors(new RlsInterceptor(prisma));

  // ─── Global validation pipe ──────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // Reject requests with extra fields rather than silently strip them.
      // Prevents prototype-pollution / hidden-payload attacks; forces clients
      // to send only documented fields.
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ─── Swagger (dev only — never in production) ───────────────────────────
  if (!isProd) {
    const config = new DocumentBuilder()
      .setTitle('الرؤية العربية ERP API')
      .setDescription('ERP API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  // ─── Graceful shutdown ───────────────────────────────────────────────────
  trace('5. enableShutdownHooks');
  app.enableShutdownHooks();

  const port = parseInt(process.env.PORT ?? '3001', 10);
  trace(`6. about to call app.listen(${port}) on 0.0.0.0`);
  await app.listen(port, '0.0.0.0');
  trace(`7. ✅ app.listen() resolved — listening on 0.0.0.0:${port}`);
  console.log(`🚀 ERP API running on port ${port}`);
  if (!isProd) console.log(`📚 Swagger: http://localhost:${port}/docs`);
}

bootstrap().catch((err) => {
  console.error('[BOOT] ❌ FATAL — bootstrap rejected:', err);
  process.exit(1);
});
