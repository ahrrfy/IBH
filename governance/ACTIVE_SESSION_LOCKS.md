# ACTIVE_SESSION_LOCKS.md

Purpose: prevent parallel agents from repeating I020 by making active ownership explicit.

This file is the coordination point for Codex, Claude Code, and any other agent working
on this repository at the same time. Before editing, every session must claim a bounded
scope here or in the latest session handoff.

## Rules

1. Do not edit `main` directly from parallel sessions.
2. Do not let two sessions own the same business flow.
3. Do not let two sessions edit the same file at the same time.
4. Shared contract files require an explicit lock before editing.
5. If a needed file is already locked, stop and report the collision.
6. Each branch must finish with verification evidence before merge.
7. Only the integration owner merges or sequences branches into `main`.

## Shared Contract Files

These files are high-collision surfaces. Treat them as locked unless a session explicitly
claims them.

| Path | Why It Is Shared | Lock Required |
|---|---|---|
| `apps/api/prisma/schema.prisma` | DB contract for all modules | Yes |
| `apps/api/prisma/seed.ts` | Test/runtime baseline data | Yes |
| `pnpm-lock.yaml` | Workspace dependency graph | Yes |
| `package.json` | Workspace scripts and dependencies | Yes |
| `turbo.json` | Build pipeline contract | Yes |
| `.github/workflows/*` | CI/deploy behavior | Yes |
| `governance/*` | Project source of truth | Yes |
| `packages/shared-types/*` | API/UI type contracts | Yes |
| `packages/validation-schemas/*` | Input validation contracts | Yes |

## Active Sessions

| Session ID | Agent | Branch | Owned Scope | Allowed Files | Forbidden Files | Status |
|---|---|---|---|---|---|---|
| COD-I020-LOCK | Codex | `codex/fix-i020-parallel-lock` | Parallel-session governance guard | `governance/ACTIVE_SESSION_LOCKS.md` | Business modules, Prisma schema, frontend pages | Closed |
| SESSION-Z0 | Codex Audit Agent | `agent/z0-audit` | Accuracy audit and stub map | `governance/ACCURACY_MAP.md`, `governance/SESSION_HANDOFF.md`, `governance/ACTIVE_SESSION_LOCKS.md` | Business modules, Prisma schema, frontend pages, runtime config | Closed |
| claude-opus-4-7-20260426-1 | Claude Code (Opus 4.7) | `feat/t01-backup-cron` | T01 — Backup cron schedule + DR runbook | `infra/scripts/backup-cron.sh`, `infra/scripts/install-cron.sh`, `governance/DR_RUNBOOK.md`, `governance/TASK_QUEUE.md`, `governance/ACTIVE_SESSION_LOCKS.md` | Business modules, Prisma schema, frontend pages | Closed (merged in PR #6 / fa3aeee on 2026-04-26T15:08:04Z) |
| claude-opus-4-7-20260426-6 | Claude Code (Opus 4.7) | `feat/t12-grn-fe` | T12 — GRN UI (list + new + detail) + sidebar entry | `apps/web/src/app/(app)/purchases/grn/**`, `apps/web/src/components/sidebar.tsx`, `governance/TASK_QUEUE.md`, `governance/ACTIVE_SESSION_LOCKS.md` | Business modules, Prisma schema, other frontend pages | Active |

## Integration Owner

Current integration owner: unassigned.

Until assigned, no parallel branch should merge to `main` without a manual review of:

- `git diff --stat`
- `git diff --check`
- relevant build/test output
- overlap with this lock table
- latest `governance/SESSION_HANDOFF.md`

## Claim Template

Copy one row into Active Sessions before work starts:

| Session ID | Agent | Branch | Owned Scope | Allowed Files | Forbidden Files | Status |
|---|---|---|---|---|---|---|
| `SESSION-ID` | `Agent name` | `branch-name` | `one flow only` | `paths` | `paths` | `Active` |

## Closure Checklist

Before marking a session closed:

- Owned files are committed or explicitly abandoned.
- Verification commands and outcomes are recorded.
- Any failed verification is documented as a risk.
- Handoff includes next safest step.
- Status changes from `Active` to `Closed` or `Blocked`.

## Active Locks (live)

- **T13** | session: `claude-opus-4-7-20260426-3` | branch: `feat/t13-transfers-fe` | files: `apps/api/src/modules/inventory/inventory.{controller,service}.ts`, `apps/web/src/app/(app)/inventory/transfers/**` | started: 2026-04-26T16:30:00Z

_(T01 closed 2026-04-26T15:08:04Z via PR #6 — fa3aeee)_
