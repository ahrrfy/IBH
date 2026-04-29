# T70 BillingSweep Cron — RCA + Production Enablement Runbook

## Context

The `BillingSweepProcessor` was disabled after the I047 incident where Bull
processors crashed dev/prod when Redis wasn't configured. Phase 5.D requires
a clean RCA before re-enabling.

---

## Root Cause Analysis (I047)

### What broke

Bull processors loaded eagerly at module init and threw a fatal error when
Redis connection failed (e.g. `ECONNREFUSED localhost:6379` in dev where
no Redis container was running). This crashed the whole API boot, taking
down every endpoint — not just the billing one.

### Evidence (from current code at `apps/api/src/modules/admin/licensing/billing-sweep.processor.ts`)

The fix has already been applied:

```ts
// Line 25 — Optional() injection means the queue can be undefined
constructor(
  @Optional() @InjectQueue(BILLING_SWEEP_QUEUE) private readonly queue: Queue | undefined,
  private readonly billing: BillingService,
) {}

// Line 30 — guard against undefined queue
async onModuleInit(): Promise<void> {
  if (!this.queue) return;
  try {
    // ... schedule cron
  } catch (err) {
    this.logger.warn(`Failed to schedule billing sweep cron: ${err}`);
  }
}

// Line 63 — error in handler does NOT crash the API,
// just gets logged + thrown for Bull's retry mechanism
catch (err) {
  this.logger.error(`Billing sweep failed: ${err}`);
  throw err;
}
```

### Why it's safe to re-enable now

1. **`@Optional()` injection**: If `BullModule.registerQueueAsync()` fails to
   register the queue, the processor still loads but `this.queue` is `undefined`.
   `onModuleInit` short-circuits at line 30. No crash.

2. **try/catch around scheduling**: Even if Redis is reachable but the queue
   API throws (transient network blip), it's logged at WARN level and
   execution continues.

3. **Idempotent business logic**: `BillingService.generatePeriodInvoices()`
   uses a unique constraint on `(subscriptionId, periodStart, periodEnd)`.
   Re-running creates zero duplicates — at worst, you get a few skipped rows.

4. **Bounded queue retention**:
   - `removeOnComplete: 50` (last 50 successful runs only)
   - `removeOnFail: 20` (last 20 failures only)
   No memory leak risk from runaway queues.

---

## Production Enablement Runbook

### Pre-flight checks

```bash
# 1. Verify Redis is healthy on VPS
docker compose -f /opt/al-ruya-erp/infra/docker-compose.bootstrap.yml ps redis
docker exec -it $(docker ps -qf name=redis) redis-cli ping
# Expected: PONG

# 2. Verify the billing module is wired in
grep "BillingSweepProcessor" /opt/al-ruya-erp/apps/api/src/modules/admin/licensing/licensing-admin.module.ts
# Expected: import + providers entry

# 3. Verify generatePeriodInvoices works manually before enabling cron
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://ibherp.cloud/admin/billing/generate
# Expected: { scanned: N, created: M, skipped: K }
```

### Enabling the cron

The cron is **already self-scheduling** at module init via `onModuleInit`.
To enable in production:

1. **Ensure `REDIS_URL` is set** in `/opt/al-ruya-erp/.env`:
   ```
   REDIS_URL=redis://redis:6379
   ```

2. **Restart API**:
   ```bash
   docker compose -f /opt/al-ruya-erp/infra/docker-compose.bootstrap.yml restart api
   docker compose logs api 2>&1 | grep -i "billing sweep"
   ```
   Expected log: `Billing sweep cron scheduled (02:00 UTC daily)`

3. **Verify the repeatable was registered**:
   ```bash
   docker exec -it $(docker ps -qf name=redis) redis-cli \
     KEYS 'bull:billing-sweep:*'
   ```
   Expected: keys like `bull:billing-sweep:repeat:billing-sweep-daily:...`

### Monitoring

After enablement, watch for the first 02:00 UTC run:

```bash
# 1. Live tail
docker compose logs -f api 2>&1 | grep -i "billing sweep"

# Expected at 02:00 UTC:
# [BillingSweepProcessor] Billing sweep starting
# [BillingSweepProcessor] Billing sweep done — scanned: N, created: M, skipped: K

# 2. Inspect created invoices
psql $DATABASE_URL -c "
  SELECT id, \"subscriptionId\", \"periodStart\", \"periodEnd\", \"totalIqd\", status, \"createdAt\"
  FROM license_invoices
  WHERE \"createdAt\" >= NOW() - INTERVAL '1 day'
  ORDER BY \"createdAt\" DESC LIMIT 20;"
```

### Rollback (if it crashes again)

```bash
# 1. Set env var to disable sweep at boot (graceful — uses @Optional())
echo "BILLING_SWEEP_DISABLED=true" >> /opt/al-ruya-erp/.env

# 2. Add this guard at the top of onModuleInit() in billing-sweep.processor.ts:
#    if (process.env.BILLING_SWEEP_DISABLED === 'true') return;

# 3. Restart API; cron stops scheduling but existing invoices remain valid.
docker compose restart api
```

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Redis unavailable at boot | LOW | LOW | `@Optional()` short-circuits — no crash |
| Concurrent runs (manual + cron) | LOW | LOW | DB unique constraint dedupes |
| Slow `generatePeriodInvoices` query blocks queue | LOW | MEDIUM | Query is bounded by active subscriptions count (~hundreds, not millions) |
| Bull queue grows unbounded | NIL | NIL | `removeOn{Complete,Fail}` enforced |
| Schema drift breaks query | LOW | HIGH | Unit test `billing.service.spec.ts` catches this in CI |

**Verdict:** ✅ Safe to enable in production. The original I047 crash was a
boot-time issue, not a runtime issue, and the boot-time guards are now in
place.

---

## Files referenced

- `apps/api/src/modules/admin/licensing/billing-sweep.processor.ts` — the cron
- `apps/api/src/modules/admin/licensing/billing.service.ts` — business logic
- `apps/api/src/modules/admin/licensing/__tests__/billing.service.spec.ts` — unit tests
- `apps/api/src/modules/admin/licensing/billing.controller.ts` — manual trigger endpoint

---

**Date:** 2026-04-29 — Session 25 (Phase 5.D RCA)
**Status:** Ready for production enablement after Redis verification on VPS
**Owner action required:** Run the runbook on VPS — cannot be done by Claude Code
