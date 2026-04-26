# ACCURACY_MAP.md

Z0 audit date: 2026-04-26
Branch: `agent/z0-audit`
Scope: determine which parts are operational code, which parts are partial, and which parts are stubs/placeholders.

## Executive Summary

The repository is not fake overall. The API and web admin have substantial real code and both passed targeted verification in this audit. The main risk is uneven completion: backend core flows are materially implemented, while POS and storefront still contain demo/stub flows and cannot currently be considered operational.

## Verification Evidence

| Check | Result | Evidence |
|---|---:|---|
| Current branch | Pass | `agent/z0-audit` |
| API typecheck | Pass | `pnpm --filter @erp/api typecheck` exited 0 |
| Web production build | Pass | `pnpm --filter @erp/web build` exited 0 and generated 53 app routes |
| POS build | Fail | `pnpm --filter @erp/pos build` failed because app-local dependencies are missing |
| Storefront build | Fail | `pnpm --filter @erp/storefront build` failed because app-local dependencies are missing |
| API e2e files | Present | 20 `apps/api/test/*.e2e-spec.ts` files |
| API controllers | Present | 41 module controller files |
| API services | Present | 46 module service files |
| Web app pages | Present | 115 tracked `apps/web/src/app/*.tsx` files |

## Accuracy Map

| Area | Accuracy | Status | Evidence | Risk |
|---|---:|---|---|---|
| API core/runtime | High | Real code | API typecheck passes; 46 services and 41 controllers | Needs full e2e gate before production claims |
| Web admin | High | Real buildable UI | Next build passes; 53 routes generated | Some `/preview/*` routes appear prototype-oriented |
| Finance | Medium-High | Mostly real, with specific gaps | Posting/payment/payroll services exist; payment receipt hardcodes AR code | Account mapping still has a TODO in AR receipts |
| Purchases | Medium | Real flow plus OCR stub | Vendor invoices include reverse logic and 3-way related code | OCR suggestion is explicit Wave 6 stub |
| HR/payroll | Medium | Real calculations/posting with placeholder output | Payroll posts journal entry | Payslip URL is placeholder PDF |
| Inventory | Medium-High | Real service presence and tests | Inventory services and e2e tests exist | One MWA correctness e2e remains skipped |
| POS app | Low-Medium | UI prototype, not operational | Build currently fails; sale/shift screens contain TODO/mock flows | Not safe for Wave 2 operational claims |
| Storefront | Low-Medium | UI/dev flow, not production auth | Build currently fails; login accepts stub fallback token | Not production-ready |
| AI/reporting raw SQL | Medium | Implemented but high-review surface | 47 `$queryRawUnsafe` occurrences in API src | Needs security/API consistency review, especially after I016 |
| Shared packages | Medium | Present | `shared-types`, `validation-schemas`, `domain-events` exist | Needs Wave 1 package compile/export audit |

## Concrete Stub / Placeholder Findings

| Finding | File | Line | Impact |
|---|---|---:|---|
| OCR suggestion explicitly returns empty placeholder result | `apps/api/src/modules/purchases/invoices/vendor-invoices.service.ts` | 715 | Vendor invoice OCR is not real yet |
| AR control account uses a hardcoded placeholder mapping note | `apps/api/src/modules/finance/ar/payment-receipts.service.ts` | 80 | Finance correctness depends on seeded CoA remaining stable |
| Payroll payslip URL points to a placeholder PDF | `apps/api/src/modules/hr/payroll/payroll.service.ts` | 285 | Payroll documents are not truly generated |
| POS barcode adds mock item instead of API/local cache lookup | `apps/pos/src/screens/PosSale.tsx` | 19 | POS sale is not operational |
| POS payment uses alert and does not queue/save/sync receipt | `apps/pos/src/screens/PosSale.tsx` | 32 | Offline POS flow is not implemented in UI |
| POS shift open/close screens are TODO-driven | `apps/pos/src/screens/ShiftOpen.tsx`, `apps/pos/src/screens/ShiftClose.tsx` | 9 | Shift lifecycle is not operational in POS app |
| Storefront login proceeds with stub token fallback | `apps/storefront/src/app/login/page.tsx` | 36 | Storefront auth is not production-safe |

## Structural Findings

1. `apps/web/tsconfig.tsbuildinfo` is tracked. It polluted placeholder searches with a huge generated file and should be removed from git in a separate cleanup cycle if not intentionally tracked.
2. Empty directories named like `apps/api/src/modules/finance,packages` exist locally. They are not tracked, but they indicate a previous extraction/copy artifact and should be deleted outside this audit if no active agent owns them.
3. `as any` appears 258 times in API source/tests. This does not mean fake code, but it marks areas where type safety claims should be treated carefully.
4. `$queryRawUnsafe` appears 47 times in API source. Some may be controlled internal reporting SQL, but Wave 2 API Consistency and Wave 4 Security must review every occurrence.

## Wave Recommendation

### Wave 0 Gate

Do not advance Z0 to Done until this file is reviewed by the orchestrator and accepted as the baseline accuracy map.

### Wave 1 Must Start Before Business Expansion

1. Environment Commander must make `pnpm install` or workspace dependency linking reliable for all apps.
2. Shared Packages Guardian must compile `packages/*` and verify exports used by apps.
3. Database Guardian must verify Prisma deploy path and seed path against a real database.
4. CI/CD Commander must run the same checks on CI, not only locally.

### Wave 2 Blockers

1. Do not claim POS operational readiness until mock item/payment/shift TODO flows are replaced.
2. Do not claim storefront production readiness while stub token fallback exists.
3. Finance and reporting should proceed with focused checks around hardcoded account mappings and raw SQL.

## Bottom Line

The system is real but not uniformly production-real. API and web admin are the strongest areas. POS, storefront, OCR, payslip generation, and selected accounting/reporting surfaces are the clearest gaps.
