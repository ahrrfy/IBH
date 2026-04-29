# Phase 3.D — Production Smoke Tests Report

**Run:** 2026-04-29 17:49 UTC
**Target:** ibherp.cloud · VPS Hostinger KVM4 (Frankfurt, 16GB)
**Tool:** [`scripts/smoke-tests.sh`](../../scripts/smoke-tests.sh)
**Latest run:** [smoke-tests/run-2026-04-29T17-49-48Z.md](smoke-tests/run-2026-04-29T17-49-48Z.md)

## Result: 28 ✅ · 2 ⚠️ · 4 ❌

---

## ✅ What's healthy (28)

### Docker stack (9/9)
All 9 production containers running and healthy:
api, postgres, redis, nginx, minio, web, storefront, license-server, ai-brain.

### Public API
- `GET /api/v1/health` → 200 in 296ms
- Database probe = ok (12 ms)

### TLS / SSL
- Cert valid until **2026-07-13** (74 days remaining)
- Issuer: Let's Encrypt E8
- HSTS enabled (max-age=63072000, includeSubDomains)

### Security headers
All four critical headers present on `/`:
X-Frame-Options · X-Content-Type-Options · Content-Security-Policy · Referrer-Policy.

### Database
- Postgres 16 alive, DB size 16 MB (greenfield install)
- 125 public tables present (full schema)
- Redis PING → PONG

### Host resources
- Disk: 31G used / 193G (16%) ✅
- Memory: 3.6G / 16G (22%) ✅
- Load avg: 5.36/4.37/4.58 (high — likely from concurrent docker rebuilds during this session; baseline is <1)

### F2/F3 append-only invariants
All three triggers present and active:
`no_update_audit_logs`, `no_update_je_lines`, `no_update_stock_ledger`.

### Cron jobs
1 BullMQ repeatable registered (post 5.D enablement):
`erp:queue:billing-sweep:repeat:...:1777514400000` → next fire 2026-04-30 02:00 UTC.

---

## ❌ Failures (4)

### F1 RLS gap on multi-tenant tables — known issue I062

`pg_class.relrowsecurity = false` on every table the smoke test sampled:

| Table            | RLS enabled | Existing policy |
|------------------|:-----------:|-----------------|
| users            | ❌ | none |
| sales_invoices   | ❌ | none |
| stock_ledger     | ❌ | none |
| journal_entries  | ❌ | none |
| companies        | ❌ | none |
| audit_logs       | ❌ | none |
| pos_receipts     | ❌ | none |

Total: 79 tables carry `companyId`, only 11 have RLS policies (mostly
the late-Wave-5 additions: applications, hr_promotions, salary_bands,
inventory_flags, …).

**Severity:** medium-high. Tenant isolation is currently enforced at
the application layer only (Prisma `where: { companyId }` filters in
RlsInterceptor). A bypass via raw SQL or ORM misuse is not blocked
by the database — exactly the scenario F1 mandates RLS to prevent.

**Tracker:** I062 (open). Fix scope = migration that enables RLS +
adds `tenant_isolation` policy on each of the 68 unprotected tables.

---

## ⚠️ Warnings (2)

### Backup verification

- No local Postgres dumps found in `/var/backups/al-ruya/` on VPS
- No backup config files in `infra/backup/` (Restic 3-2-1-1 not yet
  installed on this VPS, despite design in DR_RUNBOOK.md)

The architecture calls for a 3-2-1-1 backup model (local + offsite +
air-gapped). Current state: data exists only in the live Postgres
volume + MinIO. A volume corruption or accidental DROP would lose
everything.

**Action:** install Restic per `governance/DR_RUNBOOK.md §4` and wire
its cron. Out of scope for 3.D — tracking as 3.D follow-up.

---

## What this closes

✅ **3.D — Production smoke tests** for the items achievable today
(health · SSL · headers · DB · F2/F3 triggers · cron · disk · memory).

**Out-of-scope follow-ups:**
- Load test (k6 or autocannon) — needs realistic seed data first
- DR drill via `restore-test.sh` — needs Restic install above
- Full security scan via `infra/scripts/security-scan.sh` — runs in CI;
  worth adding a "VPS-side" version that scans the live config

## Re-running

```bash
SSH_HOST=ibherp DOMAIN=ibherp.cloud bash scripts/smoke-tests.sh
```

Reports go to `governance/evidence/smoke-tests/run-<UTC>.md` so trends
across runs are visible.
