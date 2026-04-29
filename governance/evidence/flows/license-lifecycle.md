# Flow 4 — License Lifecycle
## G5 Evidence: End-to-End Business Flow

**Wave:** 6 (Licensing)
**Flow:** Tenant signup → Trial 30d → Trial expiry warning → 7d grace → Read-only mode → Renewal → Full access

---

## Pre-conditions

- Super-admin role
- `LICENSE_SERVER_URL` set in env
- RSA key pair generated (in VPS `.env`)

---

## Steps

### Step 1 — Create Tenant + Issue Trial License

```
POST /licensing/subscriptions
{
  "tenantId": "<company-id>",
  "plan": "starter",
  "trialDays": 30
}
```

**Expected:**
- Subscription created with `status = trial`
- `trialEndsAt = NOW() + 30 days`
- License signed with RSA-2048 private key

**Evidence file:** `wave6/api-captures/license-create.json`

---

### Step 2 — Verify Feature Gating

```
GET /licensing/feature-flags?companyId={id}
```

**Expected (starter plan):**
- `pos: true`
- `multi_branch: false`
- `ai_assistant: false`
- `advanced_reports: false`

**Web guard check:**
```
GET /finance/reports/income-statement  (requires advanced_reports)
```
**Expected:** 403 with `feature_not_available` code

---

### Step 3 — Simulate Trial Expiry (30 days later)

**Admin action:**
```
PATCH /licensing/subscriptions/{id}/simulate-expiry
{ "advanceDays": 31 }
```

*(Only available in non-production environments)*

**Expected:**
- BullMQ `trial.expiry-check` cron fires
- Email notification sent (check logs)
- License status → `trial_expired`
- System enters 7-day grace period

---

### Step 4 — Grace Period Behavior

**During grace (days 31-37):**
```
GET /licensing/subscriptions/{id}
```
**Expected:** `status = grace`, `graceEndsAt` set

**API behavior during grace:**
- Read operations: ✅ still work
- Write operations: ✅ still work (7-day grace)
- License endpoint: returns `grace` status header

---

### Step 5 — Read-Only Mode (after grace expires)

**Simulate end of grace:**
```
PATCH /licensing/subscriptions/{id}/simulate-expiry
{ "advanceDays": 8 }
```

**Expected:**
- Status → `expired`
- API returns `X-License-Status: expired` header on all requests
- Write operations return 402 Payment Required
- POS offline mode still works for 7 days (cached license)

---

### Step 6 — License Renewal

```
POST /licensing/subscriptions/{id}/renew
{
  "plan": "professional",
  "durationMonths": 12,
  "amountIqd": 3600000
}
```

**Expected:**
- `status → active`
- `expiresAt = NOW() + 12 months`
- Plan upgraded: `multi_branch: true`, `advanced_reports: true`
- Redis cache invalidated (T31 event published)
- Invoice record created in `license_invoices`

**Evidence file:** `wave6/api-captures/license-renew.json`

---

### Step 7 — Hardware Fingerprint (Tauri POS)

*Desktop only — requires running Tauri app*

```
POST /licensing/devices/register
{
  "licenseId": "<license-id>",
  "fingerprint": "<sha256-hardware-hash>",
  "deviceName": "Main Cashier POS"
}
```

**Expected:** Device registered, counted against plan's `maxDevices` limit

---

### Step 8 — Billing Dashboard

```
GET /licensing/billing/dashboard
```

**Expected:**
- MRR (Monthly Recurring Revenue)
- Active subscriptions by plan
- Churned this month
- LTV distribution

**Evidence file:** `wave6/api-captures/billing-dashboard.json`

---

## Invariants to Verify

| Invariant | Check | Pass Condition |
|-----------|-------|----------------|
| RSA signature valid | `openssl rsautl -verify` on license token | Passes |
| Feature gate enforced at API level | Call gated endpoint without feature | 403 |
| Grace period exactly 7 days | Check `graceEndsAt - trialEndsAt` | = 7 days |
| Redis cache TTL | `TTL licensing:features:{companyId}` | ≤ 300s |
| Audit trail | `audit_logs` for all status changes | Present |
| Max devices enforced | Register device #(maxDevices+1) | 422 rejected |

---

## Screenshots Required

- [ ] License admin dashboard (tenant list + plan badges)
- [ ] Feature flags table (per-company toggle grid)
- [ ] Trial expiry banner in web UI
- [ ] Read-only mode indicator
- [ ] Renewal confirmation + new expiry date
- [ ] MRR/Churn analytics chart
