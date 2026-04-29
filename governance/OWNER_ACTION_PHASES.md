# Owner-Action Phases — Runbooks for Phases that Require Human/External Access

These phases cannot be executed by Claude Code alone. Each section is a
self-contained runbook the project owner can follow.

---

## Phase 3.A — Evidence Collection (~20h)

**Goal:** Capture screenshots + API responses for every wave, proving the system works.

**Tools needed:**
- Browser (Chrome / Edge)
- Built-in screenshot tool (Snipping Tool / `Win+Shift+S`)
- httpie or curl
- Logged-in admin session

**Process per wave:**

1. **Set up `governance/evidence/wave{N}/` directory:**
   ```bash
   mkdir -p governance/evidence/wave{1,2,3,4,5,6}/{screenshots,api-captures,flows}
   ```

2. **Wave 1 (Foundation):**
   - Login flow → screenshot login.png, 2fa.png, dashboard.png
   - User management → screenshot users-list.png, role-matrix.png
   - Audit log viewer → screenshot audit-viewer.png
   - Products → screenshot products-list.png, product-detail.png
   - Inventory dashboard → screenshot inventory-balance.png
   - API captures: `GET /users`, `GET /products`, `GET /inventory/balance`

3. **Wave 2 (Daily Operations):**
   - POS sale (full flow) → 4 screenshots: cart, payment, receipt-print, completion
   - Delivery dashboard → screenshot deliveries-list.png + status-update.png
   - Quotation → SalesOrder → Invoice chain → 3 screenshots showing each step
   - Returns flow → screenshot return-form.png + refund-receipt.png
   - 17 reports → screenshot one or two key reports

4. **Wave 3 (Purchasing):**
   - PO creation, GRN with quality hold flag, 3-way match dashboard, vendor invoice posting

5. **Wave 4 (Finance):**
   - CoA tree, journal entry form, trial balance, bank recon, period close 7-step,
     financial reports (BS/IS/CF/Equity), depreciation schedule

6. **Wave 5 (HR):**
   - Employee onboarding wizard, attendance kiosk, leave approval flow, payroll run,
     recruitment pipeline kanban, promotion request

7. **Wave 6 (CRM/Licensing):**
   - Lead scoring, customer 360 view, license activation, trial expiry banner,
     feature gate UI, autopilot exception dashboard

**Deliverable:** Screenshots + JSON API captures for each wave in `governance/evidence/`.

---

## Phase 3.B — End-to-End Flow Demonstrations (~10h)

Document complete business flows by capturing each step with screenshots + API trace.

### Flow 1: Sale Lifecycle

```
Customer → Quote (₿500K) → Approval → SalesOrder
  → Invoice (POS or web) → Stock decrease
  → COGS JE auto-posted (DR Inventory, CR Cash)
  → AR ledger entry
  → Payment receipt → AR cleared
```

For each step, capture:
- Screenshot showing UI state
- API request/response (curl)
- DB row before/after (psql)
- Audit log entry

### Flow 2: Procurement Lifecycle

```
Supplier → PO (PO-2026-001, ₿2M) → Approval
  → GRN (quality check) → Stock increase
  → Vendor invoice received
  → 3-way match (PO ↔ GRN ↔ Invoice) → AP posting
  → Payment voucher → AP cleared
```

### Flow 3: Payroll Lifecycle

```
Employee data → Attendance (30 days)
  → Payroll run (calc Iraqi tax brackets, SS, OT)
  → JE auto-posted (DR Salary Expense, CR Tax Payable, CR SS Payable, CR Cash)
  → Bank transfer file (CBS export)
  → Audit trail
```

### Flow 4: License Lifecycle

```
Tenant signup → Trial start (30d countdown banner)
  → Trial expiry (last 7d warning emails)
  → Trial end → 7d grace period (read-only mode)
  → Renewal payment → Full access restored
```

**Deliverable:** `governance/evidence/flows/flow{1-4}.md` with embedded screenshots
and API trace links.

---

## Phase 3.D — Production Smoke Tests (~10h)

### D.1 — Health Check (1h)

```bash
ssh root@ibherp.cloud
cd /opt/al-ruya-erp
docker compose ps
# Expected: all 8 services "healthy" or "running"
#   postgres, redis, api, web, pos, storefront, whatsapp-bridge, license-server

# Each service responds
curl -s -o /dev/null -w "%{http_code}\n" https://ibherp.cloud/api/health   # 200
curl -s -o /dev/null -w "%{http_code}\n" https://ibherp.cloud              # 200
curl -s -o /dev/null -w "%{http_code}\n" https://shop.ibherp.cloud         # 200 (after S1.10)
```

### D.2 — SSL Validity (30min)

```bash
echo | openssl s_client -servername ibherp.cloud -connect ibherp.cloud:443 2>/dev/null \
  | openssl x509 -noout -dates -subject
# Expected: notAfter > 30 days from now
```

### D.3 — Backup Verification (2h)

```bash
# 1. Verify last 7 days of backups exist on VPS + remote
restic -r $RESTIC_REPO snapshots --last 7

# 2. Restore drill on a separate VPS or local Docker
restic -r $RESTIC_REPO restore latest --target /tmp/restore-test
ls /tmp/restore-test/postgres-backup.dump.gz

# 3. Bring up a temporary postgres + restore
docker run -d --name pg-restore-test -e POSTGRES_PASSWORD=test pgvector/pgvector:pg16
gunzip -c /tmp/restore-test/postgres-backup.dump.gz | \
  docker exec -i pg-restore-test pg_restore -U postgres -d postgres
docker exec pg-restore-test psql -U postgres -c "SELECT count(*) FROM users;"
# Expected: matches production count

# 4. Cleanup
docker rm -f pg-restore-test
rm -rf /tmp/restore-test
```

### D.4 — Load Test (4h)

Use [k6](https://k6.io/) or autocannon:

```bash
# Install k6
sudo apt install k6

# Create scenarios/pos-sale.js with 10 VUs hitting POS endpoints
# Create scenarios/web-mixed.js with 5 VUs hitting /products /customers /reports

# Run
k6 run --vus 15 --duration 5m scenarios/pos-sale.js
k6 run --vus 5  --duration 5m scenarios/web-mixed.js
```

**Pass criteria:**
- p95 response time < 2000ms
- Error rate < 0.5%
- DB connection pool not saturated (Postgres `pg_stat_activity` < 80% of max)
- No OOMKilled events on API container

### D.5 — Security Audit (2h)

```bash
# Run the existing security scan
bash /opt/al-ruya-erp/scripts/security-scan.sh

# Verify:
# 1. Rate limiting active
curl -X POST https://ibherp.cloud/auth/login -d 'email=x&password=x' -H 'Content-Type: application/json' --silent --output /dev/null --write-out "%{http_code}\n" 
# Repeat 100x in a tight loop — should start returning 429 after ~10

# 2. CSP headers set
curl -I https://ibherp.cloud | grep -i "content-security-policy"

# 3. RLS active on multi-tenant tables
psql $DATABASE_URL -c "SELECT relname, relrowsecurity FROM pg_class WHERE relrowsecurity=true LIMIT 20;"

# 4. No secrets in repo
bash /opt/al-ruya-erp/scripts/security-scan.sh --secrets-only
```

---

## Phase 4 — UAT & Launch (~53h)

### 4.A — Pre-UAT Setup (~11h)

1. **Data migration plan (4h):** Write CSV import scripts for products, customers,
   opening balances. Test with sample data.

2. **Staging environment (4h):** Spin up `staging.ibherp.cloud` subdomain
   pointing to a separate Docker Compose stack on VPS (or use the existing
   stack with a different DB schema).

3. **3 UAT accounts (1h):** Create branch_manager, cashier, accountant users with
   appropriate role bitmasks. Document credentials in 1Password / KeePass for
   secure handoff to UAT testers.

4. **Realistic test dataset (2h):** Run `pnpm --filter api exec tsx prisma/uat-seed.ts`
   then layer on 50-100 historical sales invoices via the SalesInvoiceService
   (use a script that calls the service in batch — preserves F2/F3 invariants).

### 4.B — UAT Execution (~17h + 20h buffer for fixes)

Drive 2-3 real users through `governance/UAT_PLAYBOOK.md` scenarios over 3-4 days.

**Schedule:**
- Day 1: Wave 1 (login, users, products, inventory) + Wave 2 (POS, delivery, sales)
- Day 2: Wave 3 (purchasing) + Wave 4 (finance)
- Day 3: Wave 5 (HR) + Wave 6 (CRM, licensing)
- Day 4: Triage findings, P0/P1 fix sprint

**P0/P1 fix budget:** 20 hours (assume 5-10 unknown issues, 2h each).

### 4.C — Launch (~4h)

1. Final production deploy (1h)
2. DR drill per `DR_RUNBOOK.md` (2h) — practice the full restore in <30min
3. Mark all G4/G5/G6 gates complete in `MODULE_STATUS_BOARD.md` (1h)
4. Close out launch in `DECISIONS_LOG.md`

---

## Phase 5.B — Dependency Upgrades (~30h)

**Order matters — this sequence prevents compounding breakage:**

### 5.B.1 — TypeScript 5.9 → 6.0 (4h, MEDIUM risk)

Already in progress per uncommitted local changes. To resume:
```bash
git diff package.json
# Verify "typescript": "6.0.3" override is present
pnpm install --frozen-lockfile=false
pnpm --filter api typecheck   # Should pass
pnpm --filter web typecheck   # Should pass
```
Verify: ~258 `as any` sites still compile cleanly.

### 5.B.2 — Tailwind 3 → 4 (8h, HIGH risk per I041)

Already merged in commit `69e0603`. Verify with:
```bash
pnpm --filter web build && pnpm --filter pos build && pnpm --filter storefront build
# Open key pages in browser and spot-check styling
```

### 5.B.3 — Prisma 6 → 7 (8h, CRITICAL risk per I040)

**This is the highest-risk upgrade.** Steps:
1. Verify uncommitted local changes are correct:
   - `apps/api/package.json` — `@prisma/client@7.8.0`, `@prisma/adapter-pg`, `pg`
   - `apps/api/prisma.config.ts` — new file
   - `apps/api/src/platform/prisma/prisma.service.ts` — driver-adapter pattern

2. Run full e2e suite:
   ```bash
   pnpm install --frozen-lockfile=false
   pnpm --filter api exec prisma generate
   pnpm --filter api test:e2e
   ```
   ALL 35 suites must pass.

3. Verify F1/F2/F3 invariants still enforced:
   - F1 (RLS): Connect as a non-admin user, attempt cross-tenant query → expect 0 rows
   - F2 (double-entry): Attempt to create unbalanced JE via raw SQL → expect trigger reject
   - F3 (MWA): Verify stock_ledger triggers still fire on insert

4. Deploy to staging, run for 1 week with real data flowing
5. Deploy to production with hot-rollback ready

### 5.B.4 — NestJS ecosystem (4h, MEDIUM risk)

```bash
pnpm --filter api add @nestjs/swagger@11 @nestjs/bull@11 @nestjs/config@4
pnpm --filter api typecheck && pnpm --filter api test:e2e
```

### 5.B.5 — Frontend libs (6h, MEDIUM risk)

```bash
pnpm --filter web add react-router-dom@7 recharts@3 zod@4
pnpm --filter web typecheck && pnpm --filter web build
# Manually test top 20 pages in browser
```

---

## Phase 5.C — Native App Shipping (~16h)

### 5.C.1 — POS Tauri Windows Signing (4h)

**Owner must purchase:** Authenticode certificate (~$200/year from DigiCert/Sectigo).

```bash
# 1. Set GitHub secrets:
#    TAURI_WIN_CERT_BASE64 = base64-encoded .pfx
#    TAURI_WIN_CERT_PASSWORD

# 2. Trigger release workflow
gh workflow run pos-release.yml -f version=1.0.0

# 3. Verify signed binary
signtool verify /pa /v dist/pos-setup-1.0.0.exe
```

### 5.C.2 — POS Tauri macOS Signing (4h)

**Owner must:** Enroll in Apple Developer Program ($99/year).

```bash
# 1. Set GitHub secrets:
#    APPLE_CERTIFICATE, APPLE_CERTIFICATE_PASSWORD, APPLE_SIGNING_IDENTITY,
#    APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID

# 2. Trigger same workflow on macOS runner
```

### 5.C.3 — Mobile EAS Credentials (4h)

**Owner must:** Set up Expo, Apple, and Google accounts.

```bash
# 1. Set GitHub secret EXPO_TOKEN
# 2. Set up Apple App Store Connect API key + Google Play Service Account
# 3. Trigger eas-build.yml
```

### 5.C.4 — SQLCipher Activation (4h, no external blocker)

POS Tauri uses SQLite for offline mode. Currently unencrypted. To activate
SQLCipher:

```bash
# 1. Replace better-sqlite3 with @journeyapps/sqlcipher in apps/pos/package.json
# 2. Update src-tauri/src/db.rs to pass PRAGMA key = ?
# 3. Generate per-device key from hardware fingerprint (T62 already exists)
# 4. Test offline-mode receipts encrypt/decrypt correctly
```

---

## Status Tracking

After each phase completes, update `governance/MODULE_STATUS_BOARD.md`:
- Phase 3 → mark G5 ✅ for the wave
- Phase 4 → mark G6 ✅
- Phase 5.B/C → update Dependency Health table

---

**Date:** 2026-04-29 — Session 25 (Phase 5 closeout)
**Status:** All Claude-executable Phase work is COMPLETE; remaining phases need owner action.
**Next session:** Owner runs sections of this runbook in order; Claude assists with code-level fixes if UAT reveals P0/P1 bugs.
