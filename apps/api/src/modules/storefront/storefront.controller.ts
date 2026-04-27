import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../engines/auth/decorators/public.decorator';
import { StorefrontService } from './storefront.service';

/**
 * Public storefront API — no auth, scoped to a single configured tenant
 * (see STOREFRONT_COMPANY_ID env). Mounted at /public/* to make public surface
 * obvious in code review and Nginx rules.
 */
@Controller('public')
export class StorefrontController {
  constructor(private readonly storefront: StorefrontService) {}

  @Public()
  @Get('products')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async listProducts(
    @Query('page')       page?: string,
    @Query('pageSize')   pageSize?: string,
    @Query('categoryId') categoryId?: string,
    @Query('search')     search?: string,
    @Query('minPrice')   minPrice?: string,
    @Query('maxPrice')   maxPrice?: string,
  ) {
    return this.storefront.listProducts({
      page:       page ? Number(page) : undefined,
      pageSize:   pageSize ? Number(pageSize) : undefined,
      categoryId,
      search,
      minPrice:   minPrice != null ? Number(minPrice) : undefined,
      maxPrice:   maxPrice != null ? Number(maxPrice) : undefined,
    });
  }

  @Public()
  @Get('products/:slug')
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  async getProduct(@Param('slug') slug: string) {
    return this.storefront.getProduct(slug);
  }

  @Public()
  @Get('categories/tree')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async getCategoryTree() {
    return this.storefront.getCategoryTree();
  }

  @Public()
  @Post('cart/calculate')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async calculateCart(@Body() body: { lines: Array<{ variantId: string; qty: number }> }) {
    return this.storefront.calculateCart(body?.lines ?? []);
  }

  @Public()
  @Post('orders')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async createOrder(@Body() body: {
    customerName:    string;
    customerPhone:   string;
    whatsapp?:       string;
    city:            string;
    deliveryAddress: string;
    notes?:          string;
    paymentMethod:   string;
    lines:           Array<{ variantId: string; qty: number }>;
  }) {
    return this.storefront.createOrder(body);
  }
}
