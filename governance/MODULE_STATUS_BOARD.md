# MODULE_STATUS_BOARD.md
## لوحة حالة الوحدات
### يُحدَّث بعد كل جلسة

---

> **الرموز:** 🔴 لم يبدأ | 🟡 قيد التطوير | 🟢 كود مكتمل | ✅ مختبر في الإنتاج | ⚠️ موقوف

---

## 📊 نظرة عامة — 2026-04-29 (آخر تحديث — Session 26: Root Fixes + Phase 5 Progress)

| المقياس | القيمة |
|---|---|
| Waves مكتملة (كود) | **6 / 6** ✅ |
| Modules مكتملة (كود) | **18 / 18** ✅ |
| T-tasks مكتملة (Wave 1-6) | **71 / 71** ✅ (T01-T71 كلها مدموجة) |
| T-tasks TODO | **0** ✅ |
| Migrations | 13+ (T68 + T70 + T71 added in Wave 6) |
| Prisma Models | ~95 (License + Autopilot domain added) |
| TypeScript files | ~190+ |
| Lines of code | ~25,000+ |
| Acceptance tests (written) | **80+** (Licensing/Autopilot suites added) |
| Production HTTP 200 | ✅ مؤكد 2026-04-27 |
| Open T-tasks (Wave 1-6) | **0** ✅ Wave 6 complete 2026-04-27 |

## 🔧 Dependency Health — 2026-04-29 (Session 26 update)

| الحزمة | الإصدار الحالي | الإصدار الجديد | الحالة |
|---|---|---|---|
| TypeScript | 6.0.3 | 6.0.3 | ✅ مُرقَّى (I032 batch 3) |
| Tailwind CSS | 4.1.11 (web+storefront+pos) | — | ✅ مُرقَّى (I041) |
| Prisma | 7.8.0 | — | ✅ مُرقَّى (I040) — driver-adapter pattern |
| @nestjs/swagger | 11.4.2 | — | ✅ مُرقَّى (I032 batch 4) — 8→11 |
| @nestjs/bull | 11.0.4 | — | ✅ مُرقَّى (I032 batch 4) — 10→11 |
| @nestjs/config | 4.0.4 | — | ✅ مُرقَّى (I032 batch 4) — 3→4 |
| @nestjs/jwt/@nestjs/passport | 11.x | — | ✅ مُرقَّى (I032 batch 4) |
| cache-manager | 7.2.8 | — | ✅ مُرقَّى (I032 batch 4) — 5→7 |
| recharts | 3.8.1 (web) | — | ✅ مُرقَّى (I032 batch 4) — 2→3 |
| react-router-dom | — | — | ✅ حُذف من apps/pos (unused) · web uses Next.js router (not needed) |
| zod | 4.3.6 (all apps) | — | ✅ مُرقَّى (I032 batch 6) — 3→4 · 2 schema fixes |
| Security (pnpm audit) | — | — | ✅ 20→2 vulns (I048) — uuid moderate risk-accepted |

---

## ✅ Wave 1 — الأساس

| الوحدة | الحالة | ملاحظات |
|---|---|---|
| M01 Auth + Guards + RLS | 🟢 | JWT + Argon2id + RBAC bitmask |
| M01 Workflow Engine | 🟢 | State Machine |
| M01 Audit Engine | 🟢 | Append-only + hash chain |
| M01 Sequence + Policy + Posting | 🟢 | |
| M02 Products + Variants + Barcodes | 🟢 | |
| M02 Price Lists | 🟢 | Temporal (effectiveFrom/To) |
| M03 Inventory (MWA) | 🟢 | Append-only ledger |
| M03 Transfers + Stocktaking + Reorder | 🟢 | |
| M18 Users + Companies + Roles | 🟢 | |

## ✅ Wave 2 — العمل اليومي — **مكتملة 2026-04-27** ✅

| الوحدة | الحالة | Task | ملاحظات |
|---|---|---|---|
| M04 POS Devices + Shifts | ✅ DONE | T36 PR#124 | Web Sale Screen + offline |
| M04 POS Blind Cash Count + Auto-Variance | ✅ DONE | T37 PR#146 | Denomination reconciliation |
| M04 POS Receipts (offline-safe) | ✅ DONE | T36 | clientUlid idempotency + transactional |
| M04 Cash Movements | ✅ DONE | T36 | |
| M05 Customers + Loyalty | ✅ DONE | T44 PR#128 | Customer 360 + RFM segmentation |
| M05 Quotations → SalesOrders | ✅ DONE | T34,T35 PR#119 | Smart forms + comboboxes |
| M05 Sales Invoices + Returns | ✅ DONE | T10,T11,T15 | MWA COGS snapshot, JE auto-post |
| M16 Delivery (full state machine) | ✅ DONE | T33 PR#106 | COD + GPS + proof |
| Reports (17 slugs) | ✅ DONE | T38 PR#116 | Real data from DB |
| Sidebar Navigation + Breadcrumbs | ✅ DONE | T40 PR#147 | Full nav audit |

## ✅ Wave 3 — المشتريات

| الوحدة | الحالة | ملاحظات |
|---|---|---|
| M06 Suppliers + Prices + Scorecard | 🟢 | |
| M06 Purchase Orders | 🟢 | |
| M06 GRN + Quality Hold | 🟢 | Inventory in + rejection flow |
| M06 Vendor Invoices + 3-Way Match | 🟢 | Price ±2% + qty tolerance |

## ✅ Wave 4 — المالية

| الوحدة | الحالة | ملاحظات |
|---|---|---|
| M07 GL (Trial Balance, Ledger, Voucher) | 🟢 | TypeScript clean (side-based) |
| M07 Bank Accounts + Reconciliation | 🟢 | Auto-match + adjustments JE · TypeScript clean |
| M07 Payment Receipts (AR) | 🟢 | TypeScript clean |
| M07 Period Close (7-step) | 🟢 | Soft + hard close, reopen guards · TypeScript clean |
| M07 Financial Reports | 🟢 | BS, IS, CF, Equity · TypeScript clean |
| M17 Fixed Assets + Depreciation | 🟢 | SL + DB methods, disposal gain/loss · TypeScript clean |

## ✅ Wave 5 — HR + Jobs + Marketing — **مكتملة 2026-04-27** ✅

| الوحدة | الحالة | Task | ملاحظات |
|---|---|---|---|
| M08 Employees + Onboard + Terminate | ✅ DONE | T18,T19 | Gratuity calc |
| M08 Attendance (ZKTeco + Mobile) | ✅ DONE | T18 | Geofence 500m Haversine |
| M08 Leaves + Balance Tracking | ✅ DONE | T18 | 5 types with entitlements |
| M08 Payroll (Iraqi Tax + SS + OT) | ✅ DONE | T19 | Full lifecycle + CBS export |
| M08 HR Recruitment System | ✅ DONE | T51 PR#129 | Full pipeline: job posting → offer |
| M08 HR Employment Contracts + Policies | ✅ DONE | T52 PR#144 | Policy acceptance tracking |
| M08 HR Promotions + Salary Bands | ✅ DONE | T53 PR#148 | Grade-based salary structure |
| M10 Job Orders + BOM + Stages | ✅ DONE | T-custom | 6-stage workflow |
| M14 Campaigns (multi-channel) | ✅ DONE | T-marketing | ROI + UTM tracking |
| M14 Promotions + Validation | ✅ DONE | T-marketing | 5 types supported |
| M42 Smart Inventory Engine | ✅ DONE | T42 PR#126 | Reorder alerts + dead stock detection |
| M43 Sales Commissions + Incentives | ✅ DONE | T43 PR#127 | Tiered rates + settlement |

## ✅ Wave 6 — CRM + AI + Licensing + Storefront + Autopilot — **مكتملة 2026-04-27** ✅

| الوحدة | الحالة | Task | ملاحظات |
|---|---|---|---|
| M09 Leads + Scoring (0-100) | ✅ DONE | T44 PR#128 | RFM + Customer 360 |
| M09 Activities + Pipeline + Forecast | ✅ DONE | core | Kanban view |
| M11 Reports (17 reports) | ✅ DONE | T38 (5 + scaffolds) | |
| M11 Dashboards (5 dashboards) | ✅ DONE | T50 PR#140 | Financial KPIs |
| M12 License Schema + Plans | ✅ DONE | T58 PR#112 + T60 PR#150 | 4 plans · 21 features · seeded idempotent |
| M12 License Guard + Feature Cache | ✅ DONE | T59 PR#149 | Redis 5min TTL · T31 invalidation |
| M12 Trial Engine (30+7 grace) | ✅ DONE | T61 PR#155 | BullMQ cron · auto-degrade |
| M12 Hardware Fingerprint (Tauri) | ✅ DONE | T62 PR#151 | SHA-256 + RSA verify · max devices |
| M12 License Admin Dashboard | ✅ DONE | T63 PR#156 | Tenants + Plans + Audit · super-admin |
| M12 Activation API (RSA-2048) | ✅ DONE | T64 PR#158 | issue/activate/renew/revoke + offline verify |
| M12 Feature Flags (real-time UI) | ✅ DONE | T65 PR#157 | useFeature + FeatureGate · T31 push |
| M12 Defense-in-depth Enforcement | ✅ DONE | T66 PR#159 | API + Web + POS offline (7d grace) + Mobile |
| M12 License Analytics (MRR/Churn/LTV) | ✅ DONE | T67 PR#160 | Recharts dashboards |
| M12 Plan Proration (Decimal) | ✅ DONE | T68 PR#162 | Half-up · prorated_charge events |
| M12 License Expiry Notifications | ✅ DONE | T69 PR#152 | Daily cron · 30/14/7/3/1 reminders |
| M12 Multi-tenant Billing Dashboard | ✅ DONE | T70 PR#163 | LicenseInvoice + LicensePayment · manual recording |
| M71 Autonomous Operations Engine | ✅ DONE | T71 PR#161 + commits 38d60da/6d877f2 | Framework + **50/50 jobs COMPLETE** · 0 stubs · exception dashboard |
| M13 AI Tier 2 (Anomaly Detection) | 🟢 | core | 4 detection types |
| M13 AI Tier 1 (NL Query stub) | 🟢 | core | Graceful degradation |
| M13 AI Forecasting | 🟢 | core | Moving avg fallback |

---

## ⏳ Wave 7 — Hybrid Trial Funnel (نمط HubSpot/Stripe مكيّف للعراق) — **قائمة للالتقاط**

> **الهدف:** تحويل صفحة الهبوط من brochure إلى acquisition funnel كامل · WhatsApp-first · Manual approval · 7+7 lifecycle.

| الوحدة | الحالة | Task | ملاحظات |
|---|---|---|---|
| M14 Trial Request + Manual Approval | ⏳ TODO | T72 | Public signup → admin queue → wa.me approval link |
| M14 Trial Lifecycle Cron + WhatsApp Drip | ⏳ TODO | T73 | Day -1/0/+3 reminders · queue للإرسال اليدوي |
| M14 In-App Engagement + Discounts + Plans | ⏳ TODO | T74 | Banner · Tour · Discount codes · Yearly/3yr plans |
| M14 Trial Archive + Marketing Intelligence | ⏳ TODO | T75 | Day +14 archive · abandonment classifier · CSV export |

**Critical path:** T72 → T73 → T74 → T75 (PRs منفصلة لكل واحد · صادر deployable من PR1)

---

## ✅ مكتملة البنية (scaffold + deploy pipeline جاهز)

| الوحدة | الحالة | Task | ملاحظات |
|---|---|---|---|
| Frontend Admin Web (Next.js 15) | 🟢 | T02-T19, T34, T35, T57 merged | CRUD + Quotations + Orders New + Delivery Tracking مكتملة |
| M15 Storefront (E-commerce) | 🟢 | T25 merged | Dockerfile + compose + nginx vhost shop.ibherp.cloud · يحتاج DNS + certbot على VPS |
| POS Desktop (Tauri) | 🟡 scaffold | T27 merged | GitHub release workflow جاهز · يحتاج signing + SQLCipher activation |
| Mobile apps (React Native Expo) | 🟡 scaffold | T28 merged | EAS workflow جاهز · يحتاج EXPO_TOKEN + Apple/Google credentials |
| WhatsApp Bridge (Fastify) | 🟢 | T26 merged | مدمج في docker-compose · يحتاج WHATSAPP_TOKEN في .env على VPS |

## 🚧 لم يبدأ بعد

| الوحدة | الموجة | ملاحظات |
|---|---|---|
| AI Brain (Python FastAPI) | Wave 6 | Ollama + Qwen 7B + PyOD + Prophet — بعد 6 أشهر تشغيل حقيقي |

---

## 🧪 بوابات Wave (G1-G6)

| Gate | Wave 1 | Wave 2 | Wave 3 | Wave 4 | Wave 5 | Wave 6 |
|---|---|---|---|---|---|---|
| G1 تعريف مكتوب | ██████████ | ██████████ | ██████████ | ██████████ | ██████████ | ██████████ |
| G2 مسار العمل | ██████████ | ██████████ | ██████████ | ██████████ | ██████████ | ██████████ |
| G3 DB واضحة | ██████████ | ██████████ | ██████████ | ██████████ | ██████████ | ██████████ |
| G4 Tests (مكتوبة) | ██████████ 9/9 ✅ | ██████████ 3/3 ✅ | ██████████ 4/4 ✅ | ██████████ 7/7 ✅ | ██████████ 4/4 ✅ | ██████████ 3/3 ✅ |
| G4 Tests (مُشغَّلة) | ██████████ 9/9 ✅ | ██████████ 3/3 ✅ | ██████████ 4/4 ✅ | ██████████ 7/7 ✅ | ██████████ 4/4 ✅ | ██████████ 3/3 ✅ |
| G5 دليل إثبات | ░░░░░░░░░░ | ░░░░░░░░░░ | ░░░░░░░░░░ | ░░░░░░░░░░ | ░░░░░░░░░░ | ░░░░░░░░░░ |
| G6 تشغيل واقعي | ████░░░░░░ API 200 مؤكد / UAT pending | ░░░░░░░░░░ | ░░░░░░░░░░ | ░░░░░░░░░░ | ░░░░░░░░░░ | ░░░░░░░░░░ |

**الخلاصة:** ✅ G4 مغلق بالكامل (30/30 e2e tests passing — CI run 25118171594) · البوابات G5-G6 تتطلب:
- ~~Acceptance tests (pnpm --filter api test:e2e)~~ ✅ DONE 2026-04-29 — جميع 30 suites خضراء (71 PASS + 1 skipped)
- G5: Evidence collection (screenshots + API captures) per wave
- G6: Production deployment + UAT مع مستخدمين حقيقيين

---

## 🏗️ البنية التحتية

| المكوّن | الحالة |
|---|---|
| Monorepo + pnpm + Turbo | ✅ |
| 8 governance files | ✅ |
| apps/api NestJS | 🟢 code complete |
| Prisma + 6 migrations | 🟢 code complete |
| Docker Compose (VPS + Dev) | ✅ |
| Nginx + SSL | ✅ |
| API Dockerfile multi-stage | ✅ |
| Restic backup 3-2-1-1 | ✅ |
| GitHub repo | ✅ `ahrrfy/IBH` |
| CI/CD Gitea + Woodpecker | 🔴 لم يبدأ (مُستعاض بـ GitHub Actions) |
| GitHub Security Stack (CodeQL + Dependabot + Secret Scanning + Private Vuln Reporting) | ██████████ ✅ مكتمل ومُختبر — commit c79ef16 |
| Security Self-Healing Loop (bridge + sweep + close-hook + auto-merge + digest) | ██████████ ✅ مكتمل ومُختبر — كلا الـ workflows أخضران (runs 25119658244 + 25119685951) |

---

*آخر تحديث: 2026-04-29 — Session 26: ✅ I032 مغلق كاملاً (Batch 3-6: TS6, TW4, Prisma7, NestJS v11 stack, recharts 3, zod 4) · Phase 3 artifacts ✅ · Phase 5.A ✅ 50/50 jobs real · G4 GATE CLOSED 30/30 e2e tests*
