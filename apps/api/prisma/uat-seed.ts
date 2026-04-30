/**
 * UAT seed — UAT-ready dataset for Phase 4 user acceptance testing.
 *
 * Idempotent: each entity uses upsert with deterministic codes/SKUs so this
 * script can be re-run without creating duplicates.
 *
 * Builds on top of seed-bootstrap.ts (companies, roles, users, CoA) and
 * demo-seed.ts (5 products, 3 customers, 2 suppliers). Adds:
 *
 *   - 50 products total (45 new across 5 categories)
 *   - 20 customers total (17 new — mix of regular/wholesale/credit)
 *   - 10 suppliers total (8 new — different specializations)
 *   - 10 employees in main department (full HR fields populated)
 *
 * Run:
 *   docker compose exec -T api sh -c "cd /app/apps/api && npx tsx prisma/uat-seed.ts"
 *
 * For real-data UAT this is meant to be supplemented with:
 *   - 100 historical sales invoices (via SalesInvoiceService — needs auth)
 *   - 50 stock movements (via InventoryService — needs auth)
 *   - 5 payroll runs (via PayrollService — needs full attendance data)
 *
 * Those require service-layer calls, not direct Prisma writes, because of
 * F2/F3 invariants enforced by the posting/inventory engines.
 */
import { PrismaClient, ProductType, CustomerType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Prisma 7 (I040) requires the driver-adapter pattern instead of a plain
// `new PrismaClient()`. Construct the same way PrismaService does in
// apps/api/src/platform/prisma/prisma.service.ts.
// I062 — Pool max=1 + RLS bypass (see seed-bootstrap.ts).
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const CATEGORIES = [
  { code: 'FOOD',     nameAr: 'مواد غذائية',    nameEn: 'Food' },
  { code: 'DRINKS',   nameAr: 'مشروبات',         nameEn: 'Drinks' },
  { code: 'HOUSE',    nameAr: 'منزلية',          nameEn: 'Household' },
  { code: 'ELEC',     nameAr: 'إلكترونيات',     nameEn: 'Electronics' },
  { code: 'STAT',     nameAr: 'قرطاسية',         nameEn: 'Stationery' },
];

const PRODUCTS = [
  // Food (10)
  { sku: 'UAT-F-001', cat: 'FOOD',   name: 'أرز بسمتي 5 كجم',     price: 12000, cost: 8000 },
  { sku: 'UAT-F-002', cat: 'FOOD',   name: 'سكر أبيض 1 كجم',       price: 1500,  cost: 900 },
  { sku: 'UAT-F-003', cat: 'FOOD',   name: 'دقيق أبيض 5 كجم',      price: 6000,  cost: 4000 },
  { sku: 'UAT-F-004', cat: 'FOOD',   name: 'زيت دوار الشمس 1 لتر', price: 3500,  cost: 2200 },
  { sku: 'UAT-F-005', cat: 'FOOD',   name: 'معكرونة سباغيتي 500 جم',price: 1500,  cost: 800 },
  { sku: 'UAT-F-006', cat: 'FOOD',   name: 'تونة معلبة 200 جم',     price: 2500,  cost: 1500 },
  { sku: 'UAT-F-007', cat: 'FOOD',   name: 'لبن طبيعي 1 كجم',       price: 2000,  cost: 1200 },
  { sku: 'UAT-F-008', cat: 'FOOD',   name: 'عسل أصلي 500 جم',       price: 15000, cost: 9000 },
  { sku: 'UAT-F-009', cat: 'FOOD',   name: 'تمر سكري 1 كجم',        price: 8000,  cost: 5000 },
  { sku: 'UAT-F-010', cat: 'FOOD',   name: 'ملح طعام 1 كجم',         price: 500,   cost: 250 },
  // Drinks (10)
  { sku: 'UAT-D-001', cat: 'DRINKS', name: 'مياه معدنية 500 مل',    price: 500,   cost: 300 },
  { sku: 'UAT-D-002', cat: 'DRINKS', name: 'بيبسي كولا 1 لتر',      price: 1500,  cost: 1000 },
  { sku: 'UAT-D-003', cat: 'DRINKS', name: 'شاي ليبتون 100 كيس',    price: 4000,  cost: 2500 },
  { sku: 'UAT-D-004', cat: 'DRINKS', name: 'قهوة عربية 250 جم',     price: 7500,  cost: 5000 },
  { sku: 'UAT-D-005', cat: 'DRINKS', name: 'عصير برتقال 1 لتر',     price: 2500,  cost: 1500 },
  { sku: 'UAT-D-006', cat: 'DRINKS', name: 'حليب طويل المدة 1 لتر', price: 2000,  cost: 1300 },
  { sku: 'UAT-D-007', cat: 'DRINKS', name: 'ماء شعير 330 مل',        price: 1000,  cost: 600 },
  { sku: 'UAT-D-008', cat: 'DRINKS', name: 'نسكافيه ذهبي 100 جم',   price: 6000,  cost: 4000 },
  { sku: 'UAT-D-009', cat: 'DRINKS', name: 'مياه غازية 2 لتر',       price: 2000,  cost: 1300 },
  { sku: 'UAT-D-010', cat: 'DRINKS', name: 'مشروب طاقة 250 مل',     price: 1500,  cost: 1000 },
  // Household (10)
  { sku: 'UAT-H-001', cat: 'HOUSE',  name: 'منظف أرضيات 1 لتر',     price: 3000,  cost: 1800 },
  { sku: 'UAT-H-002', cat: 'HOUSE',  name: 'مسحوق غسيل 3 كجم',      price: 8500,  cost: 5500 },
  { sku: 'UAT-H-003', cat: 'HOUSE',  name: 'صابون يدين 500 مل',     price: 2500,  cost: 1500 },
  { sku: 'UAT-H-004', cat: 'HOUSE',  name: 'مناديل ورقية 5 علب',     price: 3000,  cost: 1800 },
  { sku: 'UAT-H-005', cat: 'HOUSE',  name: 'كيس قمامة 30 كيس',      price: 2000,  cost: 1200 },
  { sku: 'UAT-H-006', cat: 'HOUSE',  name: 'فرشاة أسنان للكبار',    price: 1500,  cost: 800 },
  { sku: 'UAT-H-007', cat: 'HOUSE',  name: 'معجون أسنان 100 مل',    price: 2500,  cost: 1500 },
  { sku: 'UAT-H-008', cat: 'HOUSE',  name: 'شامبو 500 مل',           price: 4500,  cost: 3000 },
  { sku: 'UAT-H-009', cat: 'HOUSE',  name: 'منظف أطباق 1 لتر',      price: 3500,  cost: 2200 },
  { sku: 'UAT-H-010', cat: 'HOUSE',  name: 'إسفنج جلي 5 قطع',       price: 1500,  cost: 900 },
  // Electronics (10)
  { sku: 'UAT-E-001', cat: 'ELEC',   name: 'بطارية AA 4 قطع',        price: 3000,  cost: 2000 },
  { sku: 'UAT-E-002', cat: 'ELEC',   name: 'بطارية AAA 4 قطع',       price: 3000,  cost: 2000 },
  { sku: 'UAT-E-003', cat: 'ELEC',   name: 'كابل شاحن USB-C',         price: 5000,  cost: 3000 },
  { sku: 'UAT-E-004', cat: 'ELEC',   name: 'سماعة بلوتوث',           price: 35000, cost: 20000 },
  { sku: 'UAT-E-005', cat: 'ELEC',   name: 'مصباح LED 9 واط',         price: 7500,  cost: 5000 },
  { sku: 'UAT-E-006', cat: 'ELEC',   name: 'شريط لاصق ملون',          price: 2000,  cost: 1200 },
  { sku: 'UAT-E-007', cat: 'ELEC',   name: 'لوحة مفاتيح USB',         price: 25000, cost: 15000 },
  { sku: 'UAT-E-008', cat: 'ELEC',   name: 'فأرة كمبيوتر USB',        price: 12000, cost: 7000 },
  { sku: 'UAT-E-009', cat: 'ELEC',   name: 'حامل هاتف',                price: 8000,  cost: 5000 },
  { sku: 'UAT-E-010', cat: 'ELEC',   name: 'ميزان رقمي',              price: 45000, cost: 28000 },
  // Stationery (5)
  { sku: 'UAT-S-001', cat: 'STAT',   name: 'دفتر A4 100 ورقة',         price: 2500,  cost: 1500 },
  { sku: 'UAT-S-002', cat: 'STAT',   name: 'قلم حبر أزرق 12 قطعة',    price: 3000,  cost: 1800 },
  { sku: 'UAT-S-003', cat: 'STAT',   name: 'مقص مكتبي',                 price: 2500,  cost: 1500 },
  { sku: 'UAT-S-004', cat: 'STAT',   name: 'لاصق ورق 50 ورقة',         price: 1500,  cost: 900 },
  { sku: 'UAT-S-005', cat: 'STAT',   name: 'مرطّب جسم 200 مل',          price: 5500,  cost: 3500 },
];

const CUSTOMERS = [
  // 7 retail (regular)
  { code: 'UAT-CUST-R01', nameAr: 'علي محمد',         phone: '07700000001', type: 'regular' as const, credit: 0 },
  { code: 'UAT-CUST-R02', nameAr: 'سارة كاظم',         phone: '07700000002', type: 'regular' as const, credit: 0 },
  { code: 'UAT-CUST-R03', nameAr: 'حسن إبراهيم',       phone: '07700000003', type: 'regular' as const, credit: 0 },
  { code: 'UAT-CUST-R04', nameAr: 'مريم العبيدي',      phone: '07700000004', type: 'regular' as const, credit: 0 },
  { code: 'UAT-CUST-R05', nameAr: 'يوسف الجبوري',      phone: '07700000005', type: 'regular' as const, credit: 0 },
  { code: 'UAT-CUST-R06', nameAr: 'زينب الكاظمي',      phone: '07700000006', type: 'regular' as const, credit: 0 },
  { code: 'UAT-CUST-R07', nameAr: 'كريم النجار',       phone: '07700000007', type: 'regular' as const, credit: 0 },
  // 5 wholesale (credit)
  { code: 'UAT-CUST-W01', nameAr: 'متجر الخير',         phone: '07710000001', type: 'wholesale' as const, credit: 1000000 },
  { code: 'UAT-CUST-W02', nameAr: 'سوبرماركت السلام',   phone: '07710000002', type: 'wholesale' as const, credit: 2500000 },
  { code: 'UAT-CUST-W03', nameAr: 'بقالة الأمل',         phone: '07710000003', type: 'wholesale' as const, credit: 500000 },
  { code: 'UAT-CUST-W04', nameAr: 'مطعم النور',          phone: '07710000004', type: 'wholesale' as const, credit: 1500000 },
  { code: 'UAT-CUST-W05', nameAr: 'فندق دجلة',          phone: '07710000005', type: 'wholesale' as const, credit: 5000000 },
  // 5 corporate
  { code: 'UAT-CUST-C01', nameAr: 'شركة الإنشاءات الحديثة', phone: '07720000001', type: 'corporate' as const, credit: 10000000 },
  { code: 'UAT-CUST-C02', nameAr: 'مؤسسة التعليم العالي',    phone: '07720000002', type: 'corporate' as const, credit: 8000000 },
  { code: 'UAT-CUST-C03', nameAr: 'مستشفى السلام',           phone: '07720000003', type: 'corporate' as const, credit: 15000000 },
  { code: 'UAT-CUST-C04', nameAr: 'مكتب المحاماة',            phone: '07720000004', type: 'corporate' as const, credit: 3000000 },
  { code: 'UAT-CUST-C05', nameAr: 'وكالة السفر النيل',        phone: '07720000005', type: 'corporate' as const, credit: 5000000 },
];

const SUPPLIERS = [
  { code: 'UAT-SUP-001', nameAr: 'موزع الأغذية المركزي',  phone: '07901100001' },
  { code: 'UAT-SUP-002', nameAr: 'مخازن المشروبات',         phone: '07901100002' },
  { code: 'UAT-SUP-003', nameAr: 'موزع المنتجات المنزلية', phone: '07901100003' },
  { code: 'UAT-SUP-004', nameAr: 'وكالة الإلكترونيات',     phone: '07901100004' },
  { code: 'UAT-SUP-005', nameAr: 'مكتبة بغداد للقرطاسية',  phone: '07901100005' },
  { code: 'UAT-SUP-006', nameAr: 'مستوردات الخليج',         phone: '07901100006' },
  { code: 'UAT-SUP-007', nameAr: 'الشركة الوطنية للتجارة',  phone: '07901100007' },
  { code: 'UAT-SUP-008', nameAr: 'موزع الشمال',              phone: '07901100008' },
];

const EMPLOYEES = [
  { num: 'EMP-001', nameAr: 'أحمد العلي',          position: 'مدير عام',          salary: 2500000, hire: '2023-01-15' },
  { num: 'EMP-002', nameAr: 'فاطمة الخفاجي',        position: 'محاسبة رئيسية',     salary: 1800000, hire: '2023-03-01' },
  { num: 'EMP-003', nameAr: 'محمد الجبوري',         position: 'مدير مبيعات',        salary: 1500000, hire: '2023-06-01' },
  { num: 'EMP-004', nameAr: 'زهراء العبيدي',        position: 'كاشيرة',             salary: 850000,  hire: '2024-02-15' },
  { num: 'EMP-005', nameAr: 'علي الموسوي',          position: 'مسؤول مخزن',         salary: 1100000, hire: '2024-04-01' },
  { num: 'EMP-006', nameAr: 'مريم الحسني',          position: 'موظفة موارد بشرية',   salary: 1300000, hire: '2024-07-01' },
  { num: 'EMP-007', nameAr: 'حسن الكاظمي',          position: 'سائق توصيل',         salary: 700000,  hire: '2024-09-15' },
  { num: 'EMP-008', nameAr: 'نور الزهراء',          position: 'موظفة استقبال',       salary: 800000,  hire: '2025-01-15' },
  { num: 'EMP-009', nameAr: 'كرار الأنصاري',        position: 'فني صيانة',          salary: 950000,  hire: '2025-04-01' },
  { num: 'EMP-010', nameAr: 'بنت الهدى',            position: 'موظفة مبيعات',        salary: 900000,  hire: '2025-08-01' },
];

async function main() {
  console.log('🌱 UAT seed starting...');

  // I062 — bypass RLS for the seed (see seed-bootstrap.ts).
  await prisma.$executeRaw`SELECT set_config('app.bypass_rls', '1', false)`;

  const company = await prisma.company.findFirst({ where: { code: 'RUA' } });
  if (!company) throw new Error('Company RUA not found — run seed-bootstrap.ts first');
  const branch = await prisma.branch.findFirst({
    where: { companyId: company.id, isMainBranch: true },
  });
  if (!branch) throw new Error('Main branch not found');

  const pcs = await prisma.unitOfMeasure.findFirst({
    where: { companyId: company.id, abbreviation: 'PCS' },
  });
  if (!pcs) throw new Error('PCS unit not found — run seed.ts first');

  console.log(`✅ context: company=${company.id} branch=${branch.id}`);

  // ── Categories (idempotent by name) ───────────────────────────────────────
  const categoryByCode = new Map<string, string>();
  for (const cat of CATEGORIES) {
    let row = await prisma.productCategory.findFirst({
      where: { companyId: company.id, nameAr: cat.nameAr },
    });
    if (!row) {
      row = await prisma.productCategory.create({
        data: {
          companyId: company.id,
          nameAr: cat.nameAr,
          nameEn: cat.nameEn,
          level: 0,
          path: '',
          isActive: true,
        },
      });
    }
    categoryByCode.set(cat.code, row.id);
  }
  console.log(`✅ categories: ${CATEGORIES.length}`);

  // ── Products + Variants (idempotent by SKU) ───────────────────────────────
  for (const p of PRODUCTS) {
    const categoryId = categoryByCode.get(p.cat);
    if (!categoryId) continue;
    const tmpl = await prisma.productTemplate.upsert({
      where: { companyId_sku: { companyId: company.id, sku: p.sku } },
      update: {},
      create: {
        companyId: company.id,
        sku: p.sku,
        nameAr: p.name,
        nameEn: p.name,
        name1: p.name,
        generatedFullName: p.name,
        categoryId,
        type: ProductType.storable,
        baseUnitId: pcs.id,
        saleUnitId: pcs.id,
        purchaseUnitId: pcs.id,
        defaultSalePriceIqd: p.price,
        defaultPurchasePriceIqd: p.cost,
        minSalePriceIqd: Math.floor(p.price * 0.8),
        isActive: true,
        tags: ['uat'],
        createdBy: 'uat-seed',
        updatedBy: 'uat-seed',
      },
    });
    await prisma.productVariant.upsert({
      where: { companyId_sku: { companyId: company.id, sku: p.sku } },
      update: {},
      create: {
        companyId: company.id,
        templateId: tmpl.id,
        sku: p.sku,
        attributeValues: {},
        isActive: true,
        createdBy: 'uat-seed',
        updatedBy: 'uat-seed',
      },
    });
  }
  console.log(`✅ products: ${PRODUCTS.length} new`);

  // ── Customers ─────────────────────────────────────────────────────────────
  for (const c of CUSTOMERS) {
    await prisma.customer.upsert({
      where: { companyId_code: { companyId: company.id, code: c.code } },
      update: {},
      create: {
        companyId: company.id,
        code: c.code,
        nameAr: c.nameAr,
        phone: c.phone,
        type: c.type as CustomerType,
        creditLimitIqd: c.credit,
        creditBalanceIqd: 0,
        isActive: true,
        createdBy: 'uat-seed',
        updatedBy: 'uat-seed',
      },
    });
  }
  console.log(`✅ customers: ${CUSTOMERS.length} new`);

  // ── Suppliers ─────────────────────────────────────────────────────────────
  for (const s of SUPPLIERS) {
    await prisma.supplier.upsert({
      where: { companyId_code: { companyId: company.id, code: s.code } },
      update: {},
      create: {
        companyId: company.id,
        code: s.code,
        nameAr: s.nameAr,
        phone: s.phone,
        balanceIqd: 0,
        isActive: true,
        createdBy: 'uat-seed',
        updatedBy: 'uat-seed',
      },
    });
  }
  console.log(`✅ suppliers: ${SUPPLIERS.length} new`);

  // ── Employees ─────────────────────────────────────────────────────────────
  // Idempotent on (companyId, employeeNumber) unique constraint.
  const dummyAuditId = '00000000000000000000000001';
  for (const e of EMPLOYEES) {
    await prisma.employee.upsert({
      where: { companyId_employeeNumber: { companyId: company.id, employeeNumber: e.num } },
      update: {},
      create: {
        companyId: company.id,
        branchId: branch.id,
        employeeNumber: e.num,
        nameAr: e.nameAr,
        positionTitle: e.position,
        baseSalaryIqd: e.salary,
        hireDate: new Date(e.hire),
        status: 'active',
        socialSecurityEnrolled: true,
        createdBy: dummyAuditId,
        updatedBy: dummyAuditId,
      },
    });
  }
  console.log(`✅ employees: ${EMPLOYEES.length} new`);

  // ── Final report ──────────────────────────────────────────────────────────
  const counts = {
    products:  await prisma.productTemplate.count({ where: { companyId: company.id } }),
    variants:  await prisma.productVariant.count({ where: { companyId: company.id } }),
    customers: await prisma.customer.count({ where: { companyId: company.id } }),
    suppliers: await prisma.supplier.count({ where: { companyId: company.id } }),
    employees: await prisma.employee.count({ where: { companyId: company.id } }),
  };
  console.log('🎉 UAT seed complete:', counts);
}

main()
  .catch((e) => { console.error('❌ UAT seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
