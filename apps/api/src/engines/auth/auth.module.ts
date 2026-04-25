import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { TotpService } from './totp.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RbacGuard } from './guards/rbac.guard';
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
  providers: [AuthService, TotpService, JwtStrategy, JwtAuthGuard, RbacGuard],
  exports: [AuthService, TotpService, JwtAuthGuard, RbacGuard, JwtModule],
})
export class AuthModule {}
