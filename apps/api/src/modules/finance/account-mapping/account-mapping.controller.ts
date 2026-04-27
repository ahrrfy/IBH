import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { AccountMappingService } from './account-mapping.service';
import { CurrentUser } from '../../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

interface UpsertMappingDto {
  accountCode: string;
  description?: string;
}

@Controller('finance/account-mappings')
export class AccountMappingController {
  constructor(private readonly service: AccountMappingService) {}

  /** List all account mappings configured for the current company. */
  @Get()
  @RequirePermission('GL', 'read')
  list(@CurrentUser() session: UserSession) {
    return this.service.list(session.companyId);
  }

  /** Get the mapping for a single event type. */
  @Get(':eventType')
  @RequirePermission('GL', 'read')
  get(
    @Param('eventType') eventType: string,
    @CurrentUser() session: UserSession,
  ) {
    return this.service.get(session.companyId, eventType);
  }

  /**
   * Create or update the mapping for a single event type.
   * Validates that accountCode exists & is postable in the company's CoA.
   */
  @Put(':eventType')
  @RequirePermission('GL', 'update')
  upsert(
    @Param('eventType') eventType: string,
    @Body() dto: UpsertMappingDto,
    @CurrentUser() session: UserSession,
  ) {
    return this.service.upsert(
      session.companyId,
      eventType,
      dto.accountCode,
      dto.description,
    );
  }
}
