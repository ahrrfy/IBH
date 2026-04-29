import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { TotpService } from './totp.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RbacGuard } from './guards/rbac.guard';
import { DataScopeGuard } from './guards/data-scope.guard';
import { RbacService } from './rbac.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get('JWT_ACCESS_EXPIRES', '15m'),
          issuer:    'erp.ruya.iq',
          audience:  'erp-api',
        },
      }),
      inject: [ConfigService],
    }),
    AuditModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TotpService,
    JwtStrategy,
    JwtAuthGuard,
    RbacGuard,
    DataScopeGuard,
    RbacService,
    // I059 — register JwtAuthGuard as APP_GUARD here so it shares the same
    // execution phase as LicenseGuard (which is also APP_GUARD in
    // PlatformLicensingModule). With both in APP_GUARD the order is
    // deterministic by module-load order, and since AuthModule is imported
    // BEFORE PlatformLicensingModule in app.module.ts, JwtAuthGuard runs
    // first and populates req.user before LicenseGuard reads it.
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
  ],
  exports: [
    AuthService,
    TotpService,
    JwtAuthGuard,
    RbacGuard,
    DataScopeGuard,
    RbacService,
    JwtModule,
  ],
})
export class AuthModule {}
