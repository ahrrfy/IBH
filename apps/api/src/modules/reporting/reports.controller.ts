import { BadRequestException, Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { CurrentUser } from '../../engines/auth/decorators/current-user.decorator';
import { RequirePermission } from '../../engines/auth/decorators/require-permission.decorator';
import type { UserSession } from '@erp/shared-types';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  private parseRange(q: any) {
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = q.to ? new Date(q.to) : new Date();
    return { from, to };
  }

  @Get('sales-summary')
  @RequirePermission('Report', 'read')
  salesSummary(@CurrentUser() session: UserSession, @Query() q: any) {
    return this.reports.salesSummary(session.companyId, { ...this.parseRange(q), groupBy: q.groupBy, branchId: q.branchId });
  }

  @Get('sales-by-product')
  @RequirePermission('Report', 'read')
  salesByProduct(@CurrentUser() session: UserSession, @Query() q: any) {
    return this.reports.salesByProduct(session.companyId, {
      ...this.parseRange(q),
      limit: q.limit ? Number(q.limit) : 20,
      orderBy: q.orderBy,
    });
  }

  @Get('sales-by-customer')
  @RequirePermission('Report', 'read')
  salesByCustomer(@CurrentUser() session: UserSession, @Query() q: any) {
    return this.reports.salesByCustomer(session.companyId, {
      ...this.parseRange(q),
      limit: q.limit ? Number(q.limit) : 20,
    });
  }

  @Get('sales-by-cashier')
  @RequirePermission('Report', 'read')
  salesByCashier(@CurrentUser() session: UserSession, @Query() q: any) {
    return this.reports.salesByCashier(session.companyId, this.parseRange(q));
  }

  @Get('sales-by-payment')
  @RequirePermission('Report', 'read')
  salesByPayment(@CurrentUser() session: UserSession, @Query() q: any) {
    return this.reports.salesByPaymentMethod(session.companyId, this.parseRange(q));
  }

  @Get('top-products')
  @RequirePermission('Report', 'read')
  topProducts(@CurrentUser() session: UserSession, @Query() q: any) {
    return this.reports.topProductsReport(session.companyId, {
      ...this.parseRange(q),
      limit: q.limit ? Number(q.limit) : 20,
    });
  }

  @Get('slow-moving')
  @RequirePermission('Report', 'read')
  slowMoving(@CurrentUser() session: UserSession, @Query() q: any) {
    return this.reports.slowMovingProducts(session.companyId, {
      daysThreshold: q.daysThreshold ? Number(q.daysThreshold) : 90,
    });
  }

  @Get('low-stock')
  @RequirePermission('Report', 'read')
  lowStock(@CurrentUser() session: UserSession) {
    return this.reports.lowStockReport(session.companyId);
  }

  @Get('stock-valuation')
  @RequirePermission('Report', 'read')
  stockValuation(@CurrentUser() session: UserSession, @Query('asOf') asOf?: string) {
    return this.reports.stockValuationReport(session.companyId, asOf ? new Date(asOf) : undefined);
  }

  @Get('ar-aging')
  @RequirePermission('Report', 'read')
  arAging(@CurrentUser() session: UserSession, @Query('asOf') asOf?: string) {
    return this.reports.arAgingReport(session.companyId, asOf ? new Date(asOf) : undefined);
  }

  @Get('top-suppliers')
  @RequirePermission('Report', 'read')
  topSuppliers(@CurrentUser() session: UserSession, @Query() q: any) {
    return this.reports.topSuppliersReport(session.companyId, {
      ...this.parseRange(q),
      limit: q.limit ? Number(q.limit) : 20,
    });
  }

  @Get('ap-aging')
  @RequirePermission('Report', 'read')
  apAging(@CurrentUser() session: UserSession, @Query('asOf') asOf?: string) {
    return this.reports.apAgingReport(session.companyId, asOf ? new Date(asOf) : undefined);
  }

  @Get('customer-ltv/:customerId')
  @RequirePermission('Report', 'read')
  ltv(@CurrentUser() session: UserSession, @Param('customerId') customerId: string) {
    return this.reports.customerLifetimeValue(session.companyId, customerId);
  }

  @Get('gift-profit')
  @RequirePermission('Report', 'read')
  giftProfit(@CurrentUser() session: UserSession, @Query() q: any) {
    return this.reports.giftProfitMargin(session.companyId, this.parseRange(q));
  }

  @Get('cash-movement')
  @RequirePermission('Report', 'read')
  cashMovement(@CurrentUser() session: UserSession, @Query() q: any) {
    return this.reports.cashMovementReport(session.companyId, { ...this.parseRange(q), branchId: q.branchId });
  }

  @Get('shift-variance')
  @RequirePermission('Report', 'read')
  shiftVariance(@CurrentUser() session: UserSession, @Query() q: any) {
    return this.reports.shiftVarianceReport(session.companyId, { ...this.parseRange(q), branchId: q.branchId });
  }

  @Get('discount-impact')
  @RequirePermission('Report', 'read')
  discountImpact(@CurrentUser() session: UserSession, @Query() q: any) {
    return this.reports.discountImpactReport(session.companyId, this.parseRange(q));
  }

  @Get('returns-analysis')
  @RequirePermission('Report', 'read')
  returnsAnalysis(@CurrentUser() session: UserSession, @Query() q: any) {
    return this.reports.returnsAnalysis(session.companyId, this.parseRange(q));
  }

  @Get('export/:reportName')
  @RequirePermission('Report', 'read')
  async exportCsv(
    @CurrentUser() session: UserSession,
    @Param('reportName') reportName: string,
    @Query() q: any,
    @Res() res: any,
  ) {
    const range = this.parseRange(q);
    const csv = await this.reports.exportToCsv(reportName, { ...q, ...range, companyId: session.companyId });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${reportName}.csv"`);
    res.send(csv);
  }
}
