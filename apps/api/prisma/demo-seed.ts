/**
 * Demo seed for the Al-Ruya ERP — creates sample operational data.
 *
 * Idempotent: each entity uses upsert with a deterministic code/SKU so
 * re-running this script never creates duplicates.
 *
 * Adds, on top of the reference data created by `seed.ts`:
 *   - 5 sample products (with one variant each, prices)
 *   - 3 sample customers (cash + credit)
 *   - 2 sample suppliers
 *   - 3 sample employees in main department
 *
 * Run with: docker compose exec -T api sh -c "cd /app/apps/api && npx tsx prisma/demo-seed.ts"
 */
import { PrismaClient, ProductType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// I040 — Prisma 7 driver-adapter pattern (matches PrismaService).
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🎭 Demo data seeder starting...');

  const company = await prisma.company.findFirst({ where: { code: 'RUA' } });
  if (!company) throw new Error('Company RUA not found — run seed.ts first');

  const branch = await prisma.branch.findFirst({
    where: { companyId: company.id, isMainBranch: true },
  });
  if (!branch) throw new Error('Main branch not found');

  console.log(`✅ context: company=${company.id} branch=${branch.id}`);

  // ── Categories ────────────────────────────────────────────────────────────
  // ProductCategory has no `code` field & no unique constraint beyond id, so
  // we look up by name and create if missing.
  let generalCategory = await prisma.productCategory.findFirst({
    where: { companyId: company.id, nameAr: 'عام' },
  });
  if (!generalCategory) {
    generalCategory = await prisma.productCategory.create({
      data: {
        companyId: company.id,
        nameAr: 'عام',
        nameEn: 'General',
        level: 0,
        path: '',
        isActive: true,
      },
    });
  }
  console.log(`✅ category: ${generalCategory.nameAr}`);

  // UnitOfMeasure has no `code` column; the unique key is `abbreviation`
  // (see seed.ts which seeds PCS/KG/G/M/CM/L/ML, all keyed by `abbr`).
  const pieceUnit = await prisma.unitOfMeasure.findFirst({
    where: { companyId: company.id, abbreviation: 'PCS' },
  });
  if (!pieceUnit) throw new Error('PCS unit not found — run seed.ts first');

  // ── Sample Products ───────────────────────────────────────────────────────
  const sampleProducts = [
    { sku: 'DEMO-WATER-500',  name: 'مياه معدنية 500 مل',     price: 500,   cost: 300 },
    { sku: 'DEMO-BREAD-1KG',  name: 'خبز عربي 1 كجم',          price: 1000,  cost: 600 },
    { sku: 'DEMO-TEA-100G',   name: 'شاي أحمر 100 جم',          price: 2500,  cost: 1500 },
    { sku: 'DEMO-RICE-5KG',   name: 'أرز بسمتي 5 كجم',          price: 12000, cost: 8000 },
    { sku: 'DEMO-OIL-1L',     name: 'زيت دوار الشمس 1 لتر',    price: 3500,  cost: 2200 },
  ];

  let productCount = 0;
  for (const p of sampleProducts) {
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
        categoryId: generalCategory.id,
        type: ProductType.storable,
        baseUnitId: pieceUnit.id,
        saleUnitId: pieceUnit.id,
        purchaseUnitId: pieceUnit.id,
        defaultSalePriceIqd: p.price,
        defaultPurchasePriceIqd: p.cost,
        minSalePriceIqd: Math.floor(p.price * 0.8),
        isActive: true,
        tags: ['demo'],
        createdBy: 'demo-seed',
        updatedBy: 'demo-seed',
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
        createdBy: 'demo-seed',
        updatedBy: 'demo-seed',
      },
    });
    productCount++;
  }
  console.log(`✅ products: ${productCount} created/upserted`);

  // ── Sample Customers ──────────────────────────────────────────────────────
  const sampleCustomers = [
    { code: 'CUST-001', nameAr: 'محمد أحمد',     phone: '07700111222', creditLimit: 0      },
    { code: 'CUST-002', nameAr: 'فاطمة علي',      phone: '07700333444', creditLimit: 500000 },
    { code: 'CUST-003', nameAr: 'متجر النور',     phone: '07700555666', creditLimit: 2000000 },
  ];
  for (const c of sampleCustomers) {
    await prisma.customer.upsert({
      where: { companyId_code: { companyId: company.id, code: c.code } },
      update: {},
      create: {
        companyId: company.id,
        code: c.code,
        nameAr: c.nameAr,
        phone: c.phone,
        type: c.creditLimit > 0 ? 'wholesale' : 'regular',
        creditLimitIqd: c.creditLimit,
        creditBalanceIqd: 0,
        isActive: true,
        createdBy: 'demo-seed',
        updatedBy: 'demo-seed',
      },
    });
  }
  console.log(`✅ customers: ${sampleCustomers.length}`);

  // ── Sample Suppliers ──────────────────────────────────────────────────────
  const sampleSuppliers = [
    { code: 'SUP-001', nameAr: 'الموزع العام',  phone: '07901111111' },
    { code: 'SUP-002', nameAr: 'مخازن البصرة',  phone: '07902222222' },
  ];
  for (const s of sampleSuppliers) {
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
        // Supplier schema requires createdBy/updatedBy (Char(26)). Same audit
        // marker as customers/products so the seed can re-run idempotently.
        createdBy: 'demo-seed',
        updatedBy: 'demo-seed',
      },
    });
  }
  console.log(`✅ suppliers: ${sampleSuppliers.length}`);

  // ── Final report ──────────────────────────────────────────────────────────
  const counts = {
    products:  await prisma.productTemplate.count({ where: { companyId: company.id } }),
    variants:  await prisma.productVariant.count({ where: { companyId: company.id } }),
    customers: await prisma.customer.count({ where: { companyId: company.id } }),
    suppliers: await prisma.supplier.count({ where: { companyId: company.id } }),
  };
  console.log('🎉 Demo seed complete:', counts);
}

main()
  .catch((e) => { console.error('❌ Demo seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
