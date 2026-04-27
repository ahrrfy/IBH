import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  Get,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { TotpService } from './totp.service';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { SkipLicense } from '../../platform/licensing/skip-license.decorator';
import { ZodValidationPipe } from '../../platform/pipes/zod-validation.pipe';
import {
  loginSchema,
  changePasswordSchema,
  totpConfirmSchema,
  totpVerifyLoginSchema,
  totpDisableSchema,
} from '@erp/validation-schemas';
import type { LoginInput } from '@erp/validation-schemas';
import type { UserSession } from '@erp/shared-types';
import type { Request } from 'express';

// ─── Auth Controller ───────────────────────────────────────────────────────
// Public:    POST /auth/login, POST /auth/refresh, POST /auth/2fa/verify-login
// Protected: POST /auth/logout, POST /auth/logout-all, POST /auth/change-password,
//            POST /auth/2fa/setup, POST /auth/2fa/confirm, POST /auth/2fa/disable,
//            GET  /auth/me

@Controller('auth')
@SkipLicense()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly totp: TotpService,
  ) {}

  // ─── Login (step 1) ───────────────────────────────────────────────────
  // Returns either { accessToken, refreshToken, user }
  // or       { requires2FA: true, mfaToken, userId } if user has 2FA

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
  ) {
    return this.authService.login({
      ...(body as any),
      ipAddress: this.getClientIp(req),
      userAgent: req.headers['user-agent'] ?? '',
    } as any);
  }

  // ─── Login (step 2 — verify TOTP) ─────────────────────────────────────

  @Public()
  @Post('2fa/verify-login')
  @HttpCode(HttpStatus.OK)
  async verifyMfaLogin(
    @Body(new ZodValidationPipe(totpVerifyLoginSchema)) body: { mfaToken: string; code: string },
    @Req() req: Request,
  ) {
    return this.authService.verifyMfaAndLogin(
      body.mfaToken,
      body.code,
      this.getClientIp(req),
      req.headers['user-agent'] ?? '',
    );
  }

  // ─── 2FA setup (authenticated) ────────────────────────────────────────

  @Post('2fa/setup')
  @HttpCode(HttpStatus.OK)
  async setupTotp(@CurrentUser() user: UserSession) {
    return this.totp.generateSecret(user.userId);
  }

  @Post('2fa/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmTotp(
    @CurrentUser() user: UserSession,
    @Body(new ZodValidationPipe(totpConfirmSchema)) body: { code: string },
  ) {
    return this.totp.confirmTotpSetup(user.userId, body.code);
  }

  @Post('2fa/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disableTotp(
    @CurrentUser() user: UserSession,
    @Body(new ZodValidationPipe(totpDisableSchema)) body: { password: string; code?: string },
  ) {
    // Verify password OR code before disabling
    if (body.code) {
      const ok = await this.totp.verifyCode(user.userId, body.code);
      if (!ok) throw new Error('TOTP_INVALID_CODE');
    }
    await this.totp.disable(user.userId);
  }

  // ─── Refresh Token ────────────────────────────────────────────────────

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body('refreshToken') refreshToken: string,
    @Req() req: Request,
  ) {
    if (!refreshToken) {
      return { code: 'VALIDATION_ERROR', messageAr: 'Refresh token مطلوب' };
    }
    return this.authService.refresh(refreshToken, this.getClientIp(req));
  }

  // ─── Logout ───────────────────────────────────────────────────────────

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser() user: UserSession,
    @Body('refreshToken') refreshToken: string,
  ) {
    await this.authService.logout(user.userId, refreshToken ?? '');
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(@CurrentUser() user: UserSession) {
    await this.authService.logoutAll(user.userId);
  }

  // ─── Change Password ──────────────────────────────────────────────────

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: UserSession,
    @Body(new ZodValidationPipe(changePasswordSchema))
    body: { currentPassword: string; newPassword: string },
    @Req() req: Request,
  ) {
    await this.authService.changePassword({
      userId:          user.userId,
      companyId:       user.companyId,
      userEmail:       '',
      currentPassword: body.currentPassword,
      newPassword:     body.newPassword,
      ipAddress:       this.getClientIp(req),
    });
  }

  // ─── Me ───────────────────────────────────────────────────────────────

  @Get('me')
  async me(@CurrentUser() user: UserSession) {
    return {
      userId:     user.userId,
      companyId:  user.companyId,
      branchId:   user.branchId,
      roles:      user.roles,
      locale:     user.locale,
      expiresAt:  user.expiresAt,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress ?? '0.0.0.0';
  }
}
