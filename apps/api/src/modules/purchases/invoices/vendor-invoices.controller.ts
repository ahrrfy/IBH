import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  VendorInvoicesService,
  CreateVendorInvoiceDto,
  FindVendorInvoicesQuery,
  RecordPaymentDto,
} from './vendor-invoices.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('purchases/invoices')
export class VendorInvoicesController {
  constructor(private readonly svc: VendorInvoicesService) {}

  @Get()
  @RequirePermission('VendorInvoice', 'read')
  findAll(
    @CurrentUser() user: UserSession,
    @Query() query: FindVendorInvoicesQuery,
  ) {
    return this.svc.findAll(user.companyId, query);
  }

  @Post('ocr-suggest')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('VendorInvoice', 'create')
  ocrSuggest(@Body() body: { attachmentUrl: string }) {
    return this.svc.getOcrSuggestion(body.attachmentUrl);
  }

  @Get(':id')
  @RequirePermission('VendorInvoice', 'read')
  findOne(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.findOne(id, user.companyId);
  }

  @Post()
  @RequirePermission('VendorInvoice', 'create')
  create(
    @CurrentUser() user: UserSession,
    @Body() dto: CreateVendorInvoiceDto,
  ) {
    return this.svc.create(user.companyId, dto, user);
  }

  @Post(':id/three-way-match')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('VendorInvoice', 'update')
  threeWayMatch(@Param('id') id: string, @CurrentUser() user: UserSession) {
    return this.svc.threeWayMatch(id, user.companyId, user);
  }

  @Post(':id/post')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('VendorInvoice', 'approve')
  post(
    @Param('id') id: string,
    @CurrentUser() user: UserSession,
    @Body() body: { override?: boolean } = {},
  ) {
    return this.svc.post(id, user.companyId, user, { override: body.override });
  }

  @Post(':id/payment')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('VendorInvoice', 'approve')
  payment(
    @Param('id') id: string,
    @CurrentUser() user: UserSession,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.svc.recordPayment(id, user.companyId, dto, user);
  }

  @Post(':id/reverse')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('VendorInvoice', 'delete')
  reverse(
    @Param('id') id: string,
    @CurrentUser() user: UserSession,
    @Body() body: { reason: string },
  ) {
    return this.svc.reverse(id, user.companyId, body.reason, user);
  }
}
