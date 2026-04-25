/**
 * Minimal bootstrap seed — creates just enough to log in.
 * The full Iraqi CoA / roles / policies seed lives in seed.ts and will be
 * cleaned up separately. Run with:
 *   tsx prisma/seed-bootstrap.ts
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { ulid } from 'ulid';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Bootstrap seed: company + admin user');

  const company = await prisma.company.upsert({
    where: { code: 'RUA' },
    update: {},
    create: {
      code:      'RUA',
      nameAr:    'الرؤية العربية للتجارة',
      nameEn:    'Al-Ruya Al-Arabiya Trading',
      plan:      'enterprise',
      isActive:  true,
      createdBy: 'seed',
      updatedBy: 'seed',
    },
  });
  console.log(`  ✓ Company: ${company.code} (${company.id})`);

  const branch = await prisma.branch.upsert({
    where: { companyId_code: { companyId: company.id, code: 'BGD' } },
    update: {},
    create: {
      companyId:   company.id,
      code:        'BGD',
      nameAr:      'فرع بغداد الرئيسي',
      nameEn:      'Baghdad Main Branch',
      isMainBranch:true,
      isActive:    true,
      createdBy:   'seed',
      updatedBy:   'seed',
    },
  });
  console.log(`  ✓ Branch: ${branch.code} (${branch.id})`);

  const passwordHash = await argon2.hash('admin123');
  const adminEmail = 'admin@al-ruya.iq';
  const admin = await prisma.user.upsert({
    where: { companyId_email: { companyId: company.id, email: adminEmail } },
    update: {},
    create: {
      companyId:    company.id,
      branchId:     branch.id,
      email:        adminEmail,
      passwordHash,
      nameAr:       'المدير العام',
      nameEn:       'System Admin',
      status:       'active',
      createdBy:    'seed',
      updatedBy:    'seed',
    },
  });
  console.log(`  ✓ Admin: ${admin.email} (password: admin123)`);

  console.log('\n✅ Bootstrap seed complete.');
  console.log('   Login at: https://ibherp.cloud/login');
  console.log('   Email:    admin@al-ruya.iq');
  console.log('   Password: admin123  (CHANGE THIS IMMEDIATELY)');
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
