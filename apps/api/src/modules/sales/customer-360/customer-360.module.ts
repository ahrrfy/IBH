import { Module } from '@nestjs/common';
import { Customer360Service } from './customer-360.service';
import { Customer360Controller } from './customer-360.controller';

/**
 * T44 — Customer 360 read-model module.
 */
@Module({
  controllers: [Customer360Controller],
  providers: [Customer360Service],
  exports: [Customer360Service],
})
export class Customer360Module {}
