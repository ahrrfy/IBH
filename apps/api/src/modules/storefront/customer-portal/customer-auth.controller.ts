import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../engines/auth/decorators/public.decorator';
import { CustomerAuthService } from './customer-auth.service';

interface RequestOtpDto {
  phone: string;
}
interface VerifyOtpDto {
  phone: string;
  code: string;
}

/**
 * Customer-portal authentication (T56). Public OTP-based login, separate from
 * the staff JWT system. All routes mount under /public/auth/* so the public
 * surface stays discoverable in code review and Nginx rules.
 */
@Controller('public/auth')
export class CustomerAuthController {
  constructor(private readonly auth: CustomerAuthService) {}

  @Public()
  @Post('request-otp')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async requestOtp(@Body() body: RequestOtpDto) {
    return this.auth.requestOtp(body?.phone ?? '');
  }

  @Public()
  @Post('verify-otp')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async verifyOtp(@Body() body: VerifyOtpDto) {
    return this.auth.verifyOtp(body?.phone ?? '', body?.code ?? '');
  }
}
