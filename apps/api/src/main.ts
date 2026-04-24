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

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // ─── Security headers ─────────────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    }),
  );

  // ─── Compression ──────────────────────────────────────────────────────────
  app.use(compression());

  // ─── CORS — whitelist only ────────────────────────────────────────────────
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000').split(',');
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // ─── Global prefix & versioning ──────────────────────────────────────────
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // ─── Global exception filter ─────────────────────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());

  // ─── Global JWT guard (all routes protected by default) ─────────────────
  const reflector = app.get(Reflector);
  app.useGlobalGuards(new JwtAuthGuard(reflector));

  // ─── RLS interceptor (sets PostgreSQL session vars per request) ──────────
  const prisma = app.get(PrismaService);
  app.useGlobalInterceptors(new RlsInterceptor(prisma));

  // ─── Global validation pipe ───────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,             // strip unknown fields
      forbidNonWhitelisted: false, // our Zod pipes handle this per-route
      transform: true,             // auto-transform types
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ─── Swagger (dev only) ───────────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('الرؤية العربية ERP API')
      .setDescription('ERP API — الرؤية العربية للتجارة')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  // ─── Graceful shutdown ────────────────────────────────────────────────────
  app.enableShutdownHooks();

  const port = parseInt(process.env.PORT ?? '3001', 10);
  await app.listen(port);
  console.log(`🚀 ERP API running on port ${port}`);
  console.log(`📚 Swagger: http://localhost:${port}/docs`);
}

bootstrap();
