# SESSION_HANDOFF.md

# Session Handoff — 2026-04-27 (Session 13 — Wave 4 G4 Closure + I031/I034)

## ما تم إنجازه اليوم (Session 13)

**هدف الجلسة:** إغلاق Wave 4 (المالية) — استكمال G4 (الاختبارات المكتوبة).

### PR [#125](https://github.com/ahrrfy/IBH/pull/125) — 3 e2e tests مُعاد كتابتها (I031 جزئي 3/4) ✅
أُطلق 3 وكلاء متوازين بـ `isolation: worktree`، كل واحد يُعيد كتابة test واحد من commit `3134b61` ضد الـ schema الحالي:
- `apps/api/test/period-close-7step.e2e-spec.ts` (256 سطر) — W4: 7-step + reopen guard + F2 hash chain
- `apps/api/test/vendor-invoice-posting.e2e-spec.ts` (216 سطر) — W4 AP: balanced JE + F2
- `apps/api/test/grn-inventory-posting.e2e-spec.ts` (189 سطر) — W3: qtyChange ledger + reject path + append-only

**Schema adaptations applied:** `qtyIn/qtyOut` → `qtyChange` (signed) · `refType/refId` → `referenceType/referenceId` · `ProductVariant.product` removed (use templateId) · `GrnService` → `GRNService` · `PeriodCloseService.startClose` signature change · `UserSession` extended fields · `PeriodStatus` enum values · reopen role `super_admin`

**Consolidation:** cherry-pick على branch `fix/i031-wave4-e2e` ثم PR واحد. tsc → 0 errors. مدموج commit `d01d99a`.

### PR [#130](https://github.com/ahrrfy/IBH/pull/130) — اكتشاف وإصلاح I034 (bug إنتاجي) ✅
الـ test الجديد `vendor-invoice-posting` كشف **bug إنتاجي** كان مدفوناً منذ rename لحقول `AccountingPeriod`:
- `posting.service.ts:197` كان يستعلم بـ `periodYear`/`periodMonth` (حقول غير موجودة) بدل `year`/`month`
- كل caller لـ `postJournalEntry` (assets, depreciation, COD settlement, delivery, payment receipts, vendor/sales invoices) كان يرمي `PrismaClientValidationError` runtime
- الـ tests السابقة لم تكشفه لأنها bail out قبل المسار الكامل
- الإصلاح: سطر واحد + إضافة `orderBy` لـ `groupBy` في grn test (متطلب Prisma)

### PR [#131](https://github.com/ahrrfy/IBH/pull/131) — توثيق I034 في OPEN_ISSUES ✅

### نتيجة Wave 4 G4
| Test | قبل | بعد |
|---|---|---|
| period-close-7step | غير موجود | ✅ PASS |
| vendor-invoice-posting | غير موجود | ⚠️ FAIL (seed companyId padding — خارج النطاق) |
| grn-inventory-posting | غير موجود | ✅ PASS (بعد I034) |

**G4 Score:** 3/3 مكتوبة، 2/3 تنجح. الـ 1 الفاشل سببه bug seed/data منفصل (`gen_ulid()` يُنتج ULID 20-char بدل 26 → `@db.Char(26)` يضيف padding → CoA findMany لا يطابق).

## ما لم يكتمل

- ⏳ **`vendor-invoice-posting`** يحتاج إصلاح seed companyId padding في cycle منفصل (افحص `gen_ulid()` في migration 0007)
- ⏳ **`license-heartbeat.e2e-spec.ts`** (الرابع من I031) — Wave 6 / F6 licensing — يُؤجَّل لجلسة Wave 6
- ⏳ **regressions من جلسات أخرى:** `trial-balance` و `iraqi-tax-brackets` كانتا تنجحان قبل، الآن تفشلان بـ "Connection is closed" (Redis flakiness) بسبب T46 (Notification engine) أو T48 (Account mapping). + `account-mapping` (T48) فاشل.

## القرارات الجديدة

- لا قرارات معمارية جديدة. (I034 إصلاح bug، ليس قرار معماري)

## الملفات المتأثرة

- `apps/api/test/period-close-7step.e2e-spec.ts` (جديد)
- `apps/api/test/vendor-invoice-posting.e2e-spec.ts` (جديد)
- `apps/api/test/grn-inventory-posting.e2e-spec.ts` (جديد)
- `apps/api/src/engines/posting/posting.service.ts` (سطر واحد — periodYear→year)
- `governance/OPEN_ISSUES.md` (I031 → جزئي 3/4، I034 جديد ومُغلق)
- `governance/MODULE_STATUS_BOARD.md` (Wave 3-4 G4 → 3/3 مكتوبة)
- `governance/SESSION_HANDOFF.md` (هذا الملف)

## الاختبارات المنفذة

- ✅ `pnpm --filter api exec tsc --noEmit` → exit 0 في كل cycle (3 مرات)
- ⚠️ CI E2E run [24998559202](https://github.com/ahrrfy/IBH/actions/runs/24998559202): 21/25 suites pass · 56/60 tests pass
- ❌ لم أُشغّل اختبار يدوي في المتصفح (لا UI تغيّر)

## المخاطر المفتوحة

- 🔴 **I034 fix كشف أن code paths كانت معطّلة في الإنتاج** — يحتاج تحقق على VPS أن الـ deploy التالي يصلحها فعلاً (assets, depreciation, payment receipts، إلخ كلها كانت ترمي runtime error قبل اليوم). UAT يجب أن يُغطّي دورة AP/AR كاملة.
- 🟡 **seed companyId padding** — `gen_ulid()` يُنتج 20-char بدل 26، مما يكسر `vendor-invoice-posting`. يحتاج فحص في cycle منفصل
- 🟡 **regressions على main** — 4 tests فاشلة من جلسات متوازية أخرى (T46/T48)؛ ينبغي معالجتها بـ owner-by-owner

## ملاحظات تشغيلية

🟡 **Orchestrator silent branch switch** ظهر مرة في هذه الجلسة — `git commit` ذهب لـ `hotfix/baseline-posting-and-types-react` بدل main (تم التصحيح بـ cherry-pick على branch جديد). I033 موثَّق كمغلق لكن chaos يظهر أحياناً مع جلسات متوازية كثيرة.

## الخطوة التالية بالضبط

```bash
git pull origin main
# Cycle تالٍ — إصلاح seed companyId padding
grep -n "gen_ulid\|@db.Char(26)" apps/api/prisma/migrations/0007_*.sql apps/api/prisma/seed.ts
# أو: regression cleanup من T46/T48
```

**خيارات الجلسة القادمة:**
- a) إكمال Wave 4 (إصلاح seed padding → vendor-invoice-posting يمر) — ~30 دقيقة
- b) regression cleanup (trial-balance, iraqi-tax-brackets) — يحتاج تحقيق Redis lifecycle
- c) Wave 5/6 — license-heartbeat الرابع من I031

---

# Session Handoff — 2026-04-27 (Session 12 — T34 Quotations UI + Dependency Merges)

## ما تم إنجازه اليوم (Session 12)

### T34 — Sales Quotations UI ✅ (PR #109 — `5bfa546`)
- 4 صفحات: list + new + detail (send/accept/reject/convert) + edit (draft-only guard)
- `sidebar.tsx`: إضافة `عروض الأسعار` (FileText)

### Dependencies مدموجة ✅
- PR #91 — CI: fetch-metadata 2→3 · PR #90 — CI: actions/checkout 4→6
- PR #94 — lucide-react 0.577.0 web + lockfile fix (`4e7b71a`)
- PR #92 — lucide-react 0.577.0 storefront + lockfile fix (`676b404`)
- PR #105 — T35 مكرر → مغلق (المحتوى في #113)

**main الآن:** `676b404` — نظيف، لا branches معلّقة

### PRs مجمّدة (major — I032)
#98 @vitejs/plugin-react · #97 zod 4 · #96 ulid 3 · #95 next 16 · #93 @types/node 25

### الخطوة التالية
```bash
git pull origin main
bash scripts/next-task.sh  # T36 أو T39
```

---

## (Session 11 archive) ما تم إنجازه

- ✅ **T35 مدموج على main** — commit `6b041d3` عبر PR #113 (auto-merge بعد CI أخضر):
  - `apps/web/src/components/customer-combobox.tsx` (جديد) — بحث + رصيد + حد ائتمان + تحذير تجاوز
  - `apps/web/src/components/product-combobox.tsx` (جديد) — بحث + stock-on-hand لكل مخزن + شارة "نفد المخزون"
  - `apps/web/src/app/(app)/sales/orders/new/page.tsx` (جديد) — form كامل: عميل/مخزن/تاريخ/بنود/مجموع حي + insufficient-stock warning + POST `/sales-orders`
- ⚠️ **rescue حرج:** PR #104 الأصلي أُغلق دون merge (orchestrator duplicate detection). branch القديم `feat/t35-sales-order-new` كان مبنياً على main متقادمة جداً — لو دُفع كما هو لكان حذف **4053 سطر** من T33/T34/T57 المدموج. الحل: cherry-pick implementation فقط على branch v2 من main الحالي → PR #113.
- ✅ **تنظيف:** نُسخ احتياطي ملفات T32 untracked في بداية الجلسة (انتهى عند merge PR #103)
- ⚠️ **اكتشاف pre-existing:** الصفحات `/sales/orders` list/detail تستدعي `/sales/orders` (خطأ) لكن BE هو `@Controller('sales-orders')` — صفحتي الجديدة تستخدم المسار الصحيح. تعارض pre-existing خارج النطاق.

## ما لم يكتمل

- ✅ T35 Slice 1 مدموج (لا شيء معلق منه)
- ⏳ **T34 detail page** — حاولت كتابتها لكن جلسة موازية (sonnet-4-6) أكملتها أثناء عملي → أُلغي branch `feat/t34-quotation-detail` محلياً
- ⏳ **T35 Slice 2** — last-sold-price-per-customer + suggested qty + live credit-limit block + customer auto-fill (يحتاج BE endpoints جديدة)

## القرارات الجديدة

- لا قرارات معمارية جديدة

## الملفات المتأثرة

- `apps/web/src/components/customer-combobox.tsx` (جديد)
- `apps/web/src/components/product-combobox.tsx` (جديد)
- `apps/web/src/app/(app)/sales/orders/new/page.tsx` (جديد)
- `governance/TASK_QUEUE.md` (T35 → IN_PROGRESS — قد يكون أُعيد ضبطه عبر orchestrator)
- `governance/ACTIVE_SESSION_LOCKS.md` (تم إعادة ضبطه عدة مرات أثناء الجلسة)

## الاختبارات المنفذة

- ✅ `npx tsc --noEmit` على `apps/web` → exit 0 (3 ملفات جديدة فقط — لا يحتاج build/test على apps/api)
- ⏳ CI على PR #104 — pending
- ❌ لم أُشغّل اختبار في المتصفح (يحتاج dev server + DB كامل + login)

## المخاطر المفتوحة

- 🟡 **PR #104 لم يُختبَر في المتصفح** — typecheck فقط. POST URL يستخدم `/sales-orders` (المسار الصحيح)؛ list/detail الموجودة تستخدم `/sales/orders` الخطأ pre-existing
- 🟢 **Slice 2 معلَّق** — يحتاج BE: endpoint last-sold-price + endpoint customer profile مع payment terms + price list

## ملاحظات تشغيلية حرجة (جديدة)

🔴 **Multi-agent orchestrator chaos** — 5+ جلسات متوازية كانت نشطة:
1. كل تعديل لـ `governance/ACTIVE_SESSION_LOCKS.md` و `TASK_QUEUE.md` يُعاد ضبطه خلال ثوانٍ من قِبل آلية orchestration ثانية → بروتوكول الـ lock الحالي (manual edit + commit) لا يعمل تحت هذا الضغط
2. **Branch switch صامت:** تم تبديلي من `feat/t35-sales-order-new` إلى `main` تلقائياً بين أمرَين متتاليَين → تسبب في commit عرضي على main (مُصلَح بـ reset + cherry-pick)
3. **ملفات untracked تظهر/تختفي:** ملفات T32 ظهرت ثم اختفت في بداية الجلسة؛ ملفات T34 detail ظهرت من جلسة موازية أثناء عملي
4. **commit `fddccba claim(T33)` من claude-sonnet-4-6** ظهر تلقائياً على branch محلية لي

→ يحتاج **توضيح بروتوكول orchestrator** قبل الجلسة القادمة، أو عودة لجلسة واحدة فقط.

## ممنوع تغييره في الجلسة القادمة

- لا تُعِد تشغيل T35 — PR #104 يُغطّي Slice 1
- لا تكسر URL pattern في صفحات `/sales/orders/new` (تستخدم `/sales-orders` كـ API path)

## الخطوة التالية بالضبط

```bash
git pull origin main
gh pr view 104 --json state,statusCheckRollup
# إذا CI أخضر:
gh pr merge 104 --squash
# ثم:
bash scripts/next-task.sh  # اختر مهمة تالية متاحة
```

**الخيارات للجلسة القادمة:**
- a) T35 Slice 2 (يحتاج BE endpoints أولاً — أنشئ T35-BE task)
- b) T36 (POS Web Sale Screen) — مستقل
- c) T39 (Fix broken pages) — slices صغيرة منعزلة

---

# Session Handoff — 2026-04-27 (Session 10 — T34 Sales Quotations UI)

## ما تم إنجازه اليوم

- ✅ **T33 تأكيد الاكتمال** — PR #106 (`67f921d`) كان مدموجاً قبل الجلسة (وكيل متوازي أكمله)
- ✅ **T34 — Sales Quotations UI** — 4 صفحات مكتملة على branch `feat/t34-sales-quotations`:
  - `sales/quotations/page.tsx` — قائمة مع فلاتر الحالة + DataTable + useLiveResource
  - `sales/quotations/new/page.tsx` — نموذج ذكي: combobox عميل (تحذير رصيد ائتماني) + combobox منتج (سعر تلقائي) + حساب فوري للمجاميع
  - `sales/quotations/[id]/page.tsx` — تفاصيل مع أزرار إجراءات (إرسال/قبول/رفض/تحويل) حسب الحالة
  - `sales/quotations/[id]/edit/page.tsx` — تعديل مسودة فقط مع حارس حالة
  - `sidebar.tsx` — إضافة `عروض الأسعار` (FileText) قبل المبيعات
- ✅ **PR #109** مُرفوع — CI يعمل (pending)

## ما لم يكتمل

- ⏳ **PR #109** — ينتظر CI أخضر ثم merge
- ⏳ **T35** — Sales Orders New/Create (Smart Form) — أول مهمة متاحة بعد T34
- ⏳ **T36–T40** — باقي Wave 2

## القرارات الجديدة

- لا قرارات معمارية جديدة — جلسة UI فقط

## الملفات المتأثرة

- `apps/web/src/app/(app)/sales/quotations/page.tsx` (جديد)
- `apps/web/src/app/(app)/sales/quotations/new/page.tsx` (جديد)
- `apps/web/src/app/(app)/sales/quotations/[id]/page.tsx` (جديد)
- `apps/web/src/app/(app)/sales/quotations/[id]/edit/page.tsx` (جديد)
- `apps/web/src/components/sidebar.tsx` (تعديل: إضافة quotations entry)
- `governance/TASK_QUEUE.md` (T34 → ✅ DONE)
- `governance/ACTIVE_SESSION_LOCKS.md` (T34 closure note)

## الاختبارات المنفذة

- `npx tsc --noEmit` — نظيف (exit 0) بعد حذف `.next` cache

## الخطوة التالية

- انتظر CI أخضر على PR #109 ثم اطلب merge
- ابدأ T35 — Sales Orders New/Create
- ملاحظة: `feat/t57-public-delivery-tracking-page` يحتوي commit T34 خطأ (`defa075`) — بعد merge PR #109 هذا لن يُسبب مشاكل في diff الـ T57 PR

## Branch State

- `main` (local + remote): `baefed2` — نظيف
- `feat/t34-sales-quotations`: 3 commits ahead — PR #109 open
- `feat/t57-public-delivery-tracking-page`: يحتوي commit T34 زائد (سيُزال تلقائياً عند rebase بعد merge T34)
