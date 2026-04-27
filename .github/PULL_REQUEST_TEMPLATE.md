<!--
For task PRs (feat/tNN-...), this template is required.
The orchestrator (`bash scripts/orchestrator/task.sh complete`) auto-creates and
auto-merges; the human-readable Evidence section below is your professional record.
-->

## Task

<!-- e.g. "T34 — Sales Quotations" — must match TASK_QUEUE.md -->

## Summary

<!-- 1-3 sentences. What changed and why. -->

## Files changed

<!-- bullet list, oriented by what they do, not just paths -->

## Evidence (no fake completion)

- [ ] `apps/api` typecheck clean — `pnpm --filter @erp/api exec tsc --noEmit`
- [ ] `apps/web` typecheck clean — `pnpm --filter @erp/web exec tsc --noEmit`
- [ ] Targeted tests written/updated and passing
- [ ] If schema changed: migration file added, `prisma migrate dev` ran clean
- [ ] If F2 (accounting): double-entry constraint preserved + reversal flow tested
- [ ] If F3 (inventory): StockLedger append-only honored + no negative balance path
- [ ] If F1 (RBAC): RLS policy added/verified for any new table with `companyId`/`branchId`
- [ ] CI green (typecheck, e2e, codeql, gitleaks)

## Verification log

<!--
Paste actual command output proving the task works end-to-end.
Empty section = the PR will be requested to add evidence before merge.
-->

```
$ pnpm --filter @erp/api exec tsc --noEmit
(no output)

$ pnpm --filter @erp/web exec tsc --noEmit
(no output)
```

## Risks

<!-- What could break? Is this reversible? -->

## Linked issues / docs

<!-- Closes #N, refs governance/OPEN_ISSUES.md#IXXX -->
