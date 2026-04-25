/**
 * Bootstrap seed — minimal but production-grade:
 *   1. Default company + branch
 *   2. The PERMANENT system owner (singleton, isSystemOwner=true)
 *   3. (Optional) Test admin user — only if ADMIN_EMAIL+ADMIN_PASSWORD env set
 *
 * The system owner is a singleton (only one user has isSystemOwner=true).
 * Idempotent — re-running this seed updates the password if it changed
 * but never deletes or recreates the owner.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Owner credentials must come from environment — NEVER hardcoded.
// Set these on the VPS in /opt/al-ruya-erp/infra/.env (chmod 600).
const OWNER_USERNAME = process.env.OWNER_USERNAME;
const OWNER_PASSWORD = process.env.OWNER_PASSWORD;
const OWNER_EMAIL    = process.env.OWNER_EMAIL ?? `${OWNER_USERNAME}@al-ruya.iq`;

// Test admin is OPTIONAL — only created if both env vars are set explicitly.
// Never use default credentials.
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!OWNER_USERNAME || !OWNER_PASSWORD) {
  console.error(
    '❌ OWNER_USERNAME and OWNER_PASSWORD environment variables are required.\n' +
    '   Set them in infra/.env (chmod 600) before running seed.'
  );
  process.exit(1);
}

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

  // ─── System Owner — PERMANENT (singleton) ────────────────────────────
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

  // ─── Test admin (only if both env vars set — no default credentials) ──
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    const adminHash = await argon2.hash(ADMIN_PASSWORD, {
      type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4,
    });
    await prisma.user.upsert({
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
    console.log(`  ✓ Admin: ${ADMIN_EMAIL}`);
  } else {
    console.log('  ℹ Skipping admin user (ADMIN_EMAIL/ADMIN_PASSWORD not set)');
  }

  console.log('\n✅ Bootstrap seed complete');
  console.log('   • Owner account configured (credentials in env only — never logged)');
  console.log('   • Login at: https://ibherp.cloud/login');
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
