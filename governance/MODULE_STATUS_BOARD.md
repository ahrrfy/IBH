# MODULE_STATUS_BOARD.md
## لوحة حالة الوحدات
### يُحدَّث بعد كل جلسة

---

> **الرموز:** 🔴 لم يبدأ | 🟡 قيد التطوير | 🟢 كود مكتمل | ✅ مختبر في الإنتاج | ⚠️ موقوف

---

## 📊 نظرة عامة — 2026-04-24

| المقياس | القيمة |
|---|---|
| Waves مكتملة (كود) | **6 / 6** |
| Modules مكتملة (كود) | **17 / 18** (M15 E-commerce pending) |
| Migrations | 6 |
| Prisma Models | ~75 |
| TypeScript files | ~95+ |
| Lines of code | ~16,000+ |
| Acceptance tests | 0 (pending) |
| Production deployment | Not yet |

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

## ✅ Wave 2 — العمل اليومي

| الوحدة | الحالة | ملاحظات |
|---|---|---|
| M04 POS Devices + Shifts | 🟢 | Denomination cash count + tolerance |
| M04 POS Receipts (offline-safe) | 🟢 | clientUlid idempotency + transactional |
| M04 Cash Movements | 🟢 | |
| M05 Customers + Loyalty | 🟢 | AR aging + tier |
| M05 Quotations → SalesOrders | 🟢 | |
| M05 Sales Invoices + Returns | 🟢 | MWA COGS snapshot, JE auto-post |
| M16 Delivery (full state machine) | 🟢 | COD + GPS + proof |

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

## ✅ Wave 5 — HR + Jobs + Marketing

| الوحدة | الحالة | ملاحظات |
|---|---|---|
| M08 Employees + Onboard + Terminate | 🟢 | Gratuity calc |
| M08 Attendance (ZKTeco + Mobile) | 🟢 | Geofence 500m Haversine |
| M08 Leaves + Balance Tracking | 🟢 | 5 types with entitlements |
| M08 Payroll (Iraqi Tax + SS + OT) | 🟢 | Full lifecycle + CBS export |
| M10 Job Orders + BOM + Stages | 🟢 | 6-stage workflow |
| M14 Campaigns (multi-channel) | 🟢 | ROI + UTM tracking |
| M14 Promotions + Validation | 🟢 | 5 types supported |

## ✅ Wave 6 — CRM + AI + Licensing + Reports

| الوحدة | الحالة | ملاحظات |
|---|---|---|
| M09 Leads + Scoring (0-100) | 🟢 | |
| M09 Activities + Pipeline + Forecast | 🟢 | Kanban view |
| M11 Reports (17 reports) | 🟢 | |
| M11 Dashboards (5 dashboards) | 🟢 | |
| M12 Licensing (RSA/HMAC signed) | 🟢 | Heartbeat + grace |
| M13 AI Tier 2 (Anomaly Detection) | 🟢 | 4 detection types |
| M13 AI Tier 1 (NL Query stub) | 🟢 | Graceful degradation |
| M13 AI Forecasting | 🟢 | Moving avg fallback |

---

## 🚧 لم يبدأ بعد

| الوحدة | الموجة | ملاحظات |
|---|---|---|
| M15 E-commerce (Storefront) | Wave 3+6 | Next.js app (UI — ليس API) |
| Frontend Admin Web | — | Next.js 15 app |
| POS Desktop (Tauri) | — | |
| Mobile apps | — | React Native (sales rep + employee) |
| AI Brain (Python FastAPI) | Wave 6 | Ollama + Qwen 7B + PyOD + Prophet |
| WhatsApp Bridge | — | whatsapp-web.js |

---

## 🧪 بوابات Wave (G1-G6)

| Gate | Wave 1 | Wave 2 | Wave 3 | Wave 4 | Wave 5 | Wave 6 |
|---|---|---|---|---|---|---|
| G1 تعريف مكتوب | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| G2 مسار العمل | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| G3 DB واضحة | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| G4 Acceptance Tests | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| G5 دليل إثبات | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| G6 تشغيل واقعي | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

**الخلاصة:** الكود مكتمل، لكن البوابات G4-G6 تتطلب:
- Acceptance tests (pnpm --filter api test:e2e)
- Deployment + data migration
- UAT مع مستخدمين حقيقيين

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
| CI/CD Gitea + Woodpecker | 🔴 لم يبدأ |

---

*آخر تحديث: 2026-04-24 — Waves 1-6 كود كامل مرفوع على GitHub*
