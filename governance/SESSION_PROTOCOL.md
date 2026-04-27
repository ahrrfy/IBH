# SESSION_PROTOCOL.md — بروتوكول الجلسات والوكلاء

> هذا هو **العقد** بين أي وكيل (Claude Code, Codex, Cursor, etc) والمشروع.
> اتباعه شرط لكل push.

---

## ⚡ القاعدة الأهم — التوزيع الذرّي للمهام

> **بعد 2026-04-27**: لا يجوز ادّعاء مهمة بتعديل Markdown يدوياً. التعارض الذي حصل (وكيلان على نفس T) سببه أن `.md` ليس قفلاً ذرّياً.
>
> **الحل**: orchestrator يستخدم Git refs على GitHub كقفل ذرّي حقيقي. أول `git push origin <branch>` يفوز، البقية تفشل تلقائياً.

### كل وكيل يستخدم 4 أوامر فقط

```bash
# 1) اعرف ما هو متاح ومن يعمل على ماذا
bash scripts/orchestrator/task.sh status

# 2) ادّعِ مهمة (smart-pick أو بـ ID محدد)
bash scripts/orchestrator/task.sh claim          # أول AVAILABLE deps متحققة
bash scripts/orchestrator/task.sh claim T34      # أو مهمة محددة

# 3) ادخل worktree المهمة — orchestrator أنشأ worktree معزولاً تحت .worktrees/<tid>/
#    (هذا هو إصلاح I033 — كل جلسة تعمل في مجلد منفصل بـ HEAD/index خاص بها)
cd .worktrees/t34
git status   # تأكد أنك على feat/t34-...

# 4) عند الانتهاء — من داخل worktree، السكربت يدير كل شيء
#    (typecheck → ready → auto-merge → حذف الـ worktree والـ branch)
bash ../../scripts/orchestrator/task.sh complete

# (اختياري) قفل صارم لجلسة واحدة فقط — يرفض ادّعاء ثانٍ على نفس الجهاز:
#   TASK_SINGLE_SESSION_LOCK=1 bash scripts/orchestrator/task.sh claim T34
```

**`complete` تلقائياً**:
1. يدفع آخر commits
2. يُشغّل `tsc --noEmit` على api و web — يفشل لو خطأ TS واحد
3. يُحوّل الـ Draft إلى Ready
4. يضبط `--auto` merge (ينتظر CI أخضر)
5. يستطلع حتى MERGED → ينقل المحلي إلى main → يحذف الـ branch محلياً وعن بُعد

### لو شيء انكسر

```bash
bash scripts/orchestrator/task.sh release   # تخلَّ عن المهمة بنظافة
```

### القواعد الصارمة

- ❌ **ممنوع** تعديل `governance/TASK_QUEUE.md` يدوياً لادّعاء مهمة. الادّعاء = `git push` فقط.
- ❌ **ممنوع** العمل على branch لم ينشئه السكربت لمهمة T.
- ❌ **ممنوع** استخدام `gh pr merge` مباشرة على PR مهمة — استخدم `task.sh complete`.
- ❌ **ممنوع** بدء عمل قبل `claim` — حتى exploration commits.
- ✅ **مسموح**: العمل اليدوي على الكود بعد `claim` بقدر ما تريد، ثم `complete` ليُغلق كل شيء.

### كيف يضمن الذرّية

| المرحلة | الآلية | لماذا ذرّية |
|---|---|---|
| اختيار branch | `feat/tNN-<slug-من-عنوان-المهمة>` | كل الوكلاء يحسبون نفس الـ slug من نفس العنوان |
| الادّعاء | `git push -u origin <branch>` | إنشاء ref على GitHub atomic — أول واحد يفوز |
| بعد الفشل | السكربت يخرج بـ exit 1 + تنظيف محلي | لا يبقى أثر للوكيل الخاسر |
| Draft PR | يُفتح بعد نجاح push فقط | إشارة بصرية لباقي الجلسات |
| Merge | `gh pr merge --auto --squash --delete-branch` | يفعل بعد CI أخضر فقط |

### أمثلة سيناريوهات

**سيناريو 1** — وكيلان يضربان نفس اللحظة على T34:
```
Agent A: bash task.sh claim T34
Agent B: bash task.sh claim T34   # في نفس الثانية

Agent A: git push origin feat/t34-sales-quotations    → 200 OK
Agent B: git push origin feat/t34-sales-quotations    → ! [rejected] (already exists)
                                                        → exits 1
                                                        → "Lost the race for T34"
                                                        → يُعيد المحاولة على T35
```

**سيناريو 2** — وكيل يُكمل عمله بشكل صحيح:
```
$ bash scripts/orchestrator/task.sh complete
→ apps/api typecheck            ✅
→ apps/web typecheck            ✅
→ Setting auto-merge on PR #92  ✅
→ Waiting for CI + merge...     (poll every 30s)
→ ✅ Task complete. PR #92 merged. Branch deleted.
```

**سيناريو 3** — typecheck فشل عند complete:
```
$ bash scripts/orchestrator/task.sh complete
→ apps/api typecheck            ❌ TS errors
ERROR: API typecheck FAILED
# الـ branch لم يُدمج. أصلح الأخطاء ثم أعد complete.
```

---

## 🟢 عند بداية أي جلسة جديدة

نفّذ هذه الخطوات بالترتيب — لا تبدأ أي عمل قبلها:

```bash
# 1. اقرأ المصادر الحيّة (الترتيب مهم)
cat CLAUDE.md                                # السياسات الدائمة
cat governance/SESSION_PROTOCOL.md           # هذا الملف
cat governance/TASK_QUEUE.md                 # المهام المتبقية
cat governance/ACTIVE_SESSION_LOCKS.md       # ما هو محجوز الآن
cat governance/SESSION_HANDOFF.md            # آخر موقف
cat governance/OPEN_ISSUES.md                # المشاكل المفتوحة

# 2. اعرض حالة الإنتاج (سريع)
gh run list --workflow=deploy-vps.yml --limit 1
curl -sI https://ibherp.cloud/health -w "%{http_code}\n"

# 3. افحص اكتشافات الأمان التلقائية (CodeQL/Dependabot/Secret Scanning)
gh issue list --label security:auto --state open --limit 10
# الحرجة منها (🔴) تظهر أيضاً في governance/OPEN_ISSUES.md عبر security-bridge.yml

# 4. اختر مهمة تالية بأمان
bash scripts/next-task.sh                   # يطبع أول ⏳ TODO متاحة
```

> 💡 **الحلقة الذاتية للأمان**: أي finding من GitHub Security يفتح Issue
> تلقائياً (`security-bridge.yml`)، وأي إصلاح يُغلق Issue + يحدّث
> `OPEN_ISSUES.md` تلقائياً (`security-close-hook.yml`). راجع
> `.github/workflows/security-bridge.yml` و `scripts/sync-security-issues.sh`.

---

## 🔄 ادّعاء (claim) المهمة

```bash
# مثال: ادّعاء T03
TASK=T03
SESSION_ID="claude-$(date +%Y%m%d-%H%M%S)"

# 1. أنشئ branch
git checkout -b feat/t03-user-crud-fe

# 2. حدّث TASK_QUEUE.md (Status + Owner + Started + المهمة)
# 3. أضف entry في ACTIVE_SESSION_LOCKS.md:
cat >> governance/ACTIVE_SESSION_LOCKS.md <<EOF
- **$TASK** | session: $SESSION_ID | files: \`apps/web/src/app/(app)/settings/users/[id]/**\` | started: $(date -u +%FT%TZ)
EOF

# 4. commit + push (هذا الـ commit يُعتبر "claim")
git add governance/TASK_QUEUE.md governance/ACTIVE_SESSION_LOCKS.md
git commit -m "claim($TASK): start by $SESSION_ID"
git push -u origin feat/t03-user-crud-fe
```

> ⚠️ **شرط:** لا تبدأ كتابة كود قبل ما تصل خطوة الـ push للـ claim. هذا يضمن أن الجلسات الموازية ترى ادّعاءك.

---

## 🛠️ تنفيذ المهمة

التزم بـ **CLAUDE.md "Mandatory Work Cycle"**:

```
INSPECT → PLAN → IMPLEMENT → VERIFY → COMMIT → REPORT → STOP
```

- **2-3 ملفات لكل cycle** (إلا بإذن)
- **1 feature/fix slice** فقط
- VERIFY: `tsc --noEmit` + e2e لو موجود + curl/browser لو UI

---

## ✅ إغلاق المهمة

```bash
# 1. PR
gh pr create --base main --head feat/t03-user-crud-fe --title "T03: user CRUD frontend" --body "..."

# 2. انتظر CI أخضر (3 jobs: ci.yml + deploy-vps.yml + security-scan.yml)
gh run watch

# 3. Merge (الـ deploy تلقائي بعدها)
gh pr merge --squash

# 4. حدّث TASK_QUEUE.md:
#    Status: ✅ DONE
#    Completed: <ISO timestamp>
#    Commit: <merge sha>

# 5. أزِل entry من ACTIVE_SESSION_LOCKS.md

# 6. تحقق على الإنتاج
curl -sI https://ibherp.cloud/<your-route> -w "%{http_code}\n"

# 7. session-end summary
```

---

## ⚙️ التوازي بين الوكلاء

### قواعد Hard
| | يُسمَح | لا يُسمَح |
|---|---|---|
| نفس الـ branch | لا (إلا لو الجلستان نفسهما) | نعم |
| ملفات في نفس الـ task scope | لا (لمنع تعارض) | نعم |
| ملفات في route ثاني تماماً | نعم (مثلاً T03 + T05 في طريقين مختلفين) | لا |
| تعديل governance/OPEN_ISSUES.md | نعم — append-only، resolve via rebase | — |
| تعديل governance/MODULE_STATUS_BOARD.md | نعم — append-only | — |
| push لـ main مباشرة | لا — فقط عبر PR | نعم |

### الإستراتيجية الموصى بها (للعمل التوازي):
1. وكيل 1 يأخذ **T01** (infra — ملفات مختلفة عن FE)
2. وكيل 2 يأخذ **T03** (web/settings/users)
3. وكيل 3 يأخذ **T07** (web/inventory/products)
4. وكيل 4 يأخذ **T12** (web/purchases/grn)

كلها لا تتعارض. كل واحد PR منفصل، CI أخضر مستقل، merge بأي ترتيب.

---

## 🔒 ملف ACTIVE_SESSION_LOCKS.md

شكل entry قياسي:

```markdown
- **T03** | session: claude-20260426-1500 | files: `apps/web/src/app/(app)/settings/users/[id]/**` | started: 2026-04-26T15:00:00Z
```

أزِله بمجرد ما المهمة `✅ DONE`. لو رأيت entry قديم > 24h لمهمة لم تُغلق — افترض أنها مهجورة، أزِلها وأعد المهمة لـ `⏳ TODO`.

---

## 🚦 خرق البروتوكول (escalation)

إذا اكتشفت:
- 🚨 جلستان ادّعتا نفس المهمة → الأولى timestamp تفوز، الثانية تتراجع
- 🚨 push مباشر لـ main من جلسة (تجاوز PR) → افتح issue I-conflict + revert على branch
- 🚨 conflict في governance — rebase, لا overwrite

---

## 📞 لمن سأرفع الإشكال

- conflicts → نقاش في PR comments
- bugs blocking task → افتح GitHub Issue + اربطه بالمهمة
- قرارات معمارية → governance/DECISIONS_LOG.md (لا تتجاوزه)

---

## ✅ Definition of Done (لكل مهمة)

المهمة لا تُغلَق إلا بعد:
1. ✅ الكود يبني بدون أخطاء (`tsc --noEmit`)
2. ✅ CI أخضر (typecheck-build + e2e + security-scan)
3. ✅ Deploy نجح + الخدمات healthy
4. ✅ اختبار UI/curl: السيناريو الرئيسي يعمل في الإنتاج
5. ✅ governance مُحدَّث (TASK_QUEUE + MODULE_STATUS_BOARD + OPEN_ISSUES حسب الحاجة)
6. ✅ commit message يشرح *لماذا* (ليس *ماذا*)
7. ✅ لا أسرار جديدة (gitleaks pass)
8. ✅ Status في TASK_QUEUE = ✅ DONE + Commit SHA + Completed timestamp
9. ✅ entry أُزيل من ACTIVE_SESSION_LOCKS.md
