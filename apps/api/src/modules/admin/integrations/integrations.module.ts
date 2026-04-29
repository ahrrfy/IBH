import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../platform/prisma/prisma.module';
import { AuditModule } from '../../../engines/audit/audit.module';
import { EncryptionModule } from '../../../platform/encryption/encryption.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({
  imports: [PrismaModule, AuditModule, EncryptionModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
