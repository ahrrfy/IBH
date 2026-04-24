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
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { ZodValidationPipe } from '../../platform/pipes/zod-validation.pipe';
import {
  loginSchema,
  changePasswordSchema,
} from '@erp/validation-schemas';
import type { LoginInput } from '@erp/validation-schemas';
import type { UserSession } from '@erp/shared-types';
import type { Request } from 'express';

// ─── Auth Controller ───────────────────────────────────────────────────────────
// Public routes: POST /auth/login, POST /auth/refresh
// Protected routes: POST /auth/logout, POST /auth/logout-all,
//                   POST /auth/change-password, GET /auth/me

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── Login ────────────────────────────────────────────────────────────────

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
  ) {
    return this.authService.login({
      ...body,
      ipAddress: this.getClientIp(req),
      userAgent: req.headers['user-agent'] ?? '',
    });
  }

  // ─── Refresh Token ────────────────────────────────────────────────────────

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

  // ─── Logout ───────────────────────────────────────────────────────────────

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

  // ─── Change Password ──────────────────────────────────────────────────────

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
      userEmail:       '', // populated by session if needed
      currentPassword: body.currentPassword,
      newPassword:     body.newPassword,
      ipAddress:       this.getClientIp(req),
    });
  }

  // ─── Me ───────────────────────────────────────────────────────────────────

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

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress ?? '0.0.0.0';
  }
}
