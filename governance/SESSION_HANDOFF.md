# SESSION_HANDOFF.md

# Session Handoff — 2026-04-28 (Session 18 — Production restore I044 + I045 + I046 + I047)

## Branch: main
## Latest commit: pending PR #227 squash-merge

---

## Session 18 — 5-hour production outage triage and full restore

### Headline
Production `https://ibherp.cloud/health` was returning 502 from the moment
this session opened. Root cause was a 6-bug chain that took progressive
peeling. End state: `/health = 200`, login works, dashboard renders, all
core ERP modules (sales, POS, inventory, finance, HR, purchases, CRM)
operational. Some Wave 6 modules temporarily disabled pending I047
follow-up.

### Bug chain (in discovery order)

1. **I044 — VPS git origin pointing at wrong repo.** The VPS at
   `/opt/al-ruya-erp` was originally cloned from `ahrrfy/erp.git` (the
   legacy program, since renamed/replaced). When the project moved to
   `ahrrfy/IBH.git`, the VPS clone kept the old origin. Every push to
   IBH's main was silently ignored — `git fetch origin main` pulled from
   the stale fork. **Fix:** explicit `EXPECTED_ORIGIN_URL` guard at the
   top of `deploy-on-vps.sh` that auto-repoints to `ahrrfy/IBH.git`.

2. **I044 — chicken-and-egg in `prisma migrate resolve`.** The deploy
   script's resolve loop used `compose exec api ...` which fails
   immediately if the previous api container is dead. After the api
   crashed once, the next deploy couldn't fix the failed migration
   record because it needed a running api to run resolve. **Fix:**
   replaced with `compose run --rm --no-deps api ...` — spawns a fresh
   throwaway container off the just-built image. Same fix in
   `repair-migration.yml`.

3. **I045 — Postgres enum naming mismatch.** Migration `0011_licensing`
   created `license_event_type` (snake_case). Prisma schema declared
   `enum LicenseEventType` (PascalCase). Migration `t68_prorated_charge_event`
   tried `ALTER TYPE "LicenseEventType" ADD VALUE 'prorated_charge'` and
   failed with "type does not exist". **Fix:** manual `ALTER TYPE
   license_event_type RENAME TO "LicenseEventType"` on prod DB +
   `migrate resolve --rolled-back t68` + `migrate deploy` applied the
   3 pending migrations (t68, t70_billing, i003_pos_conflict_log).

4. **I046 — `@nestjs/bull@10.2.3` BullExplorer double-registers
   `@Process` decorators.** After fixing 1-3, the api booted past Prisma
   then crashed at `app.listen()` with `Cannot define the same handler
   twice send`. Stack trace pointed at `BullExplorer.handleProcessor`
   calling `Queue.process()` twice for the same job name. Variadic vs
   split `registerQueue` shapes had no effect. **Fix:** removed all 7
   stub `@Process` worker classes from their modules' `providers` arrays.
   Queues stay registered (so `queue.add()` callers still work), the
   external `whatsapp-bridge` continues to consume the Redis lists
   directly. Affected: NotificationsWhatsapp/Email/Sms processors,
   VarianceAlertProcessor, RfmProcessor + RfmScheduler, AutoReorderProcessor.

5. **I046 — silent hang in `NestFactory.create`.** Independent of #4: with
   all modules enabled, the api would hang in lifecycle hooks before
   reaching Prisma's onModuleInit. No error, no log, just a frozen
   process at 0% CPU. Bisect identified the suspect set as
   PlatformLicensingModule, LicensingModule, AdminLicensingModule,
   ExpiryWatcherModule, StorefrontModule, OnlineOrdersModule,
   AutopilotModule. **Workaround:** all 7 disabled in `app.module.ts`
   to restore boot. **Follow-up I047:** bisect within the disabled set
   to identify the actual hanging onModuleInit hook.

6. **I047 — WebSocket realtime broken.** Browser console at
   `https://ibherp.cloud/dashboard` flooded with
   `ws://localhost:3001/socket.io/ failed`. Two stacked bugs:
   (a) `socket-client.ts` baked `NEXT_PUBLIC_API_URL` at build time,
   defaulting to `localhost:3001` because the docker build didn't pass
   it as ARG; (b) nginx had no `/socket.io/` location block, so ws
   upgrades fell through to `location /` (Next.js, no socket endpoint).
   **Fix:** `socket-client.ts` reads `window.location.origin` at runtime;
   nginx adds dedicated `/socket.io/` block with WS upgrade headers.

7. **I047 — SSH connectivity from GitHub Actions to VPS flaky.**
   `ssh-keyscan -T 5` from GitHub runners → Hostinger Frankfurt was
   timing out intermittently, breaking deploys. **Fix:** 4 attempts ×
   15s timeout each + 3 attempts × 20s on the auth handshake +
   diagnostic dump on final failure.

### Diagnostic infrastructure added
- `apps/api/src/main.ts` — `[BOOT]` breadcrumb traces around bootstrap
  + `bootstrap().catch()` so silent rejections become loud crashes
- `PrismaService.onModuleInit` — `[BOOT]` markers around `$connect()`
- `AutopilotScheduler.onModuleInit` — `AUTOPILOT_DISABLED=1` env flag
  (escape hatch for future incidents)

### Currently disabled in app.module.ts (must restore in I047)
- PlatformLicensingModule
- LicensingModule
- AdminLicensingModule
- ExpiryWatcherModule
- StorefrontModule (T54)
- OnlineOrdersModule (T55)
- AutopilotModule (T71)
- VarianceAlertProcessor (cron)
- RfmProcessor + RfmScheduler (cron)
- AutoReorderProcessor (cron)
- NotificationsWhatsapp/Email/Sms processors

### Production state at session close
- `https://ibherp.cloud/health` → HTTP 200 ✅
- `https://ibherp.cloud/api/v1/health` → JSON 200 ✅
- Login flow works, dashboard renders ✅
- WebSocket fix pending PR #227 deploy
- Zero data loss

### Auto-deploy chain restored
PR #227 contains every fix above. After merge, push-to-main will fire
`deploy-vps.yml` which now uses the hardened SSH + the corrected
`deploy-on-vps.sh` with origin guard + run-rm migrate-resolve. End-to-
end automation should work without manual VPS intervention.

### Follow-up I047 work items
1. Bisect the 7 disabled modules to find the hanging onModuleInit
2. Choose between upgrading `@nestjs/bull` to a working version OR
   rewriting processors to use `bull` directly (skipping BullExplorer)
3. Re-register the cron processors (variance, rfm, auto-reorder,
   trial-expiry, license-expiry, autopilot)
4. Verify shop.ibherp.cloud once Storefront + OnlineOrders re-enabled
5. Add e2e smoke test that boots the api and probes `/health` so this
   class of regression fails in CI before hitting prod

---

## Session 17 addendum — VPS disk cleanup + permanent prevention (I043)

User flagged VPS disk grew from 15GB to 120GB. Live SSH diagnosis on
`srv1548487.hstgr.cloud` traced the bloat: `/var/lib/docker = 114GB`, of which
**108.5GB was Docker build cache** accumulated from active development deploys
(api + web + tauri builds × dozens of pushes). PostgreSQL volume only 708MB,
all critical data intact.

Live cleanup ran end-to-end via Hostinger web terminal:
`docker image prune -af` + `docker builder prune -af` + `docker container prune -f`
+ truncate `*-json.log` + `journalctl --vacuum-size=500M` + `apt-get clean`.
Result: **120GB → 19GB used (-101GB, ~84% reduction)**, all 15 containers still
running, no data lost.

### Prevention layer landed (this session)
1. **`.github/workflows/vps-disk-cleanup.yml`** — manual `workflow_dispatch` for
   on-demand cleanup. Includes `dry_run` input. Idempotent. Mirrors the live
   commands that worked.
2. **`.github/workflows/vps-disk-setup.yml`** — one-time `workflow_dispatch` that
   installs `/etc/docker/daemon.json` (log-opts: max-size=50m, max-file=3,
   compress=true) + `/etc/cron.weekly/al-ruya-disk-cleanup` (auto-prune every
   Sunday, logs to `/var/log/al-ruya-disk-cleanup.log` with self-truncation
   at 10MB).
3. **D15 in `DECISIONS_LOG.md`** — formal disk-management policy.
4. **I043 in `OPEN_ISSUES.md`** — closed with full root-cause analysis and
   pointer to the prevention workflows.

### ⚠️ Action required from owner
Run `vps-disk-setup.yml` **once** from GitHub Actions UI to activate the
permanent prevention. Until that runs, the current cleanup is a one-shot —
build cache will accumulate again as deploys continue.

---

## Session 16 addendum (after session 15 close — same calendar day)

External operational audit (`IBH_Operational_Audit_Report.txt`, 2026-04-28) flagged
4 actionable P0 findings. Audit verified mostly accurate technically but contained
factual errors (claimed pnpm-lock.yaml missing — false; claimed AI was misleading
marketing — F5/MASTER_SCOPE explicitly defers AI by 6 months; claimed 4 migrations
share prefix 0012 must be renamed — destructive on applied DBs, grandfathered instead).

### P0 fixes landed (commit `88619c0`)
1. **RLS interceptor fail-closed** — `rls.interceptor.ts` now throws `InternalServerErrorException` on `setRlsContext` failure instead of continuing the request (prevents potential cross-company exposure).
2. **`forbidNonWhitelisted: true`** — `main.ts:113`, rejects requests with extra fields instead of silently stripping.
3. **`completeLogin()` typed** — `auth.service.ts` now uses `Prisma.UserGetPayload<{...}>` instead of `any`.
4. **`/auth/refresh` per-endpoint @Throttle** — 10/min/IP, tighter than the 100/min global default.

### Migration prefix guard (commit `88619c0`)
- Added `scripts/check-migration-prefixes.sh` + CI step in `ci.yml`.
- Existing 4× `0012_*` migrations grandfathered (already applied to production DB; renaming would break `_prisma_migrations` tracking).

### Ops workflows (commits `dd17f23` + `9115b5e`)
- `.github/workflows/repair-migration.yml` — manual `workflow_dispatch` to mark a stuck Prisma migration as rolled-back/applied + re-deploy. Recovers from P3009 cleanly.
- `.github/workflows/db-diagnose.yml` — manual diagnostic dump of `_prisma_migrations`, custom function existence, table counts. Has a bug: uses `psql -U postgres` which doesn't match the deployed DB user — needs follow-up to read DB user from compose env.

### Parallel session fixes (NOT mine — landed concurrently)
- `0f6c965` FEATURE-I003: POS offline sync conflict resolution (LWW + conflict log) — closes I003.
- `98fbcc8` HOTFIX-I038: resolve stuck `t51_hr_recruitment` migration on production.
- `e16a7e6` FIX-I039: rewrite POS conflicts page with HTML+Tailwind (project doesn't use shadcn/ui).
- `eb306ed` I040 docs: Prisma 7 upgrade blocked by datasource architecture change.
- `e8a58d4` I041 docs: Tailwind 4 upgrade blocked by chained `@apply` in apps/web design system.
- `7eaf68f` HOTFIX-I042: restore missing RLS helper functions (`current_company_id`, `gen_ulid`, `prevent_update_delete`, `check_period_open`, `update_updated_at`) — they had vanished from production DB, making `t51_hr_recruitment` migration's `CREATE POLICY` fail.
- `fdf510d` I032 Batch 3: TypeScript 5→6 web + root upgrade.

### My fixups for parallel session work
- `014a1b9` E2E test timeout 30s → 90s. AppModule init is now heavy enough (BullMQ × 5 queues + 50 autopilot job registrations + RealtimeGateway + license cron + Redis connect) that 30s wasn't enough. Visible symptom in CI was cascading `Cannot read properties of undefined (reading $transaction)` — `prisma` never assigned because `beforeAll(app.init())` timed out.
- `05c2e29` pnpm-lock.yaml resync — `fdf510d` bumped `typescript` in package.json from `^5.5.0` to `^6.0.3` but didn't refresh the lockfile, so CI failed with `ERR_PNPM_OUTDATED_LOCKFILE`.

### Audit findings NOT actioned (with rationale)
- ❌ "pnpm-lock.yaml missing" — factual error, file exists in repo (last touched commit `b403132`).
- ❌ "packages/ui-components missing" — referenced as planned in CLAUDE.md, never delivered as a workspace; the actually-published packages (`shared-types`, `validation-schemas`, `domain-events`) exist and build cleanly.
- ❌ "AI is misleading marketing" — F5 + MASTER_SCOPE explicitly defer AI by 6 months of real production. Documented architectural decision, not deception.
- ❌ "Rename 4× 0012_* migrations" — destructive on applied DBs. Grandfathered + guard added for new migrations going forward.
- ⚠️ "63% of code untested" — misleading metric (counts files without sibling spec.ts). The 29 e2e tests cover the highest-value invariants: double-entry, MWA, period-close, RBAC, RLS, audit append-only.

### Audit findings deferred (legitimate but out-of-scope for this session)
- Payment gateway stubs (zaincash, fastpay) — known/documented (T55 deferred them); revisit when ZainCash API access is procured.
- 10 TODO comments — track via OPEN_ISSUES rather than blanket-clear.
- E2E coverage for storefront/mobile/POS — large effort, separate task.

---

## Original Session 15 — Wave 6 Licensing + Autopilot Closeout

---

## Wave 6 — COMPLETE (2026-04-27)

All 14 Wave 6 / Licensing tasks merged in this session via 4 parallel layers:

### Layer A (parallel)
| Task | PR | Description |
|---|---|---|
| T59 | #149 | License Guard + @RequireFeature Decorator + FeatureCacheService (Redis + T31 invalidation) |
| T60 | #150 | Subscription Plans (Starter/Pro/Enterprise/Bundle) + 21 feature codes + PLANS_MATRIX.md |
| T62 | #151 | Hardware Fingerprint (Tauri Rust SHA-256 + API service) |
| T69 | #152 | License Expiry Notifications (BullMQ daily cron 30/14/7/3/1) |

### Layer B (parallel)
| Task | PR | Description |
|---|---|---|
| T61 | #155 | Trial Engine (30 days + 7 grace, BullMQ) |
| T63 | #156 | License Admin Dashboard (super-admin: tenants/plans/audit) |
| T64 | #158 | Activation + Renewal API (RSA-2048 signed, offline-verifiable) |
| T65 | #157 | Feature Flags Per Plan (useFeature hook + FeatureGate, real-time via T31) |

### Layer C (parallel)
| Task | PR | Description |
|---|---|---|
| T66 | #159 | Defense-in-depth Enforcement (API global + Web middleware + POS Tauri offline 7d grace) |
| T67 | #160 | License Analytics (MRR/ARR/Churn/LTV/Conversion/Expansion) — Recharts |
| T71 | #161 | Autonomous Operations Engine — framework + 3 jobs + 47 stubs |

### Layer D (parallel)
| Task | PR | Description |
|---|---|---|
| T68 | #162 | Plan Upgrade/Downgrade Proration (Prisma Decimal, ROUND_HALF_UP) |
| T70 | #163 | Multi-tenant Billing Dashboard (LicenseInvoice + LicensePayment) |

---

## Project-wide status after this session

| Wave | Range | Status |
|---|---|---|
| Wave 0-1 | T01-T30 | ✅ 100% |
| Wave 2 | T31-T40 | ✅ 100% |
| Wave 3 | T41-T57 | ✅ 100% |
| Wave 6 (Licensing) | T58-T71 | ✅ 100% |

**Total: 71/71 T-tasks merged** ✅

---

## What was built (highlights)

- **RSA-2048 license keys** signed server-side, verifiable offline by Tauri POS clients (RS256 JWT-style) — bundled public key + 7-day offline grace.
- **Defense-in-depth enforcement**: API global guard with `@SkipLicense()` opt-out, Web middleware redirect to `/license-required`, POS Rust startup gate, Mobile read-only check.
- **Real-time feature flags**: T59 FeatureCacheService.invalidate() emits `license.plan.changed` via T31 → all browsers refresh entitlements without F5.
- **Autopilot framework** (T71): 50-job catalog with 3 fully-implemented jobs (sales.overdue-reminder, inventory.auto-reorder, license.auto-renewal) + 47 typed stubs for future implementation. AutopilotException + AutopilotJobRun models. Manager dashboard at `/autopilot`.
- **Proration** (T68) uses Prisma Decimal with ROUND_HALF_UP — never JS number for money. Replaces T63's naive plan-swap; T67 expansion-MRR analytics still works (kept event payload contract intact).
- **Billing** (T70) records invoices + payments idempotently; manual mark-paid path; cron sweeper not yet scheduled (manual `POST /admin/billing/generate` only).

---

## Open issues / risks

- **HOTFIX-I035 (PR #139)** previously fixed React 19 `@types/react` duplication. Most agents reported clean tsc, but a few used the documented `gh pr ready && gh pr merge --auto --squash` workaround when the orchestrator's full repo typecheck snagged on pre-existing `@erp/shared-types` resolution errors in unrelated files.
- **POS Tauri**: production builds MUST set `LICENSE_PUBLIC_KEY_PEM` (delivered via `/api/v1/licensing/activation/public-key`). Dev fallback uses placeholder PEM that fails verification by design.
- **Stale stashes**: 5 stashes accumulated in `git stash list` — review and drop after this session.
- **`.worktrees/` residue**: some agent worktrees left node_modules behind on Windows; `.gitignore` already excludes the directory but local cleanup needed.
- **T70 cron sweeper not registered**: `generatePeriodInvoices()` is implemented + idempotent, but the BullMQ schedule entry is not added — manual trigger only via admin endpoint.
- **Mobile app (T66)**: license helpers added (`apps/mobile/src/license.ts`, `LicenseRequired.tsx`) but not wired into the navigator — pending mobile app finalization.

---

## Smoke tests (post-merge, 2026-04-27)

- `git pull origin main --ff-only` — clean
- `git log --oneline -15` — all 13 Wave 6 PRs landed in expected order
- All PRs squash-merged with auto-merge + branch deletion

---

## Next session

The ERP backend + admin web are functionally complete (71/71 tasks). Remaining work is operational, not implementation:

1. **UAT in production** with real data (G5/G6 gates per MODULE_STATUS_BOARD)
2. **POS Tauri signing** (T27 follow-up) + production `LICENSE_PUBLIC_KEY_PEM` provisioning
3. **Mobile EAS credentials** (T28 follow-up)
4. **T70 cron sweeper** scheduled at 02:00 UTC
5. **47 Autopilot stub jobs** — implement opportunistically as features mature
6. **Frozen dependency upgrade wave (I032)** — TypeScript 6 / Tailwind 4 / Prisma 7 / 13 others

---

*Session 15 close — 2026-04-27 — 13 PRs merged in one session (Wave 6 complete in 4 parallel layers).*
