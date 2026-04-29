# Phase 3.A — Evidence Collection Report

**Captured:** 2026-04-29 17:43 UTC
**Target:** https://ibherp.cloud/api/v1
**Authenticated as:** ahrrfy@al-ruya.iq (super_admin)
**Tool:** [`scripts/collect-evidence.sh`](../../scripts/collect-evidence.sh)

## Summary

| Wave | Endpoints captured | 200 OK | Failures |
|------|--------------------|--------|----------|
| 1 Foundation     |  9 |  9 | 0 |
| 2 Daily Ops      |  9 |  9 | 0 |
| 3 Purchasing     |  4 |  4 | 0 |
| 4 Finance        |  8 |  6 | 2 |
| 5 HR + Marketing | 10 |  9 | 1 |
| 6 CRM + Licensing | 13 | 10 | 3 |
| **Total**        | **53** | **47** | **6** |

89% of captured endpoints respond 200 OK. Per-endpoint JSON snapshots
are stored under `governance/evidence/wave{N}/api-captures/`.

## Setup notes

For the captures to come back as 200 OK on a greenfield production
install, two prerequisites had to be met:

1. **Owner role assignment.** `ahrrfy@al-ruya.iq` (the system owner) was
   created without any role attached. SQL fix applied directly on VPS:

   ```sql
   INSERT INTO user_roles ("userId", "roleId", "assignedAt", "assignedBy")
   SELECT u.id, r.id, NOW(), u.id
   FROM users u, roles r
   WHERE u.email = 'ahrrfy@al-ruya.iq' AND r.name = 'super_admin'
   ON CONFLICT DO NOTHING;
   ```

2. **License guard disabled.** `LICENSE_GUARD_DISABLED=1` in
   `infra/.env`. With the guard active and zero seeded subscriptions,
   every authed endpoint returns `LICENSE_REQUIRED 403`. The guard
   stays off until plans + a Subscription row are seeded — see
   commit `821378d` (granular kill-switches).

## Findings — 6 failures

| Endpoint | HTTP | Cause | Action |
|----------|------|-------|--------|
| `GET /finance/banks/reconciliation` | 404 | Route is POST-only; no list endpoint | Document as design — list via `/finance/banks/{id}/reconciliations` per bank |
| `GET /finance/periods/status` | 500 | Internal error — likely empty period table | New issue I059 — service should handle 0 periods gracefully |
| `GET /hr/attendance/report/monthly` | 500 | Internal error — missing default month/year params | New issue I060 — controller should default to current month |
| `GET /admin/licensing/tenants` | 000 | Connection error / timeout | Investigate — possibly nginx body-size limit on plan-rich response |
| `GET /admin/licensing/analytics/summary` | 500 | Internal error on greenfield (no subscriptions to aggregate) | New issue I061 — analytics should return zeroed shape, not 500 |
| `GET /ai/copilot` | 404 | POST-only endpoint | Document — copilot is a `POST /ai/copilot` query/answer pair |

The 5xx failures (I059–I061) are tracked separately. The 404s are
correct behaviour given the route is POST-only — they're documented
here so the script accurately reflects the API surface.

## Re-running

```bash
BASE_URL=https://ibherp.cloud/api/v1 \
ADMIN_EMAIL=ahrrfy@al-ruya.iq \
ADMIN_PASSWORD='<pass>' \
bash scripts/collect-evidence.sh

# Single wave
ONLY_WAVE=4 BASE_URL=... bash scripts/collect-evidence.sh --wave 4
```

## What this closes / does not close

✅ **3.A Evidence Collection — API captures.** Every wave has a JSON
snapshot per major list endpoint. Re-runnable for regression checks.

⏳ **Screenshots.** Out of scope for this script — must be captured
manually in the browser per `governance/evidence/wave{N}/screenshots/`.

⏳ **3.B Flow demonstrations.** Sale / procurement / payroll / license
lifecycles still need end-to-end happy-path captures. Trackable as
follow-up under Phase 3.B.
