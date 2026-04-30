import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';

@Injectable()
export class CurrencyTransformer {
  constructor(private readonly prisma: PrismaService) {}

  async convertToIqd(
    amount: number,
    fromCurrency: string,
    companyId: string,
    date?: Date,
  ): Promise<number> {
    if (!amount || fromCurrency === 'IQD') return amount;

    const rate = await this.prisma.exchangeRate.findFirst({
      where: {
        companyId,
        fromCurrency,
        toCurrency: 'IQD',
        effectiveDate: { lte: date ?? new Date() },
      },
      orderBy: { effectiveDate: 'desc' },
    });

    if (!rate) {
      throw new Error(`سعر صرف ${fromCurrency} → IQD غير موجود`);
    }

    return amount * Number(rate.rate);
  }
}
