import { Body, Controller, Get, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../engines/auth/decorators/public.decorator';
import { CustomerAuthGuard } from './customer-auth.guard';
import { PortalService } from './portal.service';

interface UpdateProfileDto {
  nameAr?: string;
  email?: string;
  address?: string;
  city?: string;
}

interface CustomerRequest extends Request {
  customerId?: string;
  customerPhone?: string;
}

/**
 * Customer-portal endpoints (T56). All routes require a customer JWT verified
 * by `CustomerAuthGuard`. Marked `@Public()` only to bypass the global staff
 * JwtAuthGuard — the portal guard then enforces customer authentication.
 */
@Controller('public/portal')
@Public()
@UseGuards(CustomerAuthGuard)
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get('me')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async getMe(@Req() req: CustomerRequest) {
    return this.portal.getMe(req.customerId!);
  }

  @Put('me')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async updateMe(@Req() req: CustomerRequest, @Body() body: UpdateProfileDto) {
    return this.portal.updateMe(req.customerId!, body ?? {});
  }

  @Get('orders')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async listOrders(
    @Req() req: CustomerRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.portal.listOrders(
      req.customerId!,
      page ? Number(page) : undefined,
      pageSize ? Number(pageSize) : undefined,
    );
  }

  @Get('orders/:id')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async getOrder(@Req() req: CustomerRequest, @Param('id') id: string) {
    return this.portal.getOrder(req.customerId!, id);
  }

  @Get('loyalty')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async getLoyalty(@Req() req: CustomerRequest) {
    return this.portal.getLoyalty(req.customerId!);
  }
}
