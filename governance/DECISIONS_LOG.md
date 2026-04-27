# DECISIONS_LOG.md
## سجل القرارات المعمارية الرسمي
### كل قرار مهم يُوثَّق هنا قبل التنفيذ

---

> **القاعدة الذهبية:**
> لا تعديل على قرار موجود — أضف صفاً جديداً فقط.
> هذا السجل يُوقَّع من Super Admin قبل تفعيل أي قرار كبير.

---

| # | القرار | البديل المرفوض | السبب | المؤثر على | التاريخ | الحالة |
|---|---|---|---|---|---|---|
| D01 | PostgreSQL 16 بدل MySQL | MySQL 8 | ACID كامل + RLS + pgvector + Partitioning + JSON | كل الوحدات | 2026-04-23 | ✅ مقفل |
| D02 | NestJS بدل Python/FastAPI للـ Backend الرئيسي | FastAPI | مشاركة TypeScript Types مع Frontend — لا ترجمة | API + Frontend | 2026-04-23 | ✅ مقفل |
| D03 | Tauri 2 بدل Electron | Electron | أخف × 20 — مهم لأجهزة العراق المتواضعة | POS + Desktop | 2026-04-23 | ✅ مقفل |
| D04 | Moving Weighted Average بدل FIFO/LIFO | FIFO | مناسب لتذبذب أسعار العراق — لا يستدعي تعديلاً تاريخياً | Inventory + Finance | 2026-04-23 | ✅ مقفل |
| D05 | VPS فقط (بدون خادم محلي) | On-Premise Server | لا إمكانية توفير سيرفر محلي — POS offline يعوّض | Infrastructure | 2026-04-23 | ✅ مقفل |
| D06 | Qwen 7B بدل 14B | Qwen 14B | 16GB RAM لا تكفي لـ 14B مع الخدمات الأخرى | AI Brain | 2026-04-23 | ✅ مقفل |
| D07 | Modular Monolith بدل Microservices | Microservices | الحجم لا يستدعي Microservices مبكراً — تعقيد غير مبرر | Architecture | 2026-04-23 | ✅ مقفل |
| D08 | ULID بدل UUID/Auto-increment | UUID v4 | تسلسلي + offline-safe + لا تعارض عند الدمج | كل الجداول | 2026-04-23 | ✅ مقفل |
| D09 | Tiered AI (3 طبقات) بدل LLM في كل مكان | Qwen везде | كفاءة موارد + موثوقية Tier 3 + سرعة Tier 2 | AI + Performance | 2026-04-23 | ✅ مقفل |
| D10 | النظام المحاسبي الموحد العراقي | IFRS مباشر | متوافق مع متطلبات السوق العراقي القانونية | Finance | 2026-04-23 | ✅ مقفل |
| D11 | Prisma 6 بدل Drizzle أو TypeORM | TypeORM | Type-safety أعلى + migrations أفضل + ecosystem | API Database | 2026-04-24 | ✅ مقفل |
| D12 | pnpm + Turborepo بدل npm workspaces أو Nx | Nx | أخف + أسرع + أبسط إعداداً مع pnpm | Monorepo | 2026-04-24 | ✅ مقفل |
| D13 | تفعيل GitHub Security Stack كامل (CodeQL + Dependabot + Secret Scanning + Private Vuln Reporting) مع جسر تلقائي لـ governance | الاكتفاء بـ gitleaks محلي | يحوّل اكتشافات الأمان من تحذيرات سلبية إلى مهام تلقائية في `OPEN_ISSUES.md` و GitHub Issues — يكمّل حلقة `auto-diagnose.yml` ليصير عندنا حلقة استشفاء ذاتي شاملة (CI fail + Security finding → Issue → Claude → Fix → Close). حرج لـ ERP يعالج بيانات مالية. | كل المستودع — workflows + governance | 2026-04-26 | ✅ مقفل |
| D14 | تفعيل Auto-Merge + Delete-branch-on-merge على مستوى الريبو (`allow_auto_merge: true`, `delete_branch_on_merge: true`) | إبقاؤهما مغلقتين والدمج اليدوي لكل PR | يُفعِّل فعلياً الـ workflow `dependabot-automerge.yml` المشحون في D13/PR #56 — minor/patch Dependabot PRs تُدمج تلقائياً عند نجاح CI، بدون إغراق صاحب المشروع بمراجعات يومية. الـ branch protection على main يبقى الخط الأخير. | Repository config + Dependabot auto-merge | 2026-04-27 | ✅ مقفل |
| D_WAVE5 | **Wave 5 مغلقة رسمياً 2026-04-27** — 19 مهمة (T35-T53) + HOTFIX×2 مُدموجة عبر Parallel agent orchestration (2 sessions: main + ahrrfy). النطاق الفعلي: Wave 2 cleanup (T35-T40) + Wave 5 core HR/Marketing/Inventory/Finance (T41-T53). المؤجّل: Q04 expiring stock (يحتاج BatchLedger.expiryDate)، PDF Arabic encoding (Latin1 فقط حالياً)، full e2e suite كاملة (pre-existing Bull handler conflict T46 + seed padding T53). | البدء الفوري في Wave 6 | Wave 5 كاملة كوداً — G4/G5/G6 تحتاج UAT حقيقي | M08 (HR), M10 (Custom Orders), M14 (Marketing), M42 (Inventory Intelligence), M43 (Commissions), Wave 2 modules | 2026-04-27 | ✅ مقفل |

---

## كيفية إضافة قرار جديد

```
1. ناقش مع الفريق أولاً
2. وثّق: القرار + البديل المرفوض + السبب + التأثير
3. أضف صفاً جديداً بالتاريخ
4. وقّع Super Admin
5. ثم فقط ابدأ التنفيذ
```

---

## القرارات المؤجلة (للمراجعة لاحقاً)

| الموضوع | الخيارات | موعد المراجعة |
|---|---|---|
| ترقية Qwen 14B | عند زيادة RAM إلى 32GB | عند Phase 10 |
| Read Replica | PostgreSQL streaming replica للتقارير | عند بلوغ 10M+ صف |
| CDN للمتجر | Cloudflare R2 أو self-hosted | عند إطلاق المتجر |
