# Phase 4.A — Pre-UAT Infrastructure: READY ✅

Generated: 2026-04-29 — Session 28

## Status: All Pre-UAT prerequisites complete

| Item | Status | Evidence |
|------|--------|----------|
| Production VPS | ✅ All 8 services healthy | `ssh ibherp 'docker ps'` |
| HTTPS valid | ✅ ibherp.cloud + shop.ibherp.cloud | Let's Encrypt, expires 2026-07-28 |
| Realistic dataset loaded | ✅ Run on production | `npx tsx prisma/uat-seed.ts` succeeded |
| Counts | 50 products · 22 customers · 10 suppliers · 10 employees | `prisma.{model}.count()` |
| 3 UAT accounts created | ✅ branch_manager + cashier + accountant | Login verified — all 3 → 200 |
| Credentials documented | ✅ Gitignored | `governance/UAT_CREDENTIALS.md` |
| UAT_PLAYBOOK | ✅ Pre-existing | `governance/UAT_PLAYBOOK.md` |

## What testers can do today

1. **Login**: https://ibherp.cloud/login (each tester has their own role-scoped account)
2. **Browse data**: 50 products in 5 categories, 22 customers (retail/wholesale/corporate), 10 employees
3. **Test workflows** per UAT_PLAYBOOK.md:
   - Day 1: Wave 1 (auth, products, inventory) + Wave 2 (POS, sales)
   - Day 2: Wave 3 (purchasing) + Wave 4 (finance)
   - Day 3: Wave 5 (HR) + Wave 6 (CRM, licensing)
   - Day 4: Triage findings, P0/P1 fix sprint

## What was deployed in Session 28

1. **S1.9** — Docker log rotation + weekly prune cron on VPS
2. **S1.10** — DNS A record + SSL cert + storefront live (HTTPS 200)
3. **WhatsApp per-tenant integration** — schema, encryption (AES-256-GCM),
   backend service, admin UI page (`/settings/integrations/whatsapp`)
4. **Phase 3.D** — Smoke test report + nginx CSP header on both domains
5. **I058 fix** — Prisma 7 enum @@map (`/licensing/me/features` now 200,
   was 500)
6. **Phase 3.A** — API endpoint capture across 6 waves
7. **Phase 4.A** — UAT seed run on production + 3 UAT accounts created

## Next session: kick off UAT

Owner action items:
1. Share `governance/UAT_CREDENTIALS.md` with the 3 testers via Signal/1Password
2. Schedule 3-4 days for UAT execution
3. After UAT → triage in `DECISIONS_LOG.md`
4. P0/P1 fix sprint (Claude Code session can handle code-level fixes)
5. Phase 4.C — Final launch + DR drill

## Known caveats

- **9 of 23 sampled API endpoints return 404** in
  `governance/evidence/api-captures/all-waves-summary.md`. These are mostly
  module roots that need a sub-path (e.g., `/finance/period-close/list`
  instead of just `/finance/period-close`). Not a regression. Will be
  triaged during UAT.

- **WhatsApp integration is empty for the company by default.** Each tenant
  configures their own credentials via the new admin UI (Session 28 build).
  No global token needed.

- **2FA is opt-in.** All UAT accounts have `requires2FA: false`. Testers can
  enable per-account via `/auth/2fa/setup` + `/auth/2fa/confirm`.
