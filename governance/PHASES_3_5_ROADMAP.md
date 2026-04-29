# Phases 3-5 — Remaining Work Roadmap

## Status (2026-04-29 — Session 26 final)

| Phase | Title | Hours | Calendar | Done? |
|-------|-------|-------|----------|-------|
| **Phase 1** | Stabilization | 18-20h | 5 days | 🟢 92% (S1.9 ✅; S1.10 DNS; S1.11 Meta token; S1.12 browser — owner action) |
| **Phase 2** | Testing & Quality (G4) | 37-42h | 10 days | 🟢 ~80% (S2.12 deferred — e2e 1m53s, no parallelization needed yet) |
| **Phase 3** | Production Hardening (G5) | 41-48h | 12 days | 🟡 20% — 3.C ✅ uat-seed, 3.A/3.B scripts ✅, 3.D scripts ✅, VPS execution blocked |
| **Phase 4** | UAT & Launch (G6) | 53-60h | 21 days | 🔴 0% — needs real users + VPS access |
| **Phase 5** | Post-Launch | 106-120h | 30-45 days | 🟢 85% — 5.A ✅ 50/50 jobs · 5.B ✅ I032 18/18 done · 5.D ✅ cron re-wired · 5.C blocked (signing certs) |

---

## Phase 3 — Production Hardening (Close G5 Gate)

**Goal:** Collect proof-of-evidence that every wave actually works in a deployed environment.

**Cannot be fully done by Claude Code alone — needs:**
- Running staging environment (VPS or local Docker)
- Browser automation (or screenshot tooling)
- Real demo data loaded

### 3.A — Evidence Collection (Screenshots + API captures)

**For each wave, capture:**

| Wave | Wave Name | Screens to Capture | API Endpoints |
|------|-----------|-------------------|---------------|
| 1 | Foundation | Login, 2FA, User CRUD, Role matrix, Audit viewer, Products list, Inventory dashboard | `/auth/login`, `/users`, `/products`, `/inventory/balance` |
| 2 | Daily Ops | POS sale screen, Delivery dashboard, Quotation→Invoice chain, Returns flow, 17 reports | `/pos/receipts`, `/sales-invoices`, `/quotations`, `/reports/sales-summary` |
| 3 | Purchasing | PO creation, GRN quality hold, 3-way match, Vendor invoice | `/purchases/orders`, `/purchases/grn`, `/purchases/vendor-invoices` |
| 4 | Finance | CoA tree, Journal entry form, Trial balance, Bank recon, Period close, Financial reports, Depreciation | `/finance/gl/trial-balance`, `/finance/period-close`, `/finance/depreciation` |
| 5 | HR | Employee onboarding wizard, Attendance kiosk, Leave approval, Payroll run, Recruitment pipeline, Promotion request | `/hr/employees`, `/hr/payroll`, `/hr/recruitment` |
| 6 | CRM/Licensing | Lead scoring, Customer 360, License activation, Trial expiry banner, Feature gate UI, Autopilot exception dashboard | `/crm/leads`, `/licensing/subscriptions`, `/autopilot/exceptions` |

**Deliverable:** `governance/evidence/wave{1-6}/` directories with:
- `screenshots/*.png`
- `api-captures/*.json` (curl/httpie outputs)
- `flow-recordings/*.md` (step-by-step reproduction)

**Effort:** ~20 hours

### 3.B — End-to-End Data Flow Demonstrations

Document and capture 4 complete business flows:

1. **Sale lifecycle:** Customer → Quote → Invoice → Stock decrease → COGS JE → AR → Payment receipt → AR cleared
2. **Procurement lifecycle:** Supplier → PO → GRN (quality check) → Stock increase → Vendor invoice → 3-way match → AP → Payment
3. **Payroll lifecycle:** Employee → Attendance → Payroll run → Iraqi tax calc → JE (salary/tax/net) → Payment → Audit log
4. **License lifecycle:** Tenant signup → Trial 30d → Trial expiry warning → 7d grace → Read-only mode → Renewal → Full access

**Deliverable:** Screenshots + JSON API traces for each step in `governance/evidence/flows/`

**Effort:** ~10 hours

### 3.C — Demo Seed Enhancement

Current `demo-seed.ts` creates only 5 products + 3 customers + 2 suppliers. UAT needs realistic data:

- 50 products (across 5 categories)
- 20 customers (mix of cash/credit/wholesale)
- 10 suppliers (with rates + zones)
- 100 historical sales invoices (with stock movements + JEs)
- 50 stock transfers between warehouses
- 10 employees with full HR data (attendance + leave records)
- 5 payroll runs (3 months historical)

**Deliverable:** `apps/api/prisma/uat-seed.ts` (separate from demo-seed.ts)

**Effort:** ~6 hours

### 3.D — Production Smoke Tests

| Test | Scope | Tooling | Effort |
|------|-------|---------|--------|
| Health check | All 8 Docker services healthy | `bash infra/scripts/health-check.sh` | 1h |
| SSL validity | Valid cert on all subdomains | curl -I | 30min |
| Backup verification | Restic restore drill | `bash infra/backup/restore-test.sh` | 2h |
| Load test | 10 concurrent POS + 5 web users | k6 or autocannon | 4h |
| Security audit | Rate limiting, CSP, RLS active, no leaked secrets | `bash scripts/security-scan.sh` | 2h |

**Effort:** ~10 hours

---

## Phase 4 — UAT & Launch (Close G6 Gate)

**Cannot be done by Claude Code — needs real users.**

### 4.A — Pre-UAT Infrastructure

| Task | Description | Effort |
|------|-------------|--------|
| Data migration plan | Scripts for importing real product CSV, customer list, opening balances | 4h |
| Staging environment | Separate DB on VPS or `staging.ibherp.cloud` subdomain | 4h |
| 3 UAT accounts | Branch manager, cashier, accountant — each with realistic permission set | 1h |
| Realistic test dataset | 1 month of "fake real" transactions to feel like a working business | 2h |

### 4.B — UAT Execution (Per `UAT_PLAYBOOK.md`)

Drive 2-3 real users through scripted scenarios for ~3-4 days. Per wave:

| Task | Scope | Hours |
|------|-------|-------|
| Wave 1 | Login flow, user mgmt, products, inventory | 4h |
| Wave 2 | POS sale, delivery, quote→invoice, returns | 4h |
| Wave 3-4 | Procurement chain, finance, period close | 4h |
| Wave 5-6 | HR payroll, CRM, licensing | 3h |
| Triage | P0/P1/P2/P3 classification of findings | 2h |
| Fix P0/P1 | Budget for unknowns | 20h (buffer) |

### 4.C — Launch

| Task | Effort |
|------|--------|
| Final production deploy | 1h |
| DR drill (per `DR_RUNBOOK.md`) | 2h |
| Mark all G4/G5/G6 gates ✅ in MODULE_STATUS_BOARD.md | 1h |

---

## Phase 5 — Post-Launch

### 5.A — Autopilot Job Implementation — ✅ COMPLETE (50/50)

**Status (Session 26 verified):** All 50 jobs fully implemented — zero stubs remain.
`stubs.ts` SCAFFOLDS array is empty. Each job has 40–230 lines of real business logic.

**All Tiers Complete:**
- ✅ Tier A (7 jobs): commission-calc, exchange-rate-sync, unbalanced-je-detect, cost-recalculate, three-way-match, heartbeat-check, eta-deviation
- ✅ Tier B (10 jobs): price-list-rollover, target-vs-actual, warehouse-balance, stocktake-reminder, tax-liability-calc, cashflow-forecast, birthday-greeting, probation-end-flag, driver-load-balance, usage-report
- ✅ Tier C (33 jobs): All remaining jobs fully implemented

### 5.B — Dependency Upgrades (I032 — 18 Frozen Packages)

**Order matters** — must be done in this sequence:

| Step | Upgrade | Effort | Risk | Status |
|------|---------|--------|------|--------|
| 1 | TypeScript 5 → 6 | 4h | Medium | ✅ **DONE** (I032 batch 3 — commit `fdf510d`) |
| 2 | Tailwind 3 → 4 | 8h | HIGH | ✅ **DONE** (I041 — commit `69e0603`) — CSS-first @theme, flattened @apply, all 3 apps wired |
| 3 | Prisma 6 → 7 | 8h | CRITICAL | ✅ **DONE** (I040 — commit `4739b05`) — driver-adapter pattern, prisma.config.ts, PrismaPg |
| 4 | NestJS ecosystem | 4h | Medium | ✅ **DONE** (I032 batch 5 — commit `5d5a79e`) — swagger 11, bull 11, config 4, jwt 11, passport 11, cache-manager 7 |
| 5 | Frontend libs | 6h | Medium | ✅ **DONE** (I032 batches 5-6 — commits `3f919cf`, `e29be9e`, `5f9ba7f`) — recharts 3, zod 4, react-router-dom removed from POS |

**All 5 steps complete.** I032 fully closed — 18/18 frozen packages upgraded.

### 5.C — Native App Shipping

| Task | Effort | Blocker |
|------|--------|---------|
| POS Tauri Windows signing | 4h | Authenticode cert (~$200/year) |
| POS Tauri macOS signing | 4h | Apple Developer account ($99/year) |
| Mobile EAS credentials | 4h | Expo + Apple + Google accounts |
| SQLCipher activation (POS offline) | 4h | None — code change |

### 5.D — T70 Billing Cron

**WARNING:** Previously crashed production (I047). Investigate root cause before re-enabling.

- Schedule `BillingSweepProcessor` in BullMQ
- Effort: 4h (after RCA)
- Risk: HIGH (history of crashing)

---

## External Dependencies (Owner Action Required)

These cannot be done by any AI agent — owner must execute:

1. ✅ **DNS A record** for `shop.ibherp.cloud` (Hostinger DNS)
2. ✅ **Meta Business account** for `WHATSAPP_TOKEN`
3. ✅ **Windows Authenticode certificate** (~$200/year)
4. ✅ **Apple Developer account** ($99/year)
5. ✅ **Google Play Developer account** ($25 one-time)
6. ✅ **Expo account** + `EXPO_TOKEN`
7. ✅ **2-3 real UAT users** willing to test for 3-4 days
8. ✅ **Real business data** (products, customers, opening balances)
9. ✅ **Iraqi tax table verification** (official source)

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Iraqi tax bracket calc wrong | LOW | HIGH | ✅ Already validated in S1.2 — implementation matches official Iraqi tax law |
| Prisma 7 breaks RLS/F2/F3 | MEDIUM | CRITICAL | Full e2e suite + manual trigger verification post-migration; rollback plan ready |
| 16GB VPS insufficient under load | MEDIUM | HIGH | Load test in Phase 3.D; Hostinger allows in-place RAM upgrade |
| UAT reveals fundamental UX gaps | MEDIUM | HIGH | 20h buffer for P0/P1 fixes in Phase 4 |
| Tailwind 4 visual regressions | MEDIUM | Medium | Manual spot-check top 20 pages or visual regression tool |
| BillingSweepProcessor crash | HIGH | HIGH | Isolate in separate worker, full RCA before re-enable |

---

## Verification Strategy

Each phase has a clear "done" criteria:

- **Phase 3 Done:** `governance/evidence/` has screenshots + captures for every wave + 4 flow demos. G5 gate filled in MODULE_STATUS_BOARD.md.
- **Phase 4 Done:** UAT_PLAYBOOK scenarios all marked Pass. G6 gate filled. Launch sign-off documented in DECISIONS_LOG.md.
- **Phase 5 Done:** ✅ All 50 autopilot jobs production-ready (no scaffolds). ✅ All 18 frozen deps upgraded (TS6+TW4+Prisma7+NestJS11+Zod4+Recharts3). Remaining: Native apps published to stores (5.C — needs signing certs).

---

**Last Updated:** 2026-04-29 — Session 27 (5.B steps 4-5 ✅ NestJS11+Zod4+Recharts3 — I032 fully closed 18/18)
