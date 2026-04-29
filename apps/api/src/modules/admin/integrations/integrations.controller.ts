import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../engines/auth/guards/jwt-auth.guard';
import { IntegrationsService } from './integrations.service';
import { SetWhatsAppConfigDto, SetWhatsAppConfigSchema } from './dto/whatsapp-config.dto';

/**
 * Per-company integration management.
 *
 * All endpoints require auth + the company is read from `req.user.companyId`,
 * so a user can ONLY ever read or modify their own tenant's config — there is
 * no cross-tenant path here, and RLS provides defense-in-depth.
 */
@ApiTags('admin.integrations')
@Controller('admin/integrations')
@UseGuards(JwtAuthGuard)
export class IntegrationsController {
  constructor(private readonly service: IntegrationsService) {}

  // ─── WhatsApp ───────────────────────────────────────────────────────────

  @Get('whatsapp')
  @ApiOperation({
    summary: 'Get current company\'s WhatsApp config (token masked)',
  })
  async getWhatsApp(@Req() req: any) {
    return this.service.getWhatsAppConfig(req.user.companyId);
  }

  @Put('whatsapp')
  @ApiOperation({ summary: 'Save WhatsApp config (encrypted at rest)' })
  async setWhatsApp(@Req() req: any, @Body() body: unknown) {
    const parsed = SetWhatsAppConfigSchema.parse(body) as SetWhatsAppConfigDto;
    return this.service.setWhatsAppConfig(req.user.companyId, req.user.userId, parsed);
  }

  @Post('whatsapp/test')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Test the saved WhatsApp config by hitting Meta\'s phone-info endpoint',
  })
  async testWhatsApp(@Req() req: any) {
    return this.service.testWhatsAppConnection(req.user.companyId);
  }
}
