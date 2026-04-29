import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';

/**
 * Global encryption service — exported once, available everywhere.
 * Avoids importing/registering it inside every module that needs to
 * encrypt sensitive data at rest.
 */
@Global()
@Module({
  providers: [EncryptionService],
  exports: [EncryptionService],
})
export class EncryptionModule {}
