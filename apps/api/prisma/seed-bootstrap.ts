/**
 * Bootstrap seed — minimal but production-grade:
 *   1. Default company + branch
 *   2. The PERMANENT system owner: ahrrfy
 *   3. A regular admin@al-ruya.iq for testing
 *
 * The system owner is a singleton (only one user has isSystemOwner=true).
 * Idempotent — re-running this seed updates the password if it changed
 * but never deletes or recreates the owner.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const OWNER_USERNAME = 'ahrrfy';
const OWNER_PASSWORD = 'ahrrfy6399137@';
const OWNER_EMAIL    = 'ahrrfy@al-ruya.iq';

const ADMIN_EMAIL    = 'admin@al-ruya.iq';
const ADMIN_PASSWORD = 'admin123';

async function main() {
  console.log('🌱 Bootstrap seed (idempotent)');

  // ─── Company ──────────────────────────────────────────────────────────
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
  console.log(`  ✓ Company: ${company.code}`);

  // ─── Branch ──────────────────────────────────────────────────────────
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
  console.log(`  ✓ Branch: ${branch.code}`);

  // ─── System Owner (ahrrfy) — PERMANENT ───────────────────────────────
  // Find by username (globally unique). If exists, update password only.
  // If NOT exists, ensure no other user has isSystemOwner=true (singleton),
  // then create.
  const ownerHash = await argon2.hash(OWNER_PASSWORD, {
    type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4,
  });

  const existingOwner = await prisma.user.findUnique({
    where: { username: OWNER_USERNAME },
  });

  let owner;
  if (existingOwner) {
    owner = await prisma.user.update({
      where: { id: existingOwner.id },
      data: {
        passwordHash:  ownerHash,
        isSystemOwner: true,
        mfaEnforced:   true,
        status:        'active',
        nameAr:        existingOwner.nameAr ?? 'مالك النظام',
        nameEn:        existingOwner.nameEn ?? 'System Owner',
      },
    });
    console.log(`  ✓ Owner password rotated: ${owner.username}`);
  } else {
    // Ensure singleton: no other user can claim isSystemOwner
    const conflict = await prisma.user.findFirst({ where: { isSystemOwner: true } });
    if (conflict) {
      throw new Error(`Another user already has isSystemOwner=true (id=${conflict.id}). Aborting.`);
    }
    owner = await prisma.user.create({
      data: {
        companyId:     company.id,
        branchId:      branch.id,
        username:      OWNER_USERNAME,
        email:         OWNER_EMAIL,
        passwordHash:  ownerHash,
        nameAr:        'مالك النظام',
        nameEn:        'System Owner',
        isSystemOwner: true,
        mfaEnforced:   true,        // policy: owner MUST enable 2FA
        status:        'active',
        locale:        'ar',
        createdBy:     'seed',
        updatedBy:     'seed',
      },
    });
    console.log(`  ✓ Owner created: ${owner.username}`);
  }

  // ─── Test admin (no system owner privilege) ───────────────────────────
  const adminHash = await argon2.hash(ADMIN_PASSWORD);
  const admin = await prisma.user.upsert({
    where: { companyId_email: { companyId: company.id, email: ADMIN_EMAIL } },
    update: { passwordHash: adminHash },
    create: {
      companyId:    company.id,
      branchId:     branch.id,
      email:        ADMIN_EMAIL,
      passwordHash: adminHash,
      nameAr:       'المدير العام',
      nameEn:       'System Admin',
      status:       'active',
      createdBy:    'seed',
      updatedBy:    'seed',
    },
  });

  console.log('\n✅ Bootstrap seed complete\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' 🔐 OWNER (permanent — cannot be deleted)');
  console.log(`    Username:  ${OWNER_USERNAME}`);
  console.log(`    Password:  ${OWNER_PASSWORD}`);
  console.log(`    2FA:       ENFORCED — set up Google Authenticator on first login`);
  console.log('');
  console.log(' 👤 ADMIN (regular)');
  console.log(`    Email:     ${ADMIN_EMAIL}`);
  console.log(`    Password:  ${ADMIN_PASSWORD}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' Login at: https://ibherp.cloud/login');
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
