import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { PriceListsService } from './price-lists/price-lists.service';
import { AuditModule } from '../../engines/audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [ProductsController],
  providers: [ProductsService, PriceListsService],
  exports: [ProductsService, PriceListsService],
})
export class ProductsModule {}
