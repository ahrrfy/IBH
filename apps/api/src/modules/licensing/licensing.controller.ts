import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { LicensingService } from './licensing.service';
import { CurrentUser } from '../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../engines/auth/decorators/require-permission.decorator';
import { Public } from '../../engines/auth/decorators/public.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('licensing')
export class LicensingController {
  constructor(private readonly licensing: LicensingService) {}

  @Post('issue')
  @RequirePermission('License', 'admin')
  issue(@Body() dto: any, @CurrentUser() session: UserSession) {
    return this.licensing.issueLicense(dto, session);
  }

  @Post('activate')
  @Public()
  activate(@Body() dto: { licenseKey: string; hardwareFingerprint: string }) {
    return this.licensing.activateLicense(dto.licenseKey, dto.hardwareFingerprint);
  }

  @Post('heartbeat')
  @Public()
  heartbeat(@Body() dto: { licenseKey: string; hardwareFingerprint: string }) {
    return this.licensing.heartbeat(dto.licenseKey, dto.hardwareFingerprint);
  }

  @Post('revoke/:id')
  @RequirePermission('License', 'admin')
  revoke(@Param('id') id: string, @Body('reason') reason: string, @CurrentUser() session: UserSession) {
    return this.licensing.revoke(id, reason, session);
  }

  @Get('list')
  @RequirePermission('License', 'admin')
  list(@Query() q: any) {
    return this.licensing.listLicenses({
      active: q.active === 'true' ? true : q.active === 'false' ? false : undefined,
      plan: q.plan,
    });
  }

  @Get('expiring')
  @RequirePermission('License', 'admin')
  expiring(@Query('days') days?: string) {
    return this.licensing.licensesExpiringSoon(days ? Number(days) : 30);
  }

  @Post('verify')
  @Public()
  verify(@Body() dto: { licenseKey: string; signature: string }) {
    return this.licensing.verifySignature(dto.licenseKey, dto.signature);
  }
}
