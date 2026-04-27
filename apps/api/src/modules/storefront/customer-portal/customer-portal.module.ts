import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { CustomerAuthController } from './customer-auth.controller';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerAuthGuard } from './customer-auth.guard';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';

/**
 * Customer-portal module (T56). Exposes:
 *   - /public/auth/request-otp, /public/auth/verify-otp  (OTP login)
 *   - /public/portal/me, /portal/orders, /portal/loyalty (auth required)
 *
 * Uses an isolated `JwtModule` so customer tokens have a different secret +
 * audience than staff tokens — they cannot be substituted for each other.
 */
@Module({
  imports: [
    ConfigModule,
    // No global secret/sign options here — every call to jwt.signAsync /
    // verifyAsync passes its own secret + audience explicitly. This keeps the
    // staff JwtModule (registered in AuthModule) entirely untouched.
    JwtModule.register({}),
  ],
  controllers: [CustomerAuthController, PortalController],
  providers: [CustomerAuthService, CustomerAuthGuard, PortalService],
})
export class CustomerPortalModule {}
