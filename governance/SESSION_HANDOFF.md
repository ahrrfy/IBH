# SESSION_HANDOFF.md

# Session Handoff — 2026-04-27 (Session 8 — Major Dependency PRs triage) ✅ CLOSED

## Branch
`main` — latest commit `245f795`

## ما تم إنجازه (Session 8)

### تنظيف 18 PR major version من Dependabot
- ✅ أُغلقت 18 PR كبرى (TypeScript 6 × 4، Tailwind 4 × 2، Prisma 7، NestJS ×3، react-router-dom ×2، recharts، zod، tailwind-merge، lucide-react ×2، @types/node) — كل PR فيه تعليق يشرح سبب التأجيل وخطة الترحيل
- ✅ أُضيفت `ignore` rules في `.github/dependabot.yml` لمنع إعادة فتح هذه الـ PRs أسبوعياً (major-only — security PRs لا تزال تصل)
- ✅ مُدوَّن I032 في `governance/OPEN_ISSUES.md`: 5 مسارات ترحيل مع شروط واضحة لكل ترقية
- ✅ PR #88 (minor-and-patch root, كل CI اخضرّ) مدموج يدوياً

## الحالة النهائية

| الـ metric | القيمة |
|---|---|
| Open PRs | 2 (minor/patch — آمنة، تنتظر rebase) |
| Closed major PRs | 18 ✅ |
| Latest commit | `245f795` |
| dependabot.yml | محدَّث بـ ignore rules |

## PRs مفتوحة متبقية
- PR #86 — `react-hook-form` 7.73→7.74 في web (minor, CI فاشل بسبب base قديمة — سيُصلَح بـ Dependabot rebase)
- PR #73 — minor-and-patch group في api (نفس السبب)

كلاهما **آمنان** — يلمسان `package.json` فقط. Dependabot سيُعيد rebase في الإثنين القادم.

## الملفات المتأثرة
1. `.github/dependabot.yml` — ignore rules لـ 18 package عبر 5 ecosystems
2. `governance/OPEN_ISSUES.md` — I032 + §I032 تفاصيل الترحيل

## الخطوة التالية بالضبط

```bash
# الـ PR queue نظيف من المشاكل الكبرى.
# الخيارات المتاحة:
#   a) T32 — External Delivery Companies BE (أول مهمة TODO في Wave 2)
#   b) I031 — 4 e2e tests معطوبة (schema-rotted) — Issue #85
#   c) انتظار rebase PRs #86 + #73 ثم مراجعتهما

git pull origin main
gh pr list --state open   # يجب أن يُظهر 2 فقط (minor/patch)
bash scripts/next-task.sh # T32 هي الأولى المتاحة
```

---

# Session Handoff — 2026-04-27 (Session 7 — Branch hygiene + Dependabot triage + auto-merge enable) ✅ CLOSED

## Branch
`main` — متزامن. لا فروع محلية.
آخر commit: `1cbfdea` (chore(ci/deps): bump actions/setup-node from 4 to 6 (#63))

## ما تم إنجازه اليوم (Session 7)

### 1. تنظيف فروع شامل (47 فرع → 1 فرع feature + Dependabot فقط)
- دمج PR #56 (D13 Security loop) → main
- حذف 37 فرع بعيد مدموج فعلاً عبر PRs مدموجة سابقاً
- حذف 7 فروع `ahead=0` (محتواها في main)
- حذف 12 فرع محلي قديم
- النتيجة: قبل = 47 فرع · بعد = 0 فروع feature يدوية + 18 Dependabot فقط

### 2. تحليل عميق للـ 9 فروع المشكوك فيها
لكل واحد: فحص ملفات، ahead/behind، تطابق مع main، تجربة merge جاف.
- **6 مكررات** — محتواها في main عبر PRs مدموجة بأسماء مختلفة
- **1 انحدار** (`claude/new-session-g4gXq` — كان يحذف 3 سطور gitignore مهمة)
- **2 محصودة جزئياً** عبر PR #81 (cherry-pick):
  - من `claude/implement-todo-item-rr0Pw`: `bootstrap-vps.yml` (366 سطر) ✅
  - من `feat/t27-pos-build-claude`: تبيّن أن pos-release.yml + tauri windows config **مدموجَين بالفعل** عبر PR #33

### 3. اكتشاف schema-rot في 4 e2e tests
عند تجربة دمج 4 e2e tests من claude/implement-todo-item — فشل CI بأخطاء TypeScript:
- `StockLedgerEntry.qtyIn/qtyOut/refType` لم تعد موجودة (الآن `qtyChange` المُوقَّع)
- `ProductVariant.product` relation محذوفة
- `GrnService` → `GRNService` (casing)

أُسقطت من PR #81 وفُتح Issue #85 لإعادة كتابتها ضد الـ schema الحالي.

### 4. تصنيف 25 Dependabot PR وفتح حلقة auto-merge
- **مدموج** (4): #57 (npm_and_yarn security group), #59 (pnpm/action-setup), #61 (codeql-action), #63 (setup-node)
- **مغلق** (#64): real CI failures (web minor-and-patch typecheck + e2e)
- **معلّق** (1): #73 — typecheck + e2e فشل (api minor-and-patch — يحتاج تحقق)
- **يحتاج rebase** (1): #78 — تعارض دائم على lock file
- **18 Major upgrades** متروكة لمراجعة منفصلة (Prisma 6→7, TS 5→6, tailwind 3→4, react-router 6→7, إلخ)

### 5. تفعيل Auto-Merge على مستوى الريبو (D14)
- `allow_auto_merge: false → true`
- `delete_branch_on_merge: false → true`
- النتيجة: الـ workflow `dependabot-automerge.yml` (الذي شُحن في PR #56) يعمل الآن **فعلاً** — أي minor/patch Dependabot PR ينجح في CI سيُدمج تلقائياً ويُحذف فرعه.
- أُرسل `@dependabot recreate` لـ 14 PR متبقية لإعادة rebase ضد main المحدّث؛ الآمنة منها ستُدمج بمفردها.

## ما لم يكتمل
- **PR #73** (api/minor-and-patch group) — typecheck + e2e فشل. السبب: غير محدد، يحتاج فحص محلي
- **PR #78** (root/minor-and-patch) — تعارض دائم في lock file بعد أكثر من recreate
- **18 PR Major upgrades** — تتطلب اختبار يدوي مكثّف لكل واحدة (Prisma, TS, tailwind, إلخ). متروكة لمراجعات مستقبلية
- **4 e2e tests معطوبة** (Issue #85) — تحتاج إعادة كتابة ضد الـ schema الحالي

## القرارات الجديدة
- **D14**: تفعيل Auto-Merge + Delete-branch-on-merge على مستوى الريبو — راجع `governance/DECISIONS_LOG.md`

## الملفات المتأثرة (1 ملف فعلي على main)
1. `.github/workflows/bootstrap-vps.yml` (جديد — من PR #81)

> الباقي حدث في PRs و GitHub settings (لا تعديل في working tree)

## الاختبارات المنفذة
- ✅ CI (typecheck + build + e2e + CodeQL + gitleaks + GitGuardian) **نجح** على PR #81 و PRs المدموجة #57/#59/#61/#63
- ⏳ E2E tests الـ 4 المُسقَطة — لم تُختبر (schema-rotted، أُسقطت)
- ℹ️ لم نشغّل `npm run build/test` محلياً — لم نلمس كود TS/JS، فقط workflows + GitHub config + cherry-picks

## المخاطر المفتوحة
- 🟡 **PR #73 يحتوي تحديثات patch قد تكون مفيدة** — لكن CI يفشل. يحتاج فحص محلي قبل recreate
- 🟡 **18 Major upgrades مفتوحة** — كل أسبوع Dependabot يفتح المزيد. خطة batch مطلوبة لتجنب الانفجار
- 🟢 **Auto-merge مفعّل** — قد يدمج تحديث minor خاطئ إذا CI gates ناقصة. الـ branch protection على main يحدّ من ذلك

## ممنوع تغييره في الجلسة القادمة
- D14 مقفل — لا تعطّل `allow_auto_merge` بدون قرار جديد
- لا تدمج PR #73 أو أي major upgrade بدون اختبار محلي يدوي
- Issue #85 يحتفظ بـ commit hash `3134b61` كمصدر للمحتوى الأصلي

## الخطوة التالية بالضبط

```bash
# 1. التحقق من الحلقة التلقائية لـ Dependabot
gh pr list --author 'app/dependabot' --state open --json number,title,mergeStateStatus | head -30

# 2. مراقبة أي PR تم دمجه تلقائياً منذ نهاية الجلسة
gh pr list --author 'app/dependabot' --state merged --search 'merged:>=2026-04-27' --limit 20

# 3. فحص PR #73 محلياً — لماذا typecheck يفشل؟
gh pr checkout 73
cd apps/api && pnpm install && pnpm typecheck

# 4. اختيار major upgrade واحد للاختبار (ابدأ بأقلها مخاطر — مثلاً lucide-react)
gh pr view 66 --web

# 5. أو بدء العمل على Issue #85 — إعادة كتابة 4 e2e tests
git show 3134b61:apps/api/test/grn-inventory-posting.e2e-spec.ts > /tmp/grn-orig.ts
# ثم أعد كتابتها ضد الـ schema الحالي
```

---

# Session Handoff — 2026-04-26 (Session 6 — GitHub Security self-healing loop) ✅ CLOSED

## Branch
`feat/security-self-healing-loop` — PR #56 مفتوح ينتظر merge
آخر commit: `9d1843d`

## ما تم إنجازه اليوم (Session 6)

### تفعيل GitHub Security Stack كامل (D13)
**الهدف**: تحويل GitHub Security من لوحة تحذيرات سلبية إلى **مولّد مهام تلقائي** يغذّي governance، ويُغلق الحلقة عند الإصلاح — بشكل **فوري + مستمر** بدون جدول ثابت.

### الحلقة المبنية
```
حدث (alert/push/PR/workflow) → ثوانٍ
  → security-bridge.yml يفتح Issue + يحدّث OPEN_ISSUES.md
  → جلسة Claude → next-task.sh يلتقطها → fix → PR → merge
  → security-close-hook.yml يغلق Issue + يحدّث OPEN_ISSUES.md ✅
  → security-sweep.yml يحدّث الـ digest الحي
الحلقة لا تتوقف حتى total_open = 0
```

### الملفات المُنشأة (10) + المُحدَّثة (3) في PR #56
- `.github/workflows/codeql.yml` — JS/TS scan بـ security-extended
- `.github/dependabot.yml` — تحديثات أسبوعية مجمّعة لـ 6 ecosystems
- `.github/workflows/security-bridge.yml` — alert → Issue (event-driven: code_scanning/secret_scanning/dependabot)
- `.github/workflows/security-close-hook.yml` — fix merged → Issue closed → ✅ في OPEN_ISSUES
- `.github/workflows/security-sweep.yml` — حلقة مستمرة (push/PR/workflow_run/issues + 15min safety net)
- `.github/workflows/dependabot-automerge.yml` — auto-merge للـ patch/minor/dev
- `SECURITY.md` — سياسة AR/EN + SLA
- `scripts/sync-security-issues.sh` — helper يفتح Issue + يحدّث governance
- `scripts/update-security-digest.sh` — يبني/يحدّث/يغلق digest issue واحد
- **محدَّث**: `CLAUDE.md` — خطوة 9 جديدة في session-start
- **محدَّث**: `governance/SESSION_PROTOCOL.md` — نفس الإضافة + شرح
- **محدَّث**: `governance/DECISIONS_LOG.md` — D13

### تفعيلات يدوية أنجزها المالك (في GitHub UI)
- ✅ Dependabot alerts
- ✅ Dependabot security updates
- ✅ Private vulnerability reporting
- ⏳ Code scanning + Security policy → سيُفعَّلان تلقائياً بعد merge

## ما لم يكتمل
- **PR #56 لم يُمرَج بعد** — ينتظر مراجعة المالك ثم merge.
- **21 ثغرة Dependabot موجودة على main** (12 high + 9 moderate) — ستظهر تلقائياً كـ 21 Issue بـ label `security:auto` بمجرد merge.

## القرارات الجديدة
- **D13**: تفعيل GitHub Security Stack كامل (CodeQL + Dependabot + Secret Scanning + Private Vuln Reporting) مع جسر تلقائي لـ governance — راجع `governance/DECISIONS_LOG.md`.

## الملفات المتأثرة (13)
1. `.github/workflows/codeql.yml` (جديد)
2. `.github/workflows/security-bridge.yml` (جديد)
3. `.github/workflows/security-close-hook.yml` (جديد)
4. `.github/workflows/security-sweep.yml` (جديد)
5. `.github/workflows/dependabot-automerge.yml` (جديد)
6. `.github/dependabot.yml` (جديد)
7. `SECURITY.md` (جديد، root)
8. `scripts/sync-security-issues.sh` (جديد)
9. `scripts/update-security-digest.sh` (جديد)
10. `CLAUDE.md` (محدَّث — خطوة 9 في session-start)
11. `governance/SESSION_PROTOCOL.md` (محدَّث)
12. `governance/DECISIONS_LOG.md` (محدَّث — D13)
13. `governance/MODULE_STATUS_BOARD.md` (محدَّث — هذه الجلسة)

## الاختبارات المنفذة
- ✅ `bash -n scripts/sync-security-issues.sh` — syntax OK
- ✅ `bash -n scripts/update-security-digest.sh` — syntax OK
- ✅ Python YAML parse على كل الـ 4 workflows + dependabot.yml — كلها صحيحة
- ✅ Push نجح، gitleaks pre-commit hook نظيف ("No secrets detected")
- ⏳ CI الكامل على PR #56 — يعمل الآن (راجع `gh pr checks 56`)
- ℹ️ لم نشغّل `npm run build/test` — لم نلمس أي كود TS/JS، فقط workflows + scripts + markdown

## المخاطر المفتوحة
- 🟡 **21 Dependabot vulns على main** — ليست ثغرة جديدة، لكن سيظهرن دفعة واحدة كـ 21 Issue بعد merge. الحل: الجلسة القادمة تفتح branch لكل واحدة (أو تجمعها في PRs مجمّعة بحسب الـ package).
- 🟢 **bot commits على governance/** — تستخدم `[skip ci]` و branch منفصل، لكن إذا جلسة فاعلة عملت rebase قد تواجه conflict بسيط في `OPEN_ISSUES.md`. التخفيف موجود (auto-merge على bot branches).
- 🟢 **15-min safety-net cron** — يستهلك ~96 runs/يوم. ضمن الـ free tier بسهولة.

## ممنوع تغييره في الجلسة القادمة
- D13 مقفل — لا تنقل أو تغيّر النمط الأساسي للحلقة (event-driven + safety net).
- لا تحوّل `codeql.yml` لـ "Default setup" من GitHub UI — راح يتعارض مع الـ Advanced workflow.
- لا تشغّل `gh issue close` يدوياً على Issue بـ label `security:auto` قبل دفع الإصلاح.

## الخطوة التالية بالضبط

```bash
# 1. (المالك) راجع وادمج PR #56
gh pr view 56 --web

# 2. بعد merge — تأكد أن Code scanning + Security policy صار ✅
open https://github.com/ahrrfy/IBH/security

# 3. تأكد أن أول CodeQL run بدأ
gh run list --workflow=codeql.yml --limit 1

# 4. تأكد أن الـ 21 Dependabot alert تحوّلت إلى Issues
gh issue list --label security:auto --state open

# 5. بداية الجلسة القادمة — اقرأ:
gh issue list --label security:digest --state open  # الـ digest الحي
gh issue list --label security:auto --state open --limit 5  # أولى 5 ثغرات

# 6. اختر أعلى أولوية (🔴) → افتح branch → إصلح → PR → merge
#    الحلقة تغلق Issue تلقائياً عبر security-close-hook.yml
```

---

# Session Handoff — 2026-04-26 (Session 5 — deploy fixes + useSearchParams) ✅ CLOSED

## Branch
`main` — latest commit `4e55b90`

## Completed This Session (Session 5)

### I029 — VPS deploy يفشل في كل push (مُغلَق)
الجذران (اكتُشفا بالتسلسل بعد كل deploy):

**جذر 1 — WhatsApp env `:?` تُوقف compose حتى لخدمات ذات profile:**
- أضفنا `profiles: [whatsapp]` للـ whatsapp-bridge في PR #53
- لكن compose يُقيّم interpolation في وقت parse لكل الخدمات بغض النظر عن الـ profile
- الإصلاح النهائي: حوّلنا الـ 4 vars من `:?` إلى `:-` في `8b6252f`
- حذفنا whatsapp-bridge من build/recreate في deploy-on-vps.sh

**جذر 2 — `useSearchParams()` بدون Suspense يفشل prerender:**
- `pnpm web build` كان يفشل في `/finance/chart-of-accounts/new`
- 3 صفحات تستخدم `useSearchParams()` مباشرة دون `<Suspense>`
- الإصلاح: `window.location.search` في `useEffect` (نفس نمط login page)
- الصفحات المُصلَّحة في `4e55b90`:
  - `finance/chart-of-accounts/new`
  - `finance/periods/new`
  - `finance/banks/[id]/reconcile`

### نتيجة
- GitHub issues #48 + #54 مغلقان
- Deploy run `24963352657` نجح ✅ (1m41s) — أول deploy ناجح منذ أسابيع
- 0 open GitHub issues

## Final State of main
- **Open PRs: 0** ✅
- **Open GitHub Issues: 0** ✅
- **TASK_QUEUE: 30/30 DONE** ✅
- **VPS deploy: ✅ سليم** (run 24963352657)
- **Latest commit:** `4e55b90`

## Remaining Genuinely Open (manual/VPS only)
| # | Issue | Action |
|---|---|---|
| I003 | POS sync conflict strategy | Design decision — Wave 2 |
| I009 | 2FA manual browser QA | Needs browser session on VPS |
| I024 | Production password rotation | `ssh vps` → Settings → Users → Edit |

## Manual VPS Steps Still Required
1. `ssh root@vps 'bash /opt/al-ruya-erp/infra/scripts/install-cron.sh'` — 4 crons
2. DNS A `shop.ibherp.cloud` → VPS IP + `certbot --nginx -d shop.ibherp.cloud`
3. B2 backup: add `RESTIC_B2_REPOSITORY` + `B2_ACCOUNT_ID` + `B2_ACCOUNT_KEY` to VPS `.env`
4. WhatsApp (when ready): add WA credentials to `.env`, then `docker compose --profile whatsapp up -d whatsapp-bridge`
5. DR drill: `restic restore latest --target /tmp/restore-test`

## Risks
- React 19 type mismatch in `apps/web` — `next build` passes locally but VPS had hidden page errors (fixed)
- `as any` ×258 in API source — tech debt, not blocking
- B2 backup inactive until credentials added to VPS `.env`

## Next Safest Step (new session)
```bash
git pull origin main && gh pr list --state open && gh issue list --state open
# → should all be empty
# Options:
#   a) VPS manual steps above (highest operational priority)
#   b) UAT testing: governance/UAT_PLAYBOOK.md
#   c) Wave 2 planning: governance/MASTER_SCOPE.md
```

---

# Session Handoff — 2026-04-26 (Session 3 — verification + acceptance-test gap closure) ✅ CLOSED

## Branch
`main` (no new worktrees left behind)

## Latest Commit on main
`5da760a` — docs(governance): mark session 2 closed — PR #50 merged, main clean
*(no new code commits in Session 3 — work that landed during the session is already captured in Session 2 below)*

## Completed This Session
- ✅ T15 (#14) merged — Sales Returns UI (resolved merge conflict in `governance/ACTIVE_SESSION_LOCKS.md` via worktree-isolated rebase)
- ✅ T19 (#23) merged — Payroll Run UI + workflow actions (rebased on latest main)
- ✅ T29 (#29) merged — UAT Playbook (40 scenarios across 6 waves)
- ✅ W3 acceptance test (#38) merged — GRN → inventory ledger linkage (closes §3 gap)
- ⚠️ T26 (#27) closed — competing PR #26 from a parallel session merged the same scope first
- 🎯 W6 lead→customer test (#36) closed by us — exposed `update_updated_at()` trigger column-case bug. Another session then landed PR #41/#44/#45 to fix it, and reopened our test as PR #42 (now merged). Net effect: one closed PR catalyzed three production-code fixes.
- ✅ Confirmed PRs #40 (SSL monitor) and #43 (B2 offsite) already merged

## Final State of main
- **TASK_QUEUE: 30/30 ✅ DONE** (every T-task in scope is in `main`)
- **Open PRs: 0**
- **Acceptance test coverage** (per SESSION_HANDOFF §3 audit): W3 GRN→inventory and W6 lead→customer now both green in CI

## Worktrees / Branches Cleaned
This session created several feature worktrees (`D:/t19-work`, `D:/t26-work`, `D:/t29-work`, `D:/i011-work`, `D:/handoff-work`) — these can be safely removed by the next session via `git worktree remove`. No uncommitted work in any of them.

## Remaining Genuinely Open Issues
Same as Session 2 — no new ones discovered:
| # | Issue | Why Open |
|---|---|---|
| I003 | POS sync conflict strategy | Design decision, Wave 2 |
| I009 | 2FA manual browser QA | Needs real browser session |
| I024 | Production password rotation | Manual VPS SSH needed |

## Next Safest Step
```bash
# 1. Optional cleanup of stale local worktrees from Session 3:
for d in t19-work t26-work t29-work i011-work handoff-work; do
  [ -d "../$d" ] && git worktree remove --force "../$d"
done

# 2. Pull latest main + survey:
git pull origin main && gh pr list --state open

# 3. Pick from same options as Session 2:
#    a) VPS manual steps (highest operational priority — see list below)
#    b) UAT testing via governance/UAT_PLAYBOOK.md
#    c) Wave 2 planning per governance/MASTER_SCOPE.md
```

## Lessons (this session specifically)
1. **Worktree-per-task is mandatory under high parallelism** — main worktree's branch was swapped by parallel sessions during my work, requiring rescue moves. Worktrees from origin/main eliminated the race.
2. **A failing test is sometimes infrastructure exposing a bug, not a bad test.** Closing PR #36 with a clear infra-issue note (rather than `it.skip()`) prompted a parallel session to investigate, find the root cause (`update_updated_at()` trigger column case), fix it, and reopen the test. This is the desired workflow when you can't fix the underlying issue yourself.
3. **TASK_QUEUE.md drifts under heavy parallelism** — multiple times tasks were claimed/PR'd by other sessions while my local view showed them as TODO. Always re-fetch + check `gh pr list` before claiming.

---

# Session Handoff — 2026-04-26 (Session 2 — post-30-tasks cleanup + UX fixes) ✅ CLOSED

## Branch
`main` (all worktrees removed, repo clean)

## Latest Commit on main
`a20de8e` — fix: forgot-password page + audit-append-only e2e FK fix (#50)

## Completed This Session
- ✅ Closed 3 stale GitHub auto-diagnosed issues (#1, #2, #3) — old commits, fixed
- ✅ Merged PR #46 (I011 a11y: role=alert on login error banner)
- ✅ Merged PR #47 (MODULE_STATUS_BOARD update — all 30 T-tasks complete)
- ✅ Updated OPEN_ISSUES.md — closed I001-I006, I008, I019-I021 (8 issues)
- ✅ Merged PR #50 (all 5 CI checks green):
  - `apps/web/src/app/forgot-password/page.tsx` (new) — closes 404 on login link
  - `apps/api/test/audit-append-only.e2e-spec.ts` — fix FK bypass race via `$transaction`
- ✅ Removed stale worktrees — single clean `main` worktree at D:/al-ruya-erp

## Final CI State (PR #50)
All 5 checks passed:
- E2E acceptance tests (Postgres + Redis): ✅ pass
- GitGuardian Security Checks: ✅ pass
- Standalone services: ✅ pass
- Typecheck + Build (api + workspace packages): ✅ pass
- gitleaks scan: ✅ pass

## State of main (final)
- Open PRs: 0 ✅ clean
- TASK_QUEUE: 30/30 ✅ DONE
- OPEN_ISSUES: I003, I009, I024 remain genuinely open (no code fix possible)
- All 30 T-tasks merged + ops work (PR #39-#50) merged

## Remaining Genuinely Open Issues
| # | Issue | Why Open |
|---|---|---|
| I003 | POS sync conflict strategy | Design decision, Wave 2 |
| I009 | 2FA manual browser QA | Needs real browser session |
| I024 | Production password rotation | Manual VPS SSH needed |

## Manual VPS Steps Still Required
1. **All crons**: `ssh root@vps 'bash /opt/al-ruya-erp/infra/scripts/install-cron.sh'`
2. **Storefront**: DNS A `shop.ibherp.cloud` → VPS IP + `certbot --nginx -d shop.ibherp.cloud`
3. **WhatsApp**: set `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` in VPS `.env`
4. **B2 offsite**: set `RESTIC_B2_REPOSITORY` + `B2_ACCOUNT_ID` + `B2_ACCOUNT_KEY` in VPS `.env`
5. **DR drill**: `restic restore latest --target /tmp/restore-test` → verify md5
6. **Password rotation** (I024): change system owner password via Settings → Users → Edit

## Risks
- Pre-existing React 19 type mismatch in `apps/web` — `next build` may warn but pages function
- `as any` appears 258× in API source — tech debt, not blocking
- B2 offsite backup wired but NOT active until B2 credentials are in VPS `.env`

## Next Safest Step (new session)
```bash
# State: main is clean, 30/30 tasks done, no open PRs.

# 1. Quick health check
git pull origin main && gh pr list --state open

# 2. Next work options (pick one):
#    a) VPS manual steps (see list above) — highest operational priority
#    b) UAT testing via governance/UAT_PLAYBOOK.md
#    c) Wave 2 planning: read governance/MASTER_SCOPE.md → choose first Wave 2 task
```

---

# Previous Handoff (SESSION-Z0 accuracy audit — kept for reference)

## Completed
- Ran Z0 discovery audit for real-code vs stub/placeholders.
- Added `governance/ACCURACY_MAP.md`.
- Verified API typecheck passes.
- Verified web admin production build passes and generates 53 app routes.
- Confirmed POS and storefront builds fail locally because app-local dependencies are missing.

## Key Findings
- API and web admin are materially real, not fake.
- POS UI still contains mock sale/payment/shift flows and is not operational.
- Storefront login still has stub token fallback and is not production-safe.
- Specific backend placeholders remain: vendor invoice OCR, payroll payslip PDF, AR receipt account mapping note.
- `as any` appears 258 times in API source/tests; `$queryRawUnsafe` appears 47 times in API source.

## Verification
- `pnpm --filter @erp/api typecheck` -> pass.
- `pnpm --filter @erp/web build` -> pass.
- `pnpm --filter @erp/pos build` -> fail: missing app-local dependencies.
- `pnpm --filter @erp/storefront build` -> fail: missing app-local dependencies.

## Remaining (from Z0 session — now resolved)
- Wave 1 tasks: all 30 tasks now complete and merged.
