/**
 * Full seed for الرؤية العربية ERP
 *   1. Company + 2 branches
 *   2. Default Roles (super_admin, accountant, cashier, ...)
 *   3. Admin user (from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD env vars)
 *   4. System policies
 *   5. Units of Measure
 *   6. Iraqi Chart of Accounts (~70 accounts)
 *   7. Accounting periods (current year, 12 months)
 *   8. Warehouses (main + sales_floor + damaged + QC)
 *   9. Pay grades G1–G5
 *  10. Posting profiles (uses CoA IDs)
 *  11. Walk-in customer
 *
 * Run with: pnpm --filter api exec prisma db seed
 */
import { PrismaClient, AccountCategory, AccountType, WarehouseType } from '@prisma/client';
import * as argon2 from 'argon2';
import { seedPlans } from './seed/plans.seed';

const prisma = new PrismaClient();

// Permission bitmasks
const P = {
  CREATE: 1, READ: 2, UPDATE: 4, DELETE: 8, SUBMIT: 16, APPROVE: 32, PRINT: 64,
  ALL: 127,
  READ_PRINT: 66,
};

async function main() {
  console.log('🌱 Seeding database...');

  // ─── 1. Company ──────────────────────────────────────────────────────────
  const company = await prisma.company.upsert({
    where: { code: 'RUA' },
    update: {},
    create: {
      code: 'RUA',
      nameAr: 'الرؤية العربية للتجارة',
      nameEn: 'Al-Ruya Al-Arabiya Trading',
      plan: 'enterprise',
      isActive: true,
      createdBy: 'seed',
      updatedBy: 'seed',
    },
  });
  console.log(`✅ Company: ${company.nameAr}`);

  // ─── 2. Branches ─────────────────────────────────────────────────────────
  const branchBGD = await prisma.branch.upsert({
    where: { companyId_code: { companyId: company.id, code: 'BGD' } },
    update: {},
    create: {
      companyId: company.id, code: 'BGD',
      nameAr: 'فرع بغداد الرئيسي', nameEn: 'Baghdad Main Branch',
      isMainBranch: true, isActive: true,
      createdBy: 'seed', updatedBy: 'seed',
    },
  });
  const branchARB = await prisma.branch.upsert({
    where: { companyId_code: { companyId: company.id, code: 'ARB' } },
    update: {},
    create: {
      companyId: company.id, code: 'ARB',
      nameAr: 'فرع أربيل', nameEn: 'Erbil Branch',
      isActive: true,
      createdBy: 'seed', updatedBy: 'seed',
    },
  });
  console.log(`✅ Branches: ${branchBGD.code}, ${branchARB.code}`);

  // ─── 3. Roles ────────────────────────────────────────────────────────────
  const roleDefs = [
    { name: 'super_admin',       displayNameAr: 'مدير النظام الأعلى', permissions: allResources(P.ALL) },
    { name: 'company_admin',     displayNameAr: 'مدير الشركة',         permissions: allResources(P.ALL) },
    { name: 'accountant',        displayNameAr: 'محاسب',               permissions: {
        Invoice: P.READ | P.PRINT | P.SUBMIT,
        JournalEntry: P.CREATE | P.READ | P.UPDATE | P.SUBMIT | P.PRINT,
        Payment: P.CREATE | P.READ | P.UPDATE | P.SUBMIT | P.PRINT,
        ChartOfAccount: P.READ, Report: P.READ_PRINT,
        Customer: P.READ, Supplier: P.READ,
      } },
    { name: 'cashier',           displayNameAr: 'كاشير',               permissions: {
        PosReceipt: P.CREATE | P.READ | P.PRINT,
        Product: P.READ, Customer: P.READ | P.CREATE,
        Shift: P.CREATE | P.READ | P.UPDATE,
      } },
    { name: 'warehouse_manager', displayNameAr: 'مدير المخزن',         permissions: {
        Product: P.READ, Inventory: P.ALL, StockTransfer: P.ALL, Stocktaking: P.ALL,
        PurchaseOrder: P.READ | P.SUBMIT, GoodsReceipt: P.CREATE | P.READ | P.UPDATE | P.SUBMIT,
        Report: P.READ_PRINT,
      } },
    { name: 'sales_manager',     displayNameAr: 'مدير المبيعات',       permissions: {
        Invoice: P.ALL, SalesOrder: P.ALL, Quotation: P.ALL, Customer: P.ALL,
        Product: P.READ, Inventory: P.READ, PriceList: P.READ | P.UPDATE, Report: P.READ_PRINT,
      } },
    { name: 'purchasing_officer',displayNameAr: 'مسؤول المشتريات',     permissions: {
        PurchaseOrder: P.ALL, GoodsReceipt: P.ALL, Supplier: P.ALL,
        Product: P.READ, Inventory: P.READ, Report: P.READ_PRINT,
      } },
    { name: 'hr_manager',        displayNameAr: 'مدير الموارد البشرية', permissions: {
        Employee: P.ALL, Payroll: P.ALL, Attendance: P.ALL, Leave: P.ALL, Report: P.READ_PRINT,
      } },
    { name: 'branch_manager',    displayNameAr: 'مدير الفرع',          permissions: {
        Invoice: P.ALL, SalesOrder: P.ALL, PosReceipt: P.ALL, Inventory: P.ALL,
        Shift: P.ALL, Customer: P.ALL, Product: P.READ, Report: P.READ_PRINT, User: P.READ,
      } },
    { name: 'readonly_auditor',  displayNameAr: 'مدقق قراءة فقط',     permissions: allResources(P.READ_PRINT) },
  ];

  const roles: Record<string, any> = {};
  for (const def of roleDefs) {
    const role = await prisma.role.upsert({
      where: { companyId_name: { companyId: company.id, name: def.name } },
      update: { permissions: def.permissions },
      create: {
        companyId: company.id,
        name: def.name,
        displayNameAr: def.displayNameAr,
        permissions: def.permissions,
        isSystem: true,
      },
    });
    roles[def.name] = role;
  }
  console.log(`✅ Roles: ${Object.keys(roles).length}`);

  // ─── 4. Admin user ───────────────────────────────────────────────────────
  // Password from env — fail if not set, no defaults.
  const adminPwd = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPwd || adminPwd.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD env var required (≥12 chars)');
  }
  const passwordHash = await argon2.hash(adminPwd, {
    type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4,
  });
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@al-ruya.iq';
  const adminUser = await prisma.user.upsert({
    where: { companyId_email: { companyId: company.id, email: adminEmail } },
    update: {},
    create: {
      companyId: company.id, branchId: branchBGD.id,
      email: adminEmail, passwordHash,
      nameAr: 'مدير النظام', nameEn: 'System Admin',
      status: 'active', locale: 'ar',
      createdBy: 'seed', updatedBy: 'seed',
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: roles.super_admin.id } },
    update: {},
    create: { userId: adminUser.id, roleId: roles.super_admin.id, assignedBy: 'seed' },
  });
  console.log(`✅ Admin: ${adminUser.email}`);

  // ─── 5. System Policies ──────────────────────────────────────────────────
  const policies = [
    { key: 'max_discount_cashier',          val: 10,        desc: 'الحد الأقصى للخصم للكاشير (%)' },
    { key: 'shift_close_tolerance_iqd',     val: 5000,      desc: 'هامش التسامح في إغلاق الوردية' },
    { key: 'prevent_negative_stock',        val: true,      desc: 'منع الرصيد السالب في المخزون' },
    { key: 'require_approval_above_iqd',    val: 5000000,   desc: 'يتطلب موافقة فوق هذا المبلغ' },
    { key: 'require_dual_approval_above',   val: 20000000,  desc: 'يتطلب موافقتين فوق هذا المبلغ' },
    { key: 'basket_reservation_minutes',    val: 30,        desc: 'مدة حجز سلة المتجر (دقيقة)' },
    { key: 'allow_post_to_closed_period',   val: false,     desc: 'الترحيل في فترة مقفلة' },
    { key: 'default_journal_require_reason',val: true,      desc: 'إلزامية كتابة سبب القيد اليدوي' },
    { key: 'min_gross_margin_pct',          val: 15,        desc: 'الحد الأدنى لهامش الربح (%)' },
    { key: 'credit_limit_default_iqd',      val: 1000000,   desc: 'حد الائتمان الافتراضي للعميل' },
    { key: 'quotation_validity_days',       val: 7,         desc: 'صلاحية عرض السعر (يوم)' },
  ];
  // Prisma's compound-unique upsert can't match `branchId: null` (Postgres
  // treats NULL as not-equal-to-NULL). Use findFirst + create/update instead.
  for (const p of policies) {
    const existing = await prisma.systemPolicy.findFirst({
      where: { companyId: company.id, branchId: null, policyKey: p.key },
    });
    if (existing) {
      await prisma.systemPolicy.update({
        where: { id: existing.id },
        data: { policyValue: p.val as any, description: p.desc, updatedBy: adminUser.id },
      });
    } else {
      await prisma.systemPolicy.create({
        data: {
          companyId: company.id, branchId: null,
          policyKey: p.key, policyValue: p.val as any,
          description: p.desc, updatedBy: adminUser.id,
        },
      });
    }
  }
  console.log(`✅ Policies: ${policies.length}`);

  // ─── 6. Units of Measure ─────────────────────────────────────────────────
  const units = [
    { abbr: 'PCS',    nameAr: 'حبة',    nameEn: 'Piece',     base: true  },
    { abbr: 'KG',     nameAr: 'كيلو',   nameEn: 'Kilogram',  base: true  },
    { abbr: 'G',      nameAr: 'غرام',   nameEn: 'Gram',      base: false },
    { abbr: 'M',      nameAr: 'متر',    nameEn: 'Meter',     base: true  },
    { abbr: 'CM',     nameAr: 'سنتمتر', nameEn: 'Centimeter',base: false },
    { abbr: 'L',      nameAr: 'لتر',    nameEn: 'Liter',     base: true  },
    { abbr: 'ML',     nameAr: 'مل',     nameEn: 'Milliliter',base: false },
    { abbr: 'BOX',    nameAr: 'علبة',   nameEn: 'Box',       base: false },
    { abbr: 'CARTON', nameAr: 'كارتون', nameEn: 'Carton',    base: false },
    { abbr: 'PACK',   nameAr: 'باكيج',  nameEn: 'Pack',      base: false },
    { abbr: 'PAIR',   nameAr: 'زوج',    nameEn: 'Pair',      base: false },
    { abbr: 'DOZ',    nameAr: 'دزينة',  nameEn: 'Dozen',     base: false },
    { abbr: 'SVC',    nameAr: 'خدمة',   nameEn: 'Service',   base: true  },
    { abbr: 'HR',     nameAr: 'ساعة',   nameEn: 'Hour',      base: true  },
  ];
  for (const u of units) {
    await prisma.unitOfMeasure.upsert({
      where: { companyId_abbreviation: { companyId: company.id, abbreviation: u.abbr } },
      update: {},
      create: {
        companyId: company.id, abbreviation: u.abbr,
        nameAr: u.nameAr, nameEn: u.nameEn,
        isBaseUnit: u.base, isActive: true,
      },
    });
  }
  console.log(`✅ Units: ${units.length}`);

  // ─── 7. Chart of Accounts (Iraqi unified) ───────────────────────────────
  const codeToId = await seedChartOfAccounts(company.id);
  console.log(`✅ Chart of Accounts: ${Object.keys(codeToId).length} accounts`);

  // ─── 8. Accounting Periods (current year) ───────────────────────────────
  const year = new Date().getFullYear();
  for (let month = 1; month <= 12; month++) {
    const startDate = new Date(year, month - 1, 1);
    const endDate   = new Date(year, month, 0);
    await prisma.accountingPeriod.upsert({
      where: { companyId_year_month: { companyId: company.id, year, month } },
      update: {},
      create: {
        companyId: company.id, year, month, startDate, endDate, status: 'open',
      },
    });
  }
  console.log(`✅ Accounting periods: ${year}-01 → ${year}-12`);

  // ─── 9. Warehouses ──────────────────────────────────────────────────────
  const warehouses = [
    { code: 'MAIN-BGD', nameAr: 'المستودع الرئيسي — بغداد', branchId: branchBGD.id, type: WarehouseType.main,         isDefault: true },
    { code: 'POS-BGD',  nameAr: 'رف المبيعات — بغداد',        branchId: branchBGD.id, type: WarehouseType.sales_floor, isDefault: false },
    { code: 'DMG-BGD',  nameAr: 'مخزن التالف — بغداد',         branchId: branchBGD.id, type: WarehouseType.damaged,     isDefault: false },
    { code: 'QC-BGD',   nameAr: 'فحص الجودة — بغداد',          branchId: branchBGD.id, type: WarehouseType.quality_hold,isDefault: false },
    { code: 'MAIN-ARB', nameAr: 'المستودع الرئيسي — أربيل',    branchId: branchARB.id, type: WarehouseType.main,         isDefault: true },
    { code: 'POS-ARB',  nameAr: 'رف المبيعات — أربيل',         branchId: branchARB.id, type: WarehouseType.sales_floor, isDefault: false },
  ];
  for (const w of warehouses) {
    const exists = await prisma.warehouse.findFirst({ where: { companyId: company.id, code: w.code } });
    if (!exists) {
      await prisma.warehouse.create({
        data: {
          companyId: company.id, branchId: w.branchId,
          code: w.code, nameAr: w.nameAr, type: w.type,
          isActive: true, isDefault: w.isDefault,
          createdBy: adminUser.id, updatedBy: adminUser.id,
        },
      });
    }
  }
  console.log(`✅ Warehouses: ${warehouses.length}`);

  // ─── 10. Pay Grades ─────────────────────────────────────────────────────
  const grades = [
    { code: 'G1', nameAr: 'الدرجة الأولى',  min: 300000,  mid: 400000,  max: 500000 },
    { code: 'G2', nameAr: 'الدرجة الثانية', min: 500000,  mid: 650000,  max: 800000 },
    { code: 'G3', nameAr: 'الدرجة الثالثة', min: 800000,  mid: 1000000, max: 1200000 },
    { code: 'G4', nameAr: 'الدرجة الرابعة', min: 1200000, mid: 1500000, max: 1800000 },
    { code: 'G5', nameAr: 'الدرجة الخامسة', min: 1800000, mid: 2250000, max: 2700000 },
  ];
  for (const g of grades) {
    const exists = await prisma.payGrade.findFirst({ where: { companyId: company.id, code: g.code } });
    if (!exists) {
      await prisma.payGrade.create({
        data: {
          companyId: company.id, code: g.code, nameAr: g.nameAr,
          minSalaryIqd: g.min, midSalaryIqd: g.mid, maxSalaryIqd: g.max,
          annualIncreasePct: 5, isActive: true,
        },
      });
    }
  }
  console.log(`✅ Pay grades: ${grades.length}`);

  // ─── 11. Posting Profiles (use CoA IDs) ─────────────────────────────────
  const profiles = [
    { type: 'pos_sale_cash',   nameAr: 'فاتورة POS نقدية', dr: '2411', cr: '511',  sec: [{ dr: '611', cr: '212' }] },
    { type: 'pos_sale_credit', nameAr: 'فاتورة آجلة',       dr: '221',  cr: '512',  sec: [{ dr: '611', cr: '212' }] },
    { type: 'goods_receipt',   nameAr: 'استلام بضاعة',       dr: '212',  cr: '321',  sec: null },
    { type: 'salary_payment',  nameAr: 'دفع رواتب',          dr: '621',  cr: '251',  sec: null },
    { type: 'depreciation',    nameAr: 'استهلاك شهري',       dr: '651',  cr: '129',  sec: null },
    { type: 'sales_return',    nameAr: 'مرتجع مبيعات',       dr: '52',   cr: '2411', sec: [{ dr: '212', cr: '611' }] },
    { type: 'cash_short_over', nameAr: 'فرق الخزنة',         dr: '69',   cr: '593',  sec: null },
  ];
  for (const p of profiles) {
    const drId = codeToId[p.dr];
    const crId = codeToId[p.cr];
    if (!drId || !crId) continue;
    const exists = await prisma.postingProfile.findFirst({
      where: { companyId: company.id, branchId: null, transactionType: p.type },
    });
    if (!exists) {
      await prisma.postingProfile.create({
        data: {
          companyId: company.id,
          transactionType: p.type, nameAr: p.nameAr,
          debitAccountId: drId, creditAccountId: crId,
          secondaryEntries: p.sec
            ? p.sec.map((s) => ({ debitAccountId: codeToId[s.dr], creditAccountId: codeToId[s.cr] }))
            : undefined,
          isActive: true, createdBy: adminUser.id,
        },
      });
    }
  }
  console.log(`✅ Posting profiles: ${profiles.length}`);

  // ─── 11b. Account Mappings (T48 — Financial Accounts Configurator) ──────
  // One row per (company, eventType). These replace hardcoded GL literals
  // baked into posting code paths in sales/purchases/inventory/payroll/etc.
  // Codes here MUST match codes seeded into the Iraqi CoA above.
  const accountMappings: Array<{ eventType: string; code: string; description: string }> = [
    // Sales — F2: every sale event = balanced JE via posting engine
    { eventType: 'sale.cash',           code: '2411', description: 'Cash debit on cash sale' },
    { eventType: 'sale.credit',         code: '221',  description: 'AR debit on credit sale' },
    { eventType: 'sale.revenue.cash',   code: '511',  description: 'Cash sales revenue' },
    { eventType: 'sale.revenue.cr',     code: '512',  description: 'Credit sales revenue' },
    { eventType: 'sale.cogs',           code: '611',  description: 'COGS' },
    { eventType: 'sale.inventory',      code: '212',  description: 'Inventory credit on sale' },
    { eventType: 'sale.return.cogs',    code: '611',  description: 'COGS reversal on sales return' },
    // Purchases / Vendor invoices
    { eventType: 'purchase.ap',         code: '321',  description: 'AP credit on vendor invoice' },
    { eventType: 'purchase.inventory',  code: '212',  description: 'Inventory debit on GRN' },
    { eventType: 'purchase.vat.in',     code: '341',  description: 'Input VAT receivable' },
    { eventType: 'purchase.freight',    code: '643',  description: 'Freight inwards expense' },
    { eventType: 'purchase.misc.income',code: '593',  description: 'Misc income on purchase' },
    { eventType: 'grn.clearing',        code: '331',  description: 'GRN clearing / GR-IR' },
    // Payroll
    { eventType: 'payroll.gross',       code: '621',  description: 'Gross salary expense' },
    { eventType: 'payroll.tax',         code: '342',  description: 'Income tax withheld payable' },
    { eventType: 'payroll.ss',          code: '331',  description: 'Social security payable' },
    { eventType: 'payroll.net',         code: '2411', description: 'Net salary payable (cash/bank)' },
    // Fixed assets
    { eventType: 'asset.cash',          code: '2411', description: 'Cash credit on asset purchase' },
    { eventType: 'asset.ap',            code: '321',  description: 'AP credit on asset purchase' },
    { eventType: 'asset.maintenance',   code: '636',  description: 'Asset maintenance expense' },
    { eventType: 'asset.gain',          code: '593',  description: 'Misc income on asset disposal' },
    // Banking
    { eventType: 'bank.charge',         code: '662',  description: 'Bank charges expense' },
    { eventType: 'bank.interest',       code: '593',  description: 'Bank interest income (misc)' },
    // AR receipts
    { eventType: 'ar.control',          code: '221',  description: 'AR control account' },
  ];
  for (const m of accountMappings) {
    if (!codeToId[m.code]) continue; // skip if CoA code missing in this company
    await prisma.accountMapping.upsert({
      where: { companyId_eventType: { companyId: company.id, eventType: m.eventType } },
      create: {
        companyId:   company.id,
        eventType:   m.eventType,
        accountCode: m.code,
        description: m.description,
      },
      update: { accountCode: m.code, description: m.description },
    });
  }
  console.log(`✅ Account mappings: ${accountMappings.length}`);

  // ─── 12. Walk-in Customer ───────────────────────────────────────────────
  const exists = await prisma.customer.findFirst({ where: { companyId: company.id, code: 'WALK-IN' } });
  if (!exists) {
    await prisma.customer.create({
      data: {
        companyId: company.id, code: 'WALK-IN', type: 'walk_in',
        nameAr: 'عميل نقدي', nameEn: 'Walk-in Customer',
        isActive: true, createdBy: adminUser.id, updatedBy: adminUser.id,
      } as any,
    });
  }
  console.log('✅ Walk-in customer');

  // ─── 13. Subscription Plans (T60) ────────────────────────────────────────
  await seedPlans(prisma);

  console.log('\n🎉 Seed complete!');
  console.log('   Login: see SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD env vars');
}

// ────────────────────────────────────────────────────────────────────────────
// helpers

function allResources(perm: number): Record<string, number> {
  const resources = [
    'User', 'Role', 'Company', 'Branch',
    'Product', 'ProductVariant', 'PriceList', 'Category',
    'Inventory', 'StockTransfer', 'Stocktaking', 'Warehouse',
    'Customer', 'Supplier',
    'Invoice', 'SalesOrder', 'Quotation', 'PosReceipt', 'Shift',
    'PurchaseOrder', 'GoodsReceipt', 'VendorInvoice',
    'JournalEntry', 'ChartOfAccount', 'Payment', 'AccountingPeriod',
    'Employee', 'Payroll', 'Attendance', 'Leave',
    'FixedAsset', 'Depreciation',
    'Lead', 'Campaign', 'Promotion', 'JobOrder',
    'Report', 'AuditLog', 'FinancialReport',
  ];
  return Object.fromEntries(resources.map((r) => [r, perm]));
}

async function seedChartOfAccounts(companyId: string): Promise<Record<string, string>> {
  type AccountDef = {
    code: string;
    nameAr: string;
    nameEn?: string;
    category: AccountCategory;
    accountType: AccountType;
    isHeader?: boolean;
    parentCode?: string;
    isCash?: boolean;
    isBank?: boolean;
  };

  const dr: AccountType = 'debit_normal' as AccountType;
  const cr: AccountType = 'credit_normal' as AccountType;
  const fa: AccountCategory = 'fixed_assets' as AccountCategory;
  const ca: AccountCategory = 'current_assets' as AccountCategory;
  const li: AccountCategory = 'liabilities' as AccountCategory;
  const eq: AccountCategory = 'equity' as AccountCategory;
  const rv: AccountCategory = 'revenue' as AccountCategory;
  const ex: AccountCategory = 'expense' as AccountCategory;

  const accounts: AccountDef[] = [
    // 1. Fixed Assets
    { code: '1',    nameAr: 'الموجودات الثابتة', nameEn: 'Fixed Assets', category: fa, accountType: dr, isHeader: true },
    { code: '11',   nameAr: 'الأراضي', nameEn: 'Land', category: fa, accountType: dr, parentCode: '1' },
    { code: '12',   nameAr: 'المباني والإنشاءات', nameEn: 'Buildings', category: fa, accountType: dr, parentCode: '1' },
    { code: '129',  nameAr: 'مجمع إهتلاك المباني', nameEn: 'Acc. Dep. Buildings', category: fa, accountType: cr, parentCode: '12' },
    { code: '13',   nameAr: 'المكائن والمعدات', nameEn: 'Machinery', category: fa, accountType: dr, parentCode: '1' },
    { code: '139',  nameAr: 'مجمع إهتلاك المكائن', nameEn: 'Acc. Dep. Machinery', category: fa, accountType: cr, parentCode: '13' },
    { code: '14',   nameAr: 'وسائط النقل', nameEn: 'Vehicles', category: fa, accountType: dr, parentCode: '1' },
    { code: '149',  nameAr: 'مجمع إهتلاك وسائط النقل', nameEn: 'Acc. Dep. Vehicles', category: fa, accountType: cr, parentCode: '14' },
    { code: '15',   nameAr: 'الأثاث والأجهزة', nameEn: 'Furniture', category: fa, accountType: dr, parentCode: '1' },
    { code: '159',  nameAr: 'مجمع إهتلاك الأثاث', nameEn: 'Acc. Dep. Furniture', category: fa, accountType: cr, parentCode: '15' },
    { code: '16',   nameAr: 'العدد والأدوات', nameEn: 'Tools', category: fa, accountType: dr, parentCode: '1' },
    { code: '17',   nameAr: 'مشاريع تحت التنفيذ', nameEn: 'Projects in Progress', category: fa, accountType: dr, parentCode: '1' },

    // 2. Current Assets
    { code: '2',    nameAr: 'الموجودات المتداولة', nameEn: 'Current Assets', category: ca, accountType: dr, isHeader: true },
    { code: '21',   nameAr: 'المخزون', nameEn: 'Inventory', category: ca, accountType: dr, parentCode: '2', isHeader: true },
    { code: '211',  nameAr: 'مواد أولية', nameEn: 'Raw Materials', category: ca, accountType: dr, parentCode: '21' },
    { code: '212',  nameAr: 'بضاعة جاهزة', nameEn: 'Finished Goods', category: ca, accountType: dr, parentCode: '21' },
    { code: '213',  nameAr: 'إنتاج تحت التشغيل', nameEn: 'Work in Progress', category: ca, accountType: dr, parentCode: '21' },
    { code: '214',  nameAr: 'قطع غيار', nameEn: 'Spare Parts', category: ca, accountType: dr, parentCode: '21' },
    { code: '215',  nameAr: 'مواد تغليف', nameEn: 'Packaging', category: ca, accountType: dr, parentCode: '21' },
    { code: '22',   nameAr: 'الذمم المدينة', nameEn: 'Accounts Receivable', category: ca, accountType: dr, parentCode: '2', isHeader: true },
    { code: '221',  nameAr: 'العملاء', nameEn: 'Trade AR', category: ca, accountType: dr, parentCode: '22' },
    { code: '222',  nameAr: 'أوراق القبض', nameEn: 'Notes Receivable', category: ca, accountType: dr, parentCode: '22' },
    { code: '223',  nameAr: 'سلف ودفعات مقدمة', nameEn: 'Advance Payments', category: ca, accountType: dr, parentCode: '22' },
    { code: '224',  nameAr: 'ذمم موظفين', nameEn: 'Employee Receivables', category: ca, accountType: dr, parentCode: '22' },
    { code: '24',   nameAr: 'النقدية في الصندوق', nameEn: 'Cash on Hand', category: ca, accountType: dr, parentCode: '2', isHeader: true, isCash: true },
    { code: '2411', nameAr: 'صندوق الفرع الرئيسي', nameEn: 'Main Branch Cash', category: ca, accountType: dr, parentCode: '24', isCash: true },
    { code: '2412', nameAr: 'صندوق الكاشير 1 - صباح', nameEn: 'Cashier 1 Morning', category: ca, accountType: dr, parentCode: '24', isCash: true },
    { code: '2413', nameAr: 'صندوق الكاشير 1 - مساء', nameEn: 'Cashier 1 Evening', category: ca, accountType: dr, parentCode: '24', isCash: true },
    { code: '2421', nameAr: 'صندوق بطاقات الدفع (ماستر/فيزا)', nameEn: 'Card Payment Terminal', category: ca, accountType: dr, parentCode: '24', isCash: true },
    { code: '2431', nameAr: 'عهدة Zain Cash', nameEn: 'Zain Cash', category: ca, accountType: dr, parentCode: '24', isCash: true },
    { code: '2432', nameAr: 'عهدة FastPay', nameEn: 'FastPay', category: ca, accountType: dr, parentCode: '24', isCash: true },
    { code: '2491', nameAr: 'صندوق النثريات', nameEn: 'Petty Cash', category: ca, accountType: dr, parentCode: '24', isCash: true },
    { code: '25',   nameAr: 'النقدية في المصارف', nameEn: 'Cash in Banks', category: ca, accountType: dr, parentCode: '2', isHeader: true, isBank: true },
    { code: '251',  nameAr: 'الرافدين - IQD', nameEn: 'Rafidain IQD', category: ca, accountType: dr, parentCode: '25', isBank: true },
    { code: '252',  nameAr: 'الرشيد - IQD', nameEn: 'Rasheed IQD', category: ca, accountType: dr, parentCode: '25', isBank: true },
    { code: '253',  nameAr: 'TBI - USD', nameEn: 'TBI USD', category: ca, accountType: dr, parentCode: '25', isBank: true },

    // 3. Liabilities
    { code: '3',    nameAr: 'المطلوبات', nameEn: 'Liabilities', category: li, accountType: cr, isHeader: true },
    { code: '31',   nameAr: 'القروض طويلة الأجل', nameEn: 'Long-term Loans', category: li, accountType: cr, parentCode: '3' },
    { code: '32',   nameAr: 'الذمم الدائنة', nameEn: 'Accounts Payable', category: li, accountType: cr, parentCode: '3', isHeader: true },
    { code: '321',  nameAr: 'الموردون', nameEn: 'Trade AP', category: li, accountType: cr, parentCode: '32' },
    { code: '322',  nameAr: 'أوراق الدفع', nameEn: 'Notes Payable', category: li, accountType: cr, parentCode: '32' },
    { code: '323',  nameAr: 'دفعات مقدمة من عملاء', nameEn: 'Customer Advances', category: li, accountType: cr, parentCode: '32' },
    { code: '33',   nameAr: 'المصروفات المستحقة', nameEn: 'Accrued Expenses', category: li, accountType: cr, parentCode: '3', isHeader: true },
    { code: '331',  nameAr: 'رواتب مستحقة', nameEn: 'Accrued Salaries', category: li, accountType: cr, parentCode: '33' },
    { code: '332',  nameAr: 'إيجارات مستحقة', nameEn: 'Accrued Rent', category: li, accountType: cr, parentCode: '33' },
    { code: '34',   nameAr: 'الضرائب المستحقة', nameEn: 'Taxes Payable', category: li, accountType: cr, parentCode: '3', isHeader: true },
    { code: '341',  nameAr: 'ضريبة الدخل', nameEn: 'Income Tax', category: li, accountType: cr, parentCode: '34' },
    { code: '342',  nameAr: 'ضريبة رواتب محجوزة', nameEn: 'Withheld Salary Tax', category: li, accountType: cr, parentCode: '34' },

    // 4. Equity
    { code: '4',    nameAr: 'حقوق الملكية', nameEn: 'Equity', category: eq, accountType: cr, isHeader: true },
    { code: '41',   nameAr: 'رأس المال', nameEn: 'Capital', category: eq, accountType: cr, parentCode: '4' },
    { code: '42',   nameAr: 'الاحتياطيات', nameEn: 'Reserves', category: eq, accountType: cr, parentCode: '4' },
    { code: '43',   nameAr: 'الأرباح المحتجزة', nameEn: 'Retained Earnings', category: eq, accountType: cr, parentCode: '4' },
    { code: '44',   nameAr: 'نتيجة النشاط', nameEn: 'Net Income', category: eq, accountType: cr, parentCode: '4' },

    // 5. Revenue
    { code: '5',    nameAr: 'الإيرادات', nameEn: 'Revenue', category: rv, accountType: cr, isHeader: true },
    { code: '51',   nameAr: 'إيرادات النشاط الرئيسي', nameEn: 'Operating Revenue', category: rv, accountType: cr, parentCode: '5', isHeader: true },
    { code: '511',  nameAr: 'مبيعات نقدية', nameEn: 'Cash Sales', category: rv, accountType: cr, parentCode: '51' },
    { code: '512',  nameAr: 'مبيعات آجلة', nameEn: 'Credit Sales', category: rv, accountType: cr, parentCode: '51' },
    { code: '513',  nameAr: 'إيرادات خدمات', nameEn: 'Service Revenue', category: rv, accountType: cr, parentCode: '51' },
    { code: '514',  nameAr: 'إيرادات منتجات مخصصة', nameEn: 'Custom Products', category: rv, accountType: cr, parentCode: '51' },
    { code: '52',   nameAr: 'مردودات المبيعات', nameEn: 'Sales Returns', category: rv, accountType: dr, parentCode: '5' },
    { code: '53',   nameAr: 'الخصومات الممنوحة', nameEn: 'Sales Discounts', category: rv, accountType: dr, parentCode: '5' },
    { code: '59',   nameAr: 'إيرادات أخرى', nameEn: 'Other Revenue', category: rv, accountType: cr, parentCode: '5', isHeader: true },
    { code: '591',  nameAr: 'فوائد دائنة', nameEn: 'Interest Income', category: rv, accountType: cr, parentCode: '59' },
    { code: '592',  nameAr: 'أرباح فروقات عملة', nameEn: 'FX Gains', category: rv, accountType: cr, parentCode: '59' },
    { code: '593',  nameAr: 'إيرادات متنوعة', nameEn: 'Misc. Income', category: rv, accountType: cr, parentCode: '59' },

    // 6. Expenses
    { code: '6',    nameAr: 'المصروفات', nameEn: 'Expenses', category: ex, accountType: dr, isHeader: true },
    { code: '61',   nameAr: 'تكلفة المبيعات', nameEn: 'Cost of Sales', category: ex, accountType: dr, parentCode: '6', isHeader: true },
    { code: '611',  nameAr: 'تكلفة البضاعة المباعة', nameEn: 'COGS', category: ex, accountType: dr, parentCode: '61' },
    { code: '612',  nameAr: 'أجور مباشرة', nameEn: 'Direct Labor', category: ex, accountType: dr, parentCode: '61' },
    { code: '613',  nameAr: 'مصروفات تصنيع', nameEn: 'Manufacturing OH', category: ex, accountType: dr, parentCode: '61' },
    { code: '62',   nameAr: 'الرواتب والأجور', nameEn: 'Salaries', category: ex, accountType: dr, parentCode: '6', isHeader: true },
    { code: '621',  nameAr: 'رواتب موظفين', nameEn: 'Employee Salaries', category: ex, accountType: dr, parentCode: '62' },
    { code: '622',  nameAr: 'بدلات وحوافز', nameEn: 'Allowances', category: ex, accountType: dr, parentCode: '62' },
    { code: '623',  nameAr: 'ضمان اجتماعي', nameEn: 'Social Security', category: ex, accountType: dr, parentCode: '62' },
    { code: '624',  nameAr: 'مكافآت نهاية الخدمة', nameEn: 'EOSB', category: ex, accountType: dr, parentCode: '62' },
    { code: '63',   nameAr: 'مصروفات الإدارة', nameEn: 'Administrative', category: ex, accountType: dr, parentCode: '6', isHeader: true },
    { code: '631',  nameAr: 'إيجارات', nameEn: 'Rent', category: ex, accountType: dr, parentCode: '63' },
    { code: '632',  nameAr: 'كهرباء وماء', nameEn: 'Utilities', category: ex, accountType: dr, parentCode: '63' },
    { code: '633',  nameAr: 'اتصالات وإنترنت', nameEn: 'Telecom', category: ex, accountType: dr, parentCode: '63' },
    { code: '634',  nameAr: 'قرطاسية ومطبوعات', nameEn: 'Stationery', category: ex, accountType: dr, parentCode: '63' },
    { code: '635',  nameAr: 'ضيافة', nameEn: 'Hospitality', category: ex, accountType: dr, parentCode: '63' },
    { code: '636',  nameAr: 'صيانة عامة', nameEn: 'Maintenance', category: ex, accountType: dr, parentCode: '63' },
    { code: '64',   nameAr: 'مصروفات التسويق والبيع', nameEn: 'Sales & Marketing', category: ex, accountType: dr, parentCode: '6', isHeader: true },
    { code: '641',  nameAr: 'دعاية وإعلان', nameEn: 'Advertising', category: ex, accountType: dr, parentCode: '64' },
    { code: '642',  nameAr: 'عمولات مندوبين', nameEn: 'Commissions', category: ex, accountType: dr, parentCode: '64' },
    { code: '643',  nameAr: 'نقل ومواصلات', nameEn: 'Transportation', category: ex, accountType: dr, parentCode: '64' },
    { code: '644',  nameAr: 'تغليف وتعبئة', nameEn: 'Packaging', category: ex, accountType: dr, parentCode: '64' },
    { code: '65',   nameAr: 'الإهتلاكات', nameEn: 'Depreciation', category: ex, accountType: dr, parentCode: '6', isHeader: true },
    { code: '651',  nameAr: 'إهتلاك المباني', nameEn: 'Dep. Buildings', category: ex, accountType: dr, parentCode: '65' },
    { code: '652',  nameAr: 'إهتلاك المكائن', nameEn: 'Dep. Machinery', category: ex, accountType: dr, parentCode: '65' },
    { code: '653',  nameAr: 'إهتلاك وسائط النقل', nameEn: 'Dep. Vehicles', category: ex, accountType: dr, parentCode: '65' },
    { code: '654',  nameAr: 'إهتلاك الأثاث', nameEn: 'Dep. Furniture', category: ex, accountType: dr, parentCode: '65' },
    { code: '66',   nameAr: 'مصروفات مالية', nameEn: 'Financial', category: ex, accountType: dr, parentCode: '6', isHeader: true },
    { code: '661',  nameAr: 'فوائد مدينة', nameEn: 'Interest Expense', category: ex, accountType: dr, parentCode: '66' },
    { code: '662',  nameAr: 'عمولات بنكية', nameEn: 'Bank Charges', category: ex, accountType: dr, parentCode: '66' },
    { code: '663',  nameAr: 'عمولات بوابات دفع', nameEn: 'Payment Gateway', category: ex, accountType: dr, parentCode: '66' },
    { code: '664',  nameAr: 'خسائر فروقات عملة', nameEn: 'FX Losses', category: ex, accountType: dr, parentCode: '66' },
    { code: '69',   nameAr: 'مصروفات متنوعة', nameEn: 'Misc. Expenses', category: ex, accountType: dr, parentCode: '6' },
  ];

  const codeToId: Record<string, string> = {};
  for (const acc of accounts) {
    const parentId = acc.parentCode ? codeToId[acc.parentCode] : null;
    const existing = await prisma.chartOfAccount.findFirst({
      where: { companyId, code: acc.code },
    });
    const account = existing
      ? await prisma.chartOfAccount.update({
          where: { id: existing.id },
          data: { nameAr: acc.nameAr, nameEn: acc.nameEn },
        })
      : await prisma.chartOfAccount.create({
          data: {
            companyId, code: acc.code,
            nameAr: acc.nameAr, nameEn: acc.nameEn ?? '',
            category: acc.category, accountType: acc.accountType,
            isHeader: acc.isHeader ?? false,
            isCashAccount: acc.isCash ?? false,
            isBankAccount: acc.isBank ?? false,
            parentId, isActive: true,
            allowDirectPosting: !(acc.isHeader ?? false),
            createdBy: 'seed',
          },
        });
    codeToId[acc.code] = account.id;
  }
  return codeToId;
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
