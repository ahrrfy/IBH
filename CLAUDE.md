# ═══════════════════════════════════════════════════════════════
#  CLAUDE.md — ذاكرة المشروع الدائمة
#  Claude Code يقرأ هذا الملف تلقائياً في بداية كل جلسة
#  ⚠️ لا تعدّل هذا الملف يدوياً — استخدم الأوامر فقط
# ═══════════════════════════════════════════════════════════════

# ┌─────────────────────────────────────────────────────────────┐
# │  🚨 بروتوكول بدء الجلسة — إلزامي قبل أي شيء آخر          │
# └─────────────────────────────────────────────────────────────┘

## عند فتح أي جلسة جديدة، نفّذ بالترتيب (8 خطوات إلزامية):

1. اقرأ هذا الملف (CLAUDE.md) كاملاً — أنت تقرأه الآن ✅
2. اقرأ `governance/SESSION_PROTOCOL.md` — **بروتوكول الجلسات والوكلاء (للتوازي)**
3. اقرأ `governance/TASK_QUEUE.md` — **قائمة المهام الحيّة (المصدر الوحيد)**
4. اقرأ `governance/ACTIVE_SESSION_LOCKS.md` — ما هو محجوز الآن من جلسات أخرى
5. اقرأ `governance/SESSION_HANDOFF.md` — آخر موقف
6. اقرأ `governance/OPEN_ISSUES.md` — مشاكل مفتوحة
7. اقرأ `governance/DECISIONS_LOG.md` + `MODULE_STATUS_BOARD.md` + `ARCHITECTURE.md` — للسياق المعماري
8. **شغّل** `bash scripts/next-task.sh` — يطبع المهمة التالية المتاحة
9. **شغّل** `gh issue list --label security:auto --state open --limit 10` — اكتشافات أمان تلقائية من CodeQL/Dependabot/Secret Scanning (تُغلق الحلقة عبر `.github/workflows/security-bridge.yml`)
10. **اطبع ملخص**: "أنا فاهم إننا في [المرحلة]، المهمة التالية المتاحة [TXX]، أنوي ادّعاءها وتنفيذها"

> ❌ إذا ما قرأت الملفات السبعة — لا تبدأ أي عمل
> ❌ إذا ما ادّعيت المهمة في `TASK_QUEUE.md` + `ACTIVE_SESSION_LOCKS.md` قبل الكود — قد تتعارض مع جلسة أخرى
> ❌ لا تختر مهمة عشوائياً — اتبع `next-task.sh` أو ابحث عن أول `⏳ TODO` متاحة

# ┌─────────────────────────────────────────────────────────────┐
# │  🏢 هوية المشروع                                            │
# └─────────────────────────────────────────────────────────────┘

**الاسم**: ERP الرؤية العربية (Al-Ruya ERP)
**النوع**: Operating System for Business — نظام تخطيط موارد مؤسسي
**السوق**: 🇮🇶 العراق (IQD أساسي + USD ثانوي)
**الشركة**: الرؤية العربية للتجارة
**المنفذ**: Claude Code (Opus) + صاحب المشروع (المتحقق)

### الرؤية:
- النظام يفكر، الموظف ينقر
- صفر اشتراكات خارجية — ملكية كاملة
- مقاوم لبيئة العراق (كهرباء، إنترنت، تذبذب أسعار)
- قابل للبيع تجارياً

# ┌─────────────────────────────────────────────────────────────┐
# │  ⚙️  PERMANENT EXECUTION PROTOCOL  (default behavior)       │
# │  Applies to this session and ALL future sessions in repo.   │
# └─────────────────────────────────────────────────────────────┘

## Mission
Build and maintain this production system with maximum correctness,
minimum token waste, and zero fake progress.

## Mandatory Work Cycle
Always execute in this order — never skip a step:

```
INSPECT → PLAN → IMPLEMENT → VERIFY → COMMIT → REPORT → STOP
```

## Session Start Rules
At the start of every session:

1. Run:
   - `git status`
   - `git log --oneline -5`
2. Detect:
   - current branch
   - latest commit
   - unfinished work
   - risky uncommitted changes
   - smallest next safe task
3. Inspect only targeted files first.
   Do not scan the entire repository unless required.

> This complements the Arabic session-start protocol above — both must run.

## Budget / Token Rules (permanent limits)
- Maximum **2–3 files** changed per cycle
- Maximum **1 feature/fix slice** per cycle
- No open-ended coding · No endless continuing
- No broad rewrites · No unrelated cleanup
- No cosmetic-only edits · No speculative architecture
- No duplicate implementations · Prefer editing existing files
- Use `grep` / `ripgrep` before opening large files
- Summarize findings briefly
- If context **> 60%** → prepare handoff soon
- If context **> 70%** → stop and write handoff summary

## Planning Rules
Before coding, always state:
- Goal
- Files to inspect
- Files to change
- Risk level
- Verification method
- Expected commit type

Then start implementation.

## Implementation Rules
- Make the **smallest correct change**
- Preserve existing architecture and patterns
- Keep compatibility unless explicitly changing behavior
- Do not break: routes, schema, auth, accounting, inventory,
  settlements, branch logic
- Do not add `TODO` instead of fixing
- Do not hide errors blindly
- Do not patch symptoms only — fix root cause when safe

## ERP / POS / Accounting Operational Guards
Because this is a real business system, every change must protect:

- Transaction integrity
- Idempotent invoice flows
- Correct stock updates
- Warehouse balances
- Cost layers (if used)
- Settlement / shift totals
- Payment-method separation (cash / card / mobile)
- Branch isolation
- Permission enforcement
- Traceable journal entries
- Correct reverse flows for void / return / cancel

> **Never fix frontend only when backend logic is wrong.**
> Reinforces F1 / F2 / F3 — does not replace them.

## Verification Rules
After each change run the smallest relevant verification:
- `npm run check`
- `npm run typecheck`
- `npm test`
- targeted tests / targeted build / targeted lint
- `grep` evidence

If failure is unrelated, report separately and continue safely.
**Never claim "fixed" without evidence.**

## Commit Rules
Before commit run:
- `git diff --check`
- `git status`
- `git diff --stat`

Commit only related files. Format:

```
FIX-###: description
HOTFIX-###: description
FEATURE-###: description
```

## Required Cycle Report Format
After every cycle output **only**:

```
### Cycle Report
- Goal:
- Files changed:
- Why:
- Verification:
- Commit:
- Risk:
- Next safest step:
```

Then **STOP**. Never auto-continue after report.

## Handoff Rules
When stopping due to context or end of session, write:

```
### HANDOFF SUMMARY
- Branch:
- Latest commit:
- Completed:
- Remaining:
- Risks:
- Files touched:
- Verification done:
- Next safest command:
```

Then stop. *(This is the minimum English handoff — the full Arabic
session-end protocol below is still required at end of session.)*

## Anti-Fake Progress Rules
Never say "done" unless **all** are true:
- code changed
- verification ran
- evidence exists
- commit exists

No fake confidence. No vague claims. No hallucinated completion.

## Priority Rule
```
Correctness  >  Speed
Safety       >  Quantity
Verified progress  >  Large progress
Small finished slices  >  Big unfinished work
```

> **Default Behavior — Effective Immediately:** these rules apply
> starting now and in every future session in this repository.

# ┌─────────────────────────────────────────────────────────────┐
# │  🔒 الفلسفات الست — دستور المشروع (لا تُخالفها أبداً)    │
# └─────────────────────────────────────────────────────────────┘

## F1 — فلسفة الصلاحيات:
- RBAC + ABAC + Field-Level Security
- 7 مستويات لكل Entity: C (Create) / R (Read) / U (Update) / D (Delete) / S (Submit) / A (Approve) / P (Print)
- الإنفاذ في PostgreSQL RLS — لا يتجاوزه أي كود
- مثال: Branch Manager يشوف فواتير فرعه فقط، وما يشوف المبالغ فوق 5,000,000 IQD

## F2 — فلسفة المحاسبة:
- Double-Entry إلزامي بـ DB Constraint (total_debit = total_credit)
- Append-Only للقيود — لا حذف ولا تعديل بعد الترحيل
- عكس الخطأ بقيد عكسي فقط — لا تعديل مباشر
- Period Lock لا يُفتح بعد الإقفال
- Hash Chain على كل journal_entry (اكتشاف التلاعب)
- كل عملية تجارية = قيد محاسبي تلقائي (Posting Engine)

## F3 — فلسفة المخزون:
- Moving Weighted Average — لا FIFO، لا LIFO
- StockLedger Append-Only — لا تعديل تاريخي للتكلفة
- لا حركة مخزون بدون مستند مصدر (ref_type + ref_id NOT NULL)
- لا رصيد سالب (ما لم يُسمَّح بصلاحية خاصة)

## F4 — فلسفة التشغيل:
- لا تعتمد على موظف — كل خبرة شفوية تتحول لقاعدة
- Tier 3 (قواعد برمجية) يحكم 80% من الحالات
- الموظف ينقر، النظام يفكر
- Defaults ذكية — 90% من الوقت بدون تغيير

## F5 — فلسفة الذكاء (Tiered AI):
- Tier 3: قواعد فورية (صفر AI) — 80% من الحالات
- Tier 2: ML خفيف دائم (~2GB) — 15% من الحالات
- Tier 1: Qwen 7B عند الطلب (lazy loading) — 5% من الحالات
- AI يقترح — الإنسان يعتمد (لا قرارات مستقلة)
- ⚠️ AI يُبنى بعد 6 أشهر تشغيل حقيقي — ليس قبل

## F6 — فلسفة التراخيص:
- RSA-2048 signed license
- Hardware fingerprint
- Grace period 30 يوم
- Feature gating per plan
- ⚠️ يُبنى في المراحل الأخيرة — ليس الآن

# ┌─────────────────────────────────────────────────────────────┐
# │  🏗️ التقنية المقفلة (من ARCHITECTURE.md)                    │
# └─────────────────────────────────────────────────────────────┘

| البند | القرار | ليش |
|---|---|---|
| Backend | NestJS + TypeScript | نفس لغة Frontend — مشاركة Types |
| Frontend | React 19 + Next.js 15 + Tailwind 4 | |
| Desktop/POS | Tauri 2 + SQLite مشفّر (SQLCipher) | أخف من Electron × 20 |
| Mobile | React Native (Expo) + WatermelonDB | لاحقاً — بعد Web |
| DB الرئيسية | PostgreSQL 16 | ACID + RLS + pgvector |
| Cache/Queue | Redis 7 + BullMQ | |
| Storage | MinIO (self-hosted S3) | |
| AI | Tiered: Qwen 7B + PyOD + Prophet | متناسب مع 16GB RAM |
| VPS | Hostinger KVM4 · Frankfurt · 16GB · 200GB | موجود حتى 2028 |
| Deployment | Docker Compose + Nginx + Let's Encrypt | |
| IDs | ULID | تسلسلي + offline-safe |
| ORM | Prisma 6+ | |
| Validation | Zod 3+ | مشترك بين Frontend و Backend |
| Backup | Restic — نموذج 3-2-1-1 | |

# ┌─────────────────────────────────────────────────────────────┐
# │  📁 هيكل المشروع (Monorepo)                                 │
# └─────────────────────────────────────────────────────────────┘

```
al-ruya-erp/
├── CLAUDE.md                    ← أنت هنا (ذاكرة المشروع)
├── .claude/
│   └── commands/                ← أوامرك المخصصة
│       ├── session-start.md     ← /session-start
│       ├── session-end.md       ← /session-end
│       ├── verify.md            ← /verify
│       ├── progress.md          ← /progress
│       └── plan.md              ← /plan
├── governance/
│   ├── SESSION_HANDOFF.md       ← آخر موقف (أهم ملف)
│   ├── DECISIONS_LOG.md         ← القرارات
│   ├── ARCHITECTURE.md          ← التقنية المقفلة
│   ├── MODULE_STATUS_BOARD.md   ← حالة كل وحدة
│   ├── OPEN_ISSUES.md           ← مشاكل مفتوحة
│   ├── DOMAIN_DICTIONARY.md     ← قاموس المصطلحات
│   ├── ACCEPTANCE_TESTS.md      ← اختبارات القبول
│   └── MASTER_SCOPE.md          ← النطاق الكامل
├── apps/
│   ├── api/                     ← NestJS Backend
│   │   ├── src/
│   │   │   ├── engines/         ← المحركات الأساسية
│   │   │   ├── modules/         ← وحدات العمل
│   │   │   └── platform/        ← خدمات مشتركة
│   │   ├── prisma/              ← Schema + Migrations
│   │   └── test/
│   ├── web/                     ← Next.js Admin Panel
│   ├── desktop/                 ← Tauri Desktop App
│   ├── pos/                     ← Tauri POS (Offline)
│   └── storefront/              ← Next.js E-commerce
├── packages/
│   ├── shared-types/            ← TypeScript types مشتركة
│   ├── ui-components/           ← shadcn RTL
│   ├── validation-schemas/      ← Zod schemas مشتركة
│   └── sdk/                     ← API SDK
├── infra/
│   ├── docker-compose.yml
│   ├── nginx/
│   └── backup/
└── scripts/
    ├── verify-session.sh        ← تحقق من صحة الجلسة
    └── health-check.sh          ← فحص صحة النظام
```

# ┌─────────────────────────────────────────────────────────────┐
# │  🧱 نمط الوحدة القياسي (كل module يتبع نفس النمط)        │
# └─────────────────────────────────────────────────────────────┘

```
apps/api/src/modules/<module>/
├── <module>.module.ts
├── <module>.controller.ts       ← REST endpoints
├── <module>.service.ts          ← Business Logic (هنا القلب)
├── <module>.repository.ts       ← DB Access (Prisma)
├── dto/
│   ├── create-<module>.dto.ts   ← Zod validation
│   └── update-<module>.dto.ts
├── entities/                    ← Prisma models
├── events/                      ← Domain Events (published)
├── listeners/                   ← Domain Events (consumed)
├── workflows/                   ← State Machine
├── reports/                     ← Report definitions
└── tests/
    ├── unit/
    ├── integration/
    └── acceptance/
```

# ┌─────────────────────────────────────────────────────────────┐
# │  🔄 نمط الخدمة القياسي (كل Service يتبع هذا الترتيب)      │
# └─────────────────────────────────────────────────────────────┘

```typescript
async anyOperation(dto: AnyDto, user: User): Promise<Result> {
  // 1. التحقق من الصلاحيات (F1)
  await this.authEngine.authorize(user, 'Entity', 'Action');

  // 2. التحقق من السياسات (F4)
  await this.policyEngine.validate('operation_name', dto);

  // 3. Business Logic داخل Transaction
  const result = await this.db.$transaction(async (tx) => {
    const entity = await tx.entity.create({ data: dto });
    // أي عمليات مرتبطة (مخزون، محاسبة، أحداث...)
    return entity;
  });

  // 4. Domain Event
  await this.events.emit('entity.operation', result);

  // 5. Audit Log
  await this.audit.log('Entity.Operation', result, user);

  return result;
}
```

# ┌─────────────────────────────────────────────────────────────┐
# │  ⛔ المحظورات — لا تفعل هذا أبداً                         │
# └─────────────────────────────────────────────────────────────┘

## محظورات معمارية:
- ❌ لا تستخدم Raw SQL إلا بعد Sanitize صارم
- ❌ لا تتجاوز Prisma ORM للعمليات المالية
- ❌ لا تخزّن JSON في الأعمدة النصية لبيانات مالية
- ❌ لا تستخدم ENUM في PostgreSQL — استخدم VARCHAR + CHECK constraint
- ❌ لا تعمل JOIN عميق أكثر من 3 مستويات بدون Subquery

## محظورات مالية (F2):
- ❌ لا تسمح بحفظ قيد غير متوازن (debit ≠ credit)
- ❌ لا تسمح بتعديل قيد بعد الترحيل — فقط عكس
- ❌ لا تسمح بالكتابة في فترة محاسبية مقفلة
- ❌ لا تسمح بحذف من journal_entries أو stock_ledger أو audit_logs
- ❌ لا تعتمد Application-level check — DB Constraint أول

## محظورات مخزون (F3):
- ❌ لا تسمح بتعديل StockLedger تاريخياً
- ❌ لا تسمح بحركة مخزون بدون مستند مصدر
- ❌ لا تحسب Moving Average يدوياً — دايماً من StockLedger

## محظورات سلوكية:
- ❌ لا تقول "اكتمل" بدون دليل (ملفات + tests + screenshots)
- ❌ لا تُوسّع النطاق بدون إذن صاحب المشروع
- ❌ لا تغيّر قراراً معمارياً بدون DECISIONS_LOG
- ❌ لا تبني UI قبل ما يشتغل Backend
- ❌ لا تبني ميزة جديدة قبل ما تخلص الحالية + تُختبر
- ❌ لا تنهي الجلسة بدون تحديث SESSION_HANDOFF.md
- ❌ لا تقرأ تاريخ الدردشة — الملفات هي المصدر الحقيقي
- ❌ لا تنسخ كود — أعد كتابته مع فهم السياق الحالي

# ┌─────────────────────────────────────────────────────────────┐
# │  ✅ قواعد الجودة — اعمل هذا دايماً                        │
# └─────────────────────────────────────────────────────────────┘

## كتابة الكود:
- ✅ كل متغير/دالة/كلاس: اسم واضح بالإنجليزية — لا اختصارات غامضة
- ✅ كل دالة: تعليق JSDoc يشرح الغرض والمدخلات والمخرجات
- ✅ كل Service method: تعليق يشرح الـ Business Rule
- ✅ كل DB migration: تعليق يشرح ليش
- ✅ كل test: تعليق يشرح الحالة اللي يختبرها
- ✅ استخدم TypeScript strict mode — no any, no implicit any
- ✅ Zod validation على كل input — بدون استثناء

## الأمان:
- ✅ RLS policy على كل جدول فيه company_id أو branch_id
- ✅ Rate limiting على كل endpoint
- ✅ Input sanitization حتى لو Zod يتحقق
- ✅ SQL Injection prevention: Prisma فقط
- ✅ XSS prevention: React default + CSP headers

## الاختبارات:
- ✅ كل وحدة: unit tests للـ Business Logic
- ✅ كل endpoint: integration test
- ✅ كل قيد مالي: test يتحقق من التوازن
- ✅ كل state machine: test لكل انتقال
- ✅ كل ABAC rule: test يتحقق من الرفض
- ✅ اختبارات الحالات الحافة (Edge Cases) — مو بس Happy Path

## التوثيق:
- ✅ كل module: README.md يشرح ماذا يفعل ومتى يستخدم
- ✅ كل API endpoint: OpenAPI/Swagger doc
- ✅ كل DB table: تعليق في Prisma schema
- ✅ كل Postman collection: مجموعة منسقة

# ┌─────────────────────────────────────────────────────────────┐
# │  📊 خريطة التنفيذ — الموجات (من MODULE_STATUS_BOARD.md)   │
# └─────────────────────────────────────────────────────────────┘

```
Wave 0: البنية التحتية (VPS + Docker + Monorepo + Governance)
Wave 1: Core Engines + Products + Inventory + Administration
Wave 2: POS (Offline) + Sales + Delivery
Wave 3: Purchases + Suppliers + 3-Way Match
Wave 4: Finance (GL + AR + AP) + Fixed Assets + Financial Reports
Wave 5: HR + Custom Orders + Marketing
Wave 6: CRM + AI Tiered + Licensing + E-commerce + Advanced Reports
```

> ⚠️ لا موجة تبدأ قبل اجتياز الموجة قبلها كاملة

# ┌─────────────────────────────────────────────────────────────┐
# │  🧠 كيف تتعامل مع صاحب المشروع                             │
# └─────────────────────────────────────────────────────────────┘

## اسأل دايماً قبل ما تقرر:
1. "هل أنا فاهم إن المطلوب اليوم هو [X]؟"
2. "هل أبدأ من [نقطة محددة]؟"
3. "هل فيه شي يتعلق بهذا الموضوع في OPEN_ISSUES؟"

## أبلّغ دايماً:
1. "خلصت [X] — الملفات المتأثرة: [قائمة]"
2. "واجهت مشكلة في [X] — الحل المقترح: [Y]"
3. "لازم أغيّر [X] بسبب [Y] — أضيف DECISIONS_LOG؟"

## لا تفعل:
- لا تبني شي غريب بدون ما تسأل
- لا تتجاهل ملاحظات صاحب المشروع
- لا تُصر على رأيك التقني إذا صاحب المشروع رفضه
- لا تختصر الوقت على حساب الجودة

# ┌─────────────────────────────────────────────────────────────┐
# │  🔐 بروتوكول إنهاء الجلسة — إلزامي قبل ما تطلع          │
# └─────────────────────────────────────────────────────────────┘

قبل ما تنهي أي جلسة، نفّذ `/session-end` أو يدوياً:
> ℹ️ بالإضافة لهذي الخطوات، اطبع **HANDOFF SUMMARY** (الصيغة الإنجليزية في PERMANENT EXECUTION PROTOCOL أعلاه) كحدّ أدنى.


1. ✅ حدّث `governance/SESSION_HANDOFF.md` بالكامل
2. ✅ حدّث `governance/MODULE_STATUS_BOARD.md` (غيّر حالة الوحدات اللي اشتغلنا عليها)
3. ✅ أضف أي قرار جديد لـ `governance/DECISIONS_LOG.md`
4. ✅ أضف أي مشكلة جديدة لـ `governance/OPEN_ISSUES.md`
5. ✅ تأكد إن كل Tests تمر (npm test)
6. ✅ تأكد إن الكود يبني بدون أخطاء (npm run build)
7. ✅ اطبع ملخص الجلسة:

```
═══════════════════════════════════════
📝 ملخص الجلسة
═══════════════════════════════════════
✅ ما تم إنجازه:
   - [قائمة مختصرة]

❌ ما لم يكتمل:
   - [قائمة + السبب]

📁 الملفات المتأثرة:
   - [قائمة بالمسارات]

⚠️ القرارات الجديدة:
   - [أي قرار + رقمه في DECISIONS_LOG]

🔴 المخاطر:
   - [أي خطر جديد]

➡️ الخطوة التالية:
   - [تعليمات دقيقة للجلسة القادمة]
═══════════════════════════════════════
```

> ❌ لا تنهي الجلسة بدون هذا الملخص
> ❌ لا تنهي الجلسة والكود فيه خطأ build
> ❌ لا تنهي الجلسة والملفات ما تحدّثت

# ┌─────────────────────────────────────────────────────────────┐
# │  🚨 علامات الخطر — إذا شفت واحد، أوقف وأبلّغ فوراً       │
# └─────────────────────────────────────────────────────────────┘

أخبر صاحب المشروع فوراً إذا لاحظت:
- 🔴 كود مالي لا يتحقق من Double-Entry
- 🔴 لا يوجد RLS على جدول فيه بيانات حساسة
- 🔴 تعديل مباشر على بيانات مالية (بدل عكس)
- 🔴 Context window يضغط — تحتاج تبسّط أو تقسّم
- 🔴 تعارض بين ملفين (مثلاً: Session Handoff يقول X لكن الكود يقول Y)
- 🔴 اختبار فاشل في القيود المحاسبية
- 🔴 النطاق يتوسع خارج Wave المحددة
