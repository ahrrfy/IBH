import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { ulid } from 'ulid';

// ─── Seed: الرؤية العربية ERP ──────────────────────────────────────────────
// Creates:
//   1. Demo company + branches
//   2. Iraqi Chart of Accounts (النظام المحاسبي الموحد)
//   3. Default roles with permission bitmasks
//   4. System policies
//   5. Units of measure
//   6. Admin user (super@ruya.iq)

const prisma = new PrismaClient();

// Permission bitmasks (must match shared-types/permissions.ts)
const P = {
  CREATE:  0b0000001,  // 1
  READ:    0b0000010,  // 2
  UPDATE:  0b0000100,  // 4
  DELETE:  0b0001000,  // 8
  SUBMIT:  0b0010000,  // 16
  APPROVE: 0b0100000,  // 32
  PRINT:   0b1000000,  // 64
  ALL:     0b1111111,  // 127
  READ_PRINT: 0b1000010, // read + print
};

async function main() {
  console.log('🌱 Seeding database...');

  // ─── Company ────────────────────────────────────────────────────────────

  const company = await prisma.company.upsert({
    where: { code: 'RUA' },
    update: {},
    create: {
      code:       'RUA',
      nameAr:     'الرؤية العربية للتجارة',
      nameEn:     'Al-Ruya Al-Arabiya Trading',
      plan:       'enterprise',
      isActive:   true,
      createdBy:  'seed',
    },
  });

  console.log(`✅ Company: ${company.nameAr} (${company.id})`);

  // ─── Branches ────────────────────────────────────────────────────────────

  const branchBGD = await prisma.branch.upsert({
    where: { code_companyId: { code: 'BGD', companyId: company.id } },
    update: {},
    create: {
      code:      'BGD',
      nameAr:    'فرع بغداد الرئيسي',
      nameEn:    'Baghdad Main Branch',
      companyId: company.id,
      isActive:  true,
      createdBy: 'seed',
    },
  });

  const branchARB = await prisma.branch.upsert({
    where: { code_companyId: { code: 'ARB', companyId: company.id } },
    update: {},
    create: {
      code:      'ARB',
      nameAr:    'فرع أربيل',
      nameEn:    'Erbil Branch',
      companyId: company.id,
      isActive:  true,
      createdBy: 'seed',
    },
  });

  console.log(`✅ Branches: ${branchBGD.nameAr}, ${branchARB.nameAr}`);

  // ─── Roles ────────────────────────────────────────────────────────────────

  const roles = await seedRoles(company.id);
  console.log(`✅ Roles: ${roles.length} created`);

  // ─── Admin User ───────────────────────────────────────────────────────────

  const passwordHash = await argon2.hash('Admin@2026!', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const adminUser = await prisma.user.upsert({
    where: { email_companyId: { email: 'super@ruya.iq', companyId: company.id } },
    update: {},
    create: {
      email:        'super@ruya.iq',
      nameAr:       'مدير النظام',
      nameEn:       'System Admin',
      passwordHash,
      companyId:    company.id,
      branchId:     branchBGD.id,
      status:       'active',
      locale:       'ar',
      createdBy:    'seed',
    },
  });

  // Assign super_admin role
  const superAdminRole = roles.find(r => r.name === 'super_admin');
  if (superAdminRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: adminUser.id, roleId: superAdminRole.id } },
      update: { isActive: true },
      create: {
        userId:    adminUser.id,
        roleId:    superAdminRole.id,
        createdBy: 'seed',
        isActive:  true,
      },
    });
  }

  console.log(`✅ Admin user: ${adminUser.email}`);

  // ─── System Policies ──────────────────────────────────────────────────────

  await seedPolicies(company.id);
  console.log('✅ System policies created');

  // ─── Units of Measure ──────────────────────────────────────────────────────

  await seedUnitsOfMeasure(company.id);
  console.log('✅ Units of measure created');

  // ─── Chart of Accounts ─────────────────────────────────────────────────────

  await seedChartOfAccounts(company.id);
  console.log('✅ Chart of accounts (النظام المحاسبي الموحد العراقي) created');

  // ─── Accounting Period (current year) ──────────────────────────────────────

  const year = new Date().getFullYear();
  for (let month = 1; month <= 12; month++) {
    const startDate = new Date(year, month - 1, 1);
    const endDate   = new Date(year, month, 0);
    await prisma.accountingPeriod.upsert({
      where: { companyId_year_month: { companyId: company.id, year, month } },
      update: {},
      create: {
        companyId,
        year,
        month,
        startDate,
        endDate,
        status:    month <= new Date().getMonth() + 1 ? 'open' : 'open',
        createdBy: 'seed',
      },
    });
  }
  console.log(`✅ Accounting periods for ${year} created`);

  console.log('\n🎉 Seed complete!');
  console.log('   Login: super@ruya.iq / Admin@2026!');
}

// ─── Roles ───────────────────────────────────────────────────────────────────

async function seedRoles(companyId: string) {
  const roleDefinitions = [
    {
      name: 'super_admin',
      displayName: 'مدير النظام الأعلى',
      permissions: buildAllPermissions(),
      isSystem: true,
    },
    {
      name: 'company_admin',
      displayName: 'مدير الشركة',
      permissions: buildAllPermissions(),
      isSystem: true,
    },
    {
      name: 'accountant',
      displayName: 'محاسب',
      permissions: {
        Invoice:        P.READ | P.PRINT | P.SUBMIT,
        JournalEntry:   P.CREATE | P.READ | P.UPDATE | P.SUBMIT | P.PRINT,
        Payment:        P.CREATE | P.READ | P.UPDATE | P.SUBMIT | P.PRINT,
        ChartOfAccount: P.READ,
        Report:         P.READ | P.PRINT,
        Customer:       P.READ,
        Supplier:       P.READ,
      },
      isSystem: true,
    },
    {
      name: 'cashier',
      displayName: 'كاشير',
      permissions: {
        PosReceipt:  P.CREATE | P.READ | P.PRINT,
        Product:     P.READ,
        Customer:    P.READ | P.CREATE,
        Shift:       P.CREATE | P.READ | P.UPDATE,
      },
      isSystem: true,
    },
    {
      name: 'warehouse_manager',
      displayName: 'مدير المخزن',
      permissions: {
        Product:         P.READ,
        Inventory:       P.ALL,
        StockTransfer:   P.ALL,
        Stocktaking:     P.ALL,
        PurchaseOrder:   P.READ | P.SUBMIT,
        GoodsReceipt:    P.CREATE | P.READ | P.UPDATE | P.SUBMIT,
        Report:          P.READ | P.PRINT,
      },
      isSystem: true,
    },
    {
      name: 'sales_manager',
      displayName: 'مدير المبيعات',
      permissions: {
        Invoice:      P.ALL,
        SalesOrder:   P.ALL,
        Quotation:    P.ALL,
        Customer:     P.ALL,
        Product:      P.READ,
        Inventory:    P.READ,
        PriceList:    P.READ | P.UPDATE,
        Report:       P.READ | P.PRINT,
      },
      isSystem: true,
    },
    {
      name: 'purchasing_officer',
      displayName: 'مسؤول المشتريات',
      permissions: {
        PurchaseOrder:    P.ALL,
        GoodsReceipt:     P.ALL,
        Supplier:         P.ALL,
        Product:          P.READ,
        Inventory:        P.READ,
        Report:           P.READ | P.PRINT,
      },
      isSystem: true,
    },
    {
      name: 'hr_manager',
      displayName: 'مدير الموارد البشرية',
      permissions: {
        Employee:    P.ALL,
        Payroll:     P.ALL,
        Attendance:  P.ALL,
        Leave:       P.ALL,
        Report:      P.READ | P.PRINT,
      },
      isSystem: true,
    },
    {
      name: 'branch_manager',
      displayName: 'مدير الفرع',
      permissions: {
        Invoice:      P.ALL,
        SalesOrder:   P.ALL,
        PosReceipt:   P.ALL,
        Inventory:    P.ALL,
        Shift:        P.ALL,
        Customer:     P.ALL,
        Product:      P.READ,
        Report:       P.READ | P.PRINT,
        User:         P.READ,
      },
      isSystem: true,
    },
    {
      name: 'readonly_auditor',
      displayName: 'مدقق قراءة فقط',
      permissions: buildReadAllPermissions(),
      isSystem: true,
    },
  ];

  const results = [];
  for (const def of roleDefinitions) {
    const role = await prisma.role.upsert({
      where: { name_companyId: { name: def.name, companyId } },
      update: { permissions: def.permissions },
      create: {
        name:        def.name,
        displayName: def.displayName,
        permissions: def.permissions,
        isSystem:    def.isSystem,
        companyId,
        createdBy:   'seed',
      },
    });
    results.push(role);
  }

  return results;
}

function buildAllPermissions(): Record<string, number> {
  const resources = [
    'User', 'Role', 'Company', 'Branch',
    'Product', 'ProductVariant', 'PriceList', 'Category',
    'Inventory', 'StockTransfer', 'Stocktaking', 'Warehouse',
    'Customer', 'Supplier',
    'Invoice', 'SalesOrder', 'Quotation', 'PosReceipt', 'Shift',
    'PurchaseOrder', 'GoodsReceipt',
    'JournalEntry', 'ChartOfAccount', 'Payment', 'AccountingPeriod',
    'Employee', 'Payroll', 'Attendance', 'Leave',
    'Report', 'AuditLog',
  ];
  return Object.fromEntries(resources.map(r => [r, P.ALL]));
}

function buildReadAllPermissions(): Record<string, number> {
  return Object.fromEntries(
    Object.keys(buildAllPermissions()).map(r => [r, P.READ | P.PRINT]),
  );
}

// ─── System Policies ─────────────────────────────────────────────────────────

async function seedPolicies(companyId: string) {
  const policies = [
    { key: 'max_discount_cashier',          value: '10',         type: 'number',  description: 'الحد الأقصى للخصم للكاشير (%)' },
    { key: 'shift_close_tolerance_iqd',     value: '5000',       type: 'number',  description: 'هامش التسامح في إغلاق الوردية (دينار)' },
    { key: 'prevent_negative_stock',        value: 'true',       type: 'boolean', description: 'منع الرصيد السالب في المخزون' },
    { key: 'require_approval_above_iqd',    value: '5000000',    type: 'number',  description: 'يتطلب موافقة فوق هذا المبلغ (دينار)' },
    { key: 'require_dual_approval_above',   value: '20000000',   type: 'number',  description: 'يتطلب موافقتين فوق هذا المبلغ (دينار)' },
    { key: 'basket_reservation_minutes',    value: '30',         type: 'number',  description: 'مدة الاحتفاظ بحجز سلة المتجر (دقيقة)' },
    { key: 'allow_post_to_closed_period',   value: 'false',      type: 'boolean', description: 'السماح بالترحيل في فترة مقفلة' },
    { key: 'default_journal_require_reason',value: 'true',       type: 'boolean', description: 'إلزامية كتابة سبب القيد اليدوي' },
    { key: 'min_gross_margin_pct',          value: '15',         type: 'number',  description: 'الحد الأدنى لهامش الربح الإجمالي (%)' },
    { key: 'credit_limit_default_iqd',      value: '1000000',    type: 'number',  description: 'حد الائتمان الافتراضي للعميل (دينار)' },
    { key: 'quotation_validity_days',       value: '7',          type: 'number',  description: 'صلاحية عرض السعر الافتراضية (يوم)' },
  ];

  for (const policy of policies) {
    await prisma.systemPolicy.upsert({
      where: { companyId_key: { companyId, key: policy.key } },
      update: { value: policy.value },
      create: {
        companyId,
        key:         policy.key,
        value:       policy.value,
        type:        policy.type,
        description: policy.description,
        createdBy:   'seed',
      },
    });
  }
}

// ─── Units of Measure ─────────────────────────────────────────────────────────

async function seedUnitsOfMeasure(companyId: string) {
  const units = [
    { code: 'PCS',  nameAr: 'حبة',    nameEn: 'Piece',    isBase: true  },
    { code: 'KG',   nameAr: 'كيلو',   nameEn: 'Kilogram', isBase: true  },
    { code: 'G',    nameAr: 'غرام',   nameEn: 'Gram',     isBase: false },
    { code: 'M',    nameAr: 'متر',    nameEn: 'Meter',    isBase: true  },
    { code: 'CM',   nameAr: 'سنتمتر', nameEn: 'Centimeter', isBase: false },
    { code: 'L',    nameAr: 'لتر',    nameEn: 'Liter',    isBase: true  },
    { code: 'ML',   nameAr: 'مل',     nameEn: 'Milliliter', isBase: false },
    { code: 'BOX',  nameAr: 'علبة',   nameEn: 'Box',      isBase: false },
    { code: 'CARTON', nameAr: 'كارتون', nameEn: 'Carton', isBase: false },
    { code: 'PACK', nameAr: 'باكيج',  nameEn: 'Pack',     isBase: false },
    { code: 'PAIR', nameAr: 'زوج',    nameEn: 'Pair',     isBase: false },
    { code: 'DOZ',  nameAr: 'دزينة',  nameEn: 'Dozen',    isBase: false },
    { code: 'SVC',  nameAr: 'خدمة',   nameEn: 'Service',  isBase: true  },
    { code: 'HR',   nameAr: 'ساعة',   nameEn: 'Hour',     isBase: true  },
  ];

  for (const unit of units) {
    await prisma.unitOfMeasure.upsert({
      where: { code_companyId: { code: unit.code, companyId } },
      update: {},
      create: { ...unit, companyId, createdBy: 'seed' },
    });
  }
}

// ─── Chart of Accounts ────────────────────────────────────────────────────────
// النظام المحاسبي الموحد العراقي

async function seedChartOfAccounts(companyId: string) {
  type AccountDef = {
    code: string;
    nameAr: string;
    nameEn?: string;
    category: string;
    isParent?: boolean;
    parentCode?: string;
    isCash?: boolean;
    isBank?: boolean;
  };

  const accounts: AccountDef[] = [
    // ── 1. الموجودات الثابتة ──────────────────────────────────────────────
    { code: '1',    nameAr: 'الموجودات الثابتة',             nameEn: 'Fixed Assets',              category: 'fixed_assets',    isParent: true },
    { code: '11',   nameAr: 'الأراضي',                        nameEn: 'Land',                      category: 'fixed_assets',    parentCode: '1' },
    { code: '12',   nameAr: 'المباني والإنشاءات',             nameEn: 'Buildings',                 category: 'fixed_assets',    parentCode: '1' },
    { code: '129',  nameAr: 'مجمع إهتلاك المباني',           nameEn: 'Acc. Dep. Buildings',       category: 'fixed_assets',    parentCode: '12' },
    { code: '13',   nameAr: 'المكائن والمعدات',               nameEn: 'Machinery & Equipment',     category: 'fixed_assets',    parentCode: '1' },
    { code: '139',  nameAr: 'مجمع إهتلاك المكائن',           nameEn: 'Acc. Dep. Machinery',       category: 'fixed_assets',    parentCode: '13' },
    { code: '14',   nameAr: 'وسائط النقل',                    nameEn: 'Vehicles',                  category: 'fixed_assets',    parentCode: '1' },
    { code: '149',  nameAr: 'مجمع إهتلاك وسائط النقل',      nameEn: 'Acc. Dep. Vehicles',        category: 'fixed_assets',    parentCode: '14' },
    { code: '15',   nameAr: 'الأثاث والأجهزة',               nameEn: 'Furniture & Equipment',     category: 'fixed_assets',    parentCode: '1' },
    { code: '159',  nameAr: 'مجمع إهتلاك الأثاث',           nameEn: 'Acc. Dep. Furniture',       category: 'fixed_assets',    parentCode: '15' },
    { code: '16',   nameAr: 'العدد والأدوات',                 nameEn: 'Tools',                     category: 'fixed_assets',    parentCode: '1' },
    { code: '17',   nameAr: 'مشاريع تحت التنفيذ',            nameEn: 'Projects in Progress',      category: 'fixed_assets',    parentCode: '1' },

    // ── 2. الموجودات المتداولة ──────────────────────────────────────────────
    { code: '2',    nameAr: 'الموجودات المتداولة',            nameEn: 'Current Assets',            category: 'current_assets',  isParent: true },
    { code: '21',   nameAr: 'المخزون',                        nameEn: 'Inventory',                 category: 'current_assets',  parentCode: '2' },
    { code: '211',  nameAr: 'مواد أولية',                     nameEn: 'Raw Materials',             category: 'current_assets',  parentCode: '21' },
    { code: '212',  nameAr: 'بضاعة جاهزة',                   nameEn: 'Finished Goods',            category: 'current_assets',  parentCode: '21' },
    { code: '213',  nameAr: 'إنتاج تحت التشغيل (WIP)',       nameEn: 'Work in Progress',          category: 'current_assets',  parentCode: '21' },
    { code: '214',  nameAr: 'قطع غيار',                       nameEn: 'Spare Parts',               category: 'current_assets',  parentCode: '21' },
    { code: '215',  nameAr: 'مواد تغليف',                     nameEn: 'Packaging Materials',       category: 'current_assets',  parentCode: '21' },
    { code: '22',   nameAr: 'الذمم المدينة',                  nameEn: 'Accounts Receivable',       category: 'current_assets',  parentCode: '2' },
    { code: '221',  nameAr: 'العملاء',                        nameEn: 'Trade AR',                  category: 'current_assets',  parentCode: '22' },
    { code: '222',  nameAr: 'أوراق القبض',                   nameEn: 'Notes Receivable',          category: 'current_assets',  parentCode: '22' },
    { code: '223',  nameAr: 'سلف ودفعات مقدمة',             nameEn: 'Advance Payments',          category: 'current_assets',  parentCode: '22' },
    { code: '224',  nameAr: 'ذمم موظفين',                    nameEn: 'Employee Receivables',      category: 'current_assets',  parentCode: '22' },
    { code: '24',   nameAr: 'النقدية في الصندوق',             nameEn: 'Cash on Hand',              category: 'current_assets',  parentCode: '2',  isCash: true },
    { code: '2411', nameAr: 'صندوق الفرع الرئيسي',           nameEn: 'Main Branch Cash',          category: 'current_assets',  parentCode: '24', isCash: true },
    { code: '2412', nameAr: 'صندوق الكاشير 1 - وردية صباح',  nameEn: 'Cashier 1 Morning',         category: 'current_assets',  parentCode: '24', isCash: true },
    { code: '2413', nameAr: 'صندوق الكاشير 1 - وردية مساء',  nameEn: 'Cashier 1 Evening',         category: 'current_assets',  parentCode: '24', isCash: true },
    { code: '2414', nameAr: 'صندوق الكاشير 2 - وردية صباح',  nameEn: 'Cashier 2 Morning',         category: 'current_assets',  parentCode: '24', isCash: true },
    { code: '2415', nameAr: 'صندوق الكاشير 2 - وردية مساء',  nameEn: 'Cashier 2 Evening',         category: 'current_assets',  parentCode: '24', isCash: true },
    { code: '2421', nameAr: 'صندوق الشبكة (POS Terminal)',   nameEn: 'POS Terminal',              category: 'current_assets',  parentCode: '24', isCash: true },
    { code: '2431', nameAr: 'عهدة Zain Cash',                nameEn: 'Zain Cash Custodian',       category: 'current_assets',  parentCode: '24', isCash: true },
    { code: '2432', nameAr: 'عهدة FastPay',                  nameEn: 'FastPay Custodian',         category: 'current_assets',  parentCode: '24', isCash: true },
    { code: '2491', nameAr: 'صندوق النثريات',                nameEn: 'Petty Cash',                category: 'current_assets',  parentCode: '24', isCash: true },
    { code: '25',   nameAr: 'النقدية في المصارف',            nameEn: 'Cash in Banks',             category: 'current_assets',  parentCode: '2',  isBank: true },
    { code: '251',  nameAr: 'الرافدين - IQD',               nameEn: 'Rafidain Bank IQD',          category: 'current_assets',  parentCode: '25', isBank: true },
    { code: '252',  nameAr: 'الرشيد - IQD',                 nameEn: 'Rasheed Bank IQD',           category: 'current_assets',  parentCode: '25', isBank: true },
    { code: '253',  nameAr: 'TBI - USD',                    nameEn: 'TBI Bank USD',               category: 'current_assets',  parentCode: '25', isBank: true },
    { code: '254',  nameAr: 'ودائع ثابتة',                  nameEn: 'Fixed Deposits',             category: 'current_assets',  parentCode: '25', isBank: true },

    // ── 3. المطلوبات ──────────────────────────────────────────────────────
    { code: '3',    nameAr: 'المطلوبات',                     nameEn: 'Liabilities',               category: 'liabilities',     isParent: true },
    { code: '31',   nameAr: 'القروض طويلة الأجل',           nameEn: 'Long-term Loans',           category: 'liabilities',     parentCode: '3' },
    { code: '32',   nameAr: 'الذمم الدائنة',                nameEn: 'Accounts Payable',          category: 'liabilities',     parentCode: '3' },
    { code: '321',  nameAr: 'الموردون',                     nameEn: 'Trade AP',                  category: 'liabilities',     parentCode: '32' },
    { code: '322',  nameAr: 'أوراق الدفع',                  nameEn: 'Notes Payable',             category: 'liabilities',     parentCode: '32' },
    { code: '323',  nameAr: 'دفعات مقدمة من عملاء',        nameEn: 'Customer Advances',         category: 'liabilities',     parentCode: '32' },
    { code: '33',   nameAr: 'المصروفات المستحقة',           nameEn: 'Accrued Expenses',          category: 'liabilities',     parentCode: '3' },
    { code: '331',  nameAr: 'رواتب مستحقة',                nameEn: 'Accrued Salaries',          category: 'liabilities',     parentCode: '33' },
    { code: '332',  nameAr: 'إيجارات مستحقة',              nameEn: 'Accrued Rent',              category: 'liabilities',     parentCode: '33' },
    { code: '34',   nameAr: 'الضرائب المستحقة',             nameEn: 'Taxes Payable',             category: 'liabilities',     parentCode: '3' },
    { code: '341',  nameAr: 'ضريبة الدخل',                 nameEn: 'Income Tax Payable',        category: 'liabilities',     parentCode: '34' },
    { code: '342',  nameAr: 'ضريبة رواتب محجوزة',         nameEn: 'Withheld Salary Tax',       category: 'liabilities',     parentCode: '34' },

    // ── 4. حقوق الملكية ──────────────────────────────────────────────────
    { code: '4',    nameAr: 'حقوق الملكية',                 nameEn: 'Equity',                    category: 'equity',          isParent: true },
    { code: '41',   nameAr: 'رأس المال',                    nameEn: 'Capital',                   category: 'equity',          parentCode: '4' },
    { code: '42',   nameAr: 'الاحتياطيات',                  nameEn: 'Reserves',                  category: 'equity',          parentCode: '4' },
    { code: '43',   nameAr: 'الأرباح المحتجزة',             nameEn: 'Retained Earnings',         category: 'equity',          parentCode: '4' },
    { code: '44',   nameAr: 'نتيجة النشاط',                 nameEn: 'Net Income (Current Year)', category: 'equity',          parentCode: '4' },

    // ── 5. الإيرادات ──────────────────────────────────────────────────────
    { code: '5',    nameAr: 'الإيرادات',                    nameEn: 'Revenue',                   category: 'revenue',         isParent: true },
    { code: '51',   nameAr: 'إيرادات النشاط الرئيسي',      nameEn: 'Operating Revenue',         category: 'revenue',         parentCode: '5' },
    { code: '511',  nameAr: 'مبيعات نقدية',                nameEn: 'Cash Sales',                category: 'revenue',         parentCode: '51' },
    { code: '512',  nameAr: 'مبيعات آجلة',                 nameEn: 'Credit Sales',              category: 'revenue',         parentCode: '51' },
    { code: '513',  nameAr: 'إيرادات خدمات',               nameEn: 'Service Revenue',           category: 'revenue',         parentCode: '51' },
    { code: '514',  nameAr: 'إيرادات منتجات مخصصة',       nameEn: 'Custom Products Revenue',   category: 'revenue',         parentCode: '51' },
    { code: '52',   nameAr: 'مردودات المبيعات',             nameEn: 'Sales Returns',             category: 'revenue',         parentCode: '5' },
    { code: '53',   nameAr: 'الخصومات الممنوحة',           nameEn: 'Sales Discounts',           category: 'revenue',         parentCode: '5' },
    { code: '59',   nameAr: 'إيرادات أخرى',                nameEn: 'Other Revenue',             category: 'revenue',         parentCode: '5' },
    { code: '591',  nameAr: 'فوائد دائنة',                 nameEn: 'Interest Income',           category: 'revenue',         parentCode: '59' },
    { code: '592',  nameAr: 'أرباح فروقات عملة',          nameEn: 'FX Gains',                  category: 'revenue',         parentCode: '59' },
    { code: '593',  nameAr: 'إيرادات متنوعة',              nameEn: 'Miscellaneous Income',      category: 'revenue',         parentCode: '59' },

    // ── 6. المصروفات ──────────────────────────────────────────────────────
    { code: '6',    nameAr: 'المصروفات',                    nameEn: 'Expenses',                  category: 'expense',         isParent: true },
    { code: '61',   nameAr: 'تكلفة المبيعات',               nameEn: 'Cost of Sales',             category: 'expense',         parentCode: '6' },
    { code: '611',  nameAr: 'تكلفة البضاعة المباعة (COGS)', nameEn: 'COGS',                     category: 'expense',         parentCode: '61' },
    { code: '612',  nameAr: 'أجور مباشرة',                 nameEn: 'Direct Labor',              category: 'expense',         parentCode: '61' },
    { code: '613',  nameAr: 'مصروفات تصنيع غير مباشرة',   nameEn: 'Manufacturing Overhead',    category: 'expense',         parentCode: '61' },
    { code: '62',   nameAr: 'الرواتب والأجور',              nameEn: 'Salaries & Wages',          category: 'expense',         parentCode: '6' },
    { code: '621',  nameAr: 'رواتب موظفين',                nameEn: 'Employee Salaries',         category: 'expense',         parentCode: '62' },
    { code: '622',  nameAr: 'بدلات وحوافز',                nameEn: 'Allowances & Incentives',   category: 'expense',         parentCode: '62' },
    { code: '623',  nameAr: 'ضمان اجتماعي',                nameEn: 'Social Security',           category: 'expense',         parentCode: '62' },
    { code: '624',  nameAr: 'مكافآت نهاية الخدمة',        nameEn: 'End of Service Benefits',   category: 'expense',         parentCode: '62' },
    { code: '63',   nameAr: 'مصروفات الإدارة',              nameEn: 'Administrative Expenses',   category: 'expense',         parentCode: '6' },
    { code: '631',  nameAr: 'إيجارات',                     nameEn: 'Rent',                      category: 'expense',         parentCode: '63' },
    { code: '632',  nameAr: 'كهرباء وماء',                nameEn: 'Utilities',                 category: 'expense',         parentCode: '63' },
    { code: '633',  nameAr: 'اتصالات وإنترنت',            nameEn: 'Telecom & Internet',        category: 'expense',         parentCode: '63' },
    { code: '634',  nameAr: 'قرطاسية ومطبوعات',           nameEn: 'Stationery & Printing',     category: 'expense',         parentCode: '63' },
    { code: '635',  nameAr: 'ضيافة',                       nameEn: 'Hospitality',               category: 'expense',         parentCode: '63' },
    { code: '636',  nameAr: 'صيانة عامة',                  nameEn: 'General Maintenance',       category: 'expense',         parentCode: '63' },
    { code: '64',   nameAr: 'مصروفات التسويق والبيع',      nameEn: 'Sales & Marketing',         category: 'expense',         parentCode: '6' },
    { code: '641',  nameAr: 'دعاية وإعلان',                nameEn: 'Advertising',               category: 'expense',         parentCode: '64' },
    { code: '642',  nameAr: 'عمولات مندوبين',              nameEn: 'Sales Commissions',         category: 'expense',         parentCode: '64' },
    { code: '643',  nameAr: 'نقل ومواصلات',                nameEn: 'Transportation',            category: 'expense',         parentCode: '64' },
    { code: '644',  nameAr: 'تغليف وتعبئة',                nameEn: 'Packaging',                 category: 'expense',         parentCode: '64' },
    { code: '65',   nameAr: 'الإهتلاكات',                  nameEn: 'Depreciation',              category: 'expense',         parentCode: '6' },
    { code: '651',  nameAr: 'إهتلاك المباني',              nameEn: 'Dep. Buildings',            category: 'expense',         parentCode: '65' },
    { code: '652',  nameAr: 'إهتلاك المكائن',              nameEn: 'Dep. Machinery',            category: 'expense',         parentCode: '65' },
    { code: '653',  nameAr: 'إهتلاك وسائط النقل',         nameEn: 'Dep. Vehicles',             category: 'expense',         parentCode: '65' },
    { code: '654',  nameAr: 'إهتلاك الأثاث والأجهزة',     nameEn: 'Dep. Furniture',            category: 'expense',         parentCode: '65' },
    { code: '66',   nameAr: 'مصروفات مالية',               nameEn: 'Financial Expenses',        category: 'expense',         parentCode: '6' },
    { code: '661',  nameAr: 'فوائد مدينة',                 nameEn: 'Interest Expense',          category: 'expense',         parentCode: '66' },
    { code: '662',  nameAr: 'عمولات بنكية',                nameEn: 'Bank Charges',              category: 'expense',         parentCode: '66' },
    { code: '663',  nameAr: 'عمولات بوابات دفع',          nameEn: 'Payment Gateway Fees',      category: 'expense',         parentCode: '66' },
    { code: '664',  nameAr: 'خسائر فروقات عملة',          nameEn: 'FX Losses',                 category: 'expense',         parentCode: '66' },
    { code: '69',   nameAr: 'مصروفات متنوعة',              nameEn: 'Miscellaneous Expenses',    category: 'expense',         parentCode: '6' },
  ];

  // Create accounts in order (parents first)
  const codeToId: Record<string, string> = {};

  for (const acc of accounts) {
    const parentId = acc.parentCode ? codeToId[acc.parentCode] : null;

    const existing = await prisma.chartOfAccount.findFirst({
      where: { code: acc.code, companyId },
    });

    const account = existing
      ? await prisma.chartOfAccount.update({
          where: { id: existing.id },
          data: { nameAr: acc.nameAr, nameEn: acc.nameEn },
        })
      : await prisma.chartOfAccount.create({
          data: {
            code:        acc.code,
            nameAr:      acc.nameAr,
            nameEn:      acc.nameEn ?? '',
            category:    acc.category as never,
            isParent:    acc.isParent ?? false,
            isCash:      acc.isCash ?? false,
            isBank:      acc.isBank ?? false,
            parentId,
            companyId,
            isActive:    true,
            allowPosting: !(acc.isParent ?? false),
            createdBy:   'seed',
          },
        });

    codeToId[acc.code] = account.id;
  }
}

main()
  .catch(e => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
