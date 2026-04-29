# SESSION_HANDOFF.md

---

## Session 28 — 2026-04-29 — Production auth routing fix (I051)

### Branch: main
### Latest commit: fbb4941
### Pushed to origin: ✅

---

### Completed this session

| # | What | Commit |
|---|------|--------|
| 1 | I051 — Fix production auth bug: clicking modules redirects back to login. Six compounding root causes addressed: middleware double-/api URL, cookie max-age=900s race, missing root pages, missing PROTECTED_PREFIXES, missing API_INTERNAL_URL env, login page no auto-redirect. | `fbb4941` |
| 2 | OPEN_ISSUES: closed I051; opened I052 (licensing/me/features 404 root cause), I053 (WebSocket fail), I054 (no refresh-token client flow), I055 (auth rate limit too tight). | (handoff) |

> **Note:** commit `fbb4941`'s message says "fix(storefront): add public/" because of a hooks race that swapped messages — the actual content includes the auth fix. Verified via `git show --stat fbb4941`.

---

### What remains (by who)

#### Claude can do immediately

| Item | Issue | Effort | Notes |
|------|-------|--------|-------|
| Diagnose `/licensing/me/features` 404 | I052 | M | After VPS deploys I051, check if route is actually mapped. May need module import order fix in `app.module.ts`. |
| Add WebSocket upgrade headers in host vhost | I053 | S | Edit `infra/nginx/host-vhost-ibherp.conf` — add a dedicated `location /socket.io/` block with `proxy_http_version 1.1` + `Upgrade` + `Connection "upgrade"`. |
| Implement refresh-token client flow | I054 | M | `api.ts` 401 handler should try `refreshToken` once before clearing session. |
| Tune auth rate limit | I055 | S | `infra/nginx/conf.d/bootstrap.conf` — raise erp_auth to 30r/m, split refresh from login. |

#### Needs owner (VPS access)

| Item | Script/Runbook | Description |
|------|---------------|-------------|
| T70 BillingSweep enable | `governance/T70_BILLING_CRON_RCA.md` | `docker compose restart api` → verify log "Billing sweep cron scheduled" |
| Phase 3 evidence collection | `bash scripts/collect-evidence.sh` | Run on VPS after DNS/certbot |
| Phase 3 load test | `k6 run infra/k6/load-test.js` | k6 must be installed on VPS or CI runner |
| Phase 3 restore drill | `bash infra/scripts/restore-test.sh` | Run on VPS with RESTIC_REPOSITORY set |
| I009 2FA browser test | Manual | Login flow → TOTP code → verify access |
| shop.ibherp.cloud DNS + certbot | Hostinger DNS panel | A record → VPS IP + Let's Encrypt |
| WhatsApp token | `.env` on VPS | WHATSAPP_TOKEN + WHATSAPP_PHONE_ID from Meta Business |

#### Requires external accounts (owner action)

| Item | Blocker |
|------|---------|
| POS Windows signing | Authenticode cert (~$200/yr) |
| POS macOS signing | Apple Developer account ($99/yr) |
| Mobile EAS build | EXPO_TOKEN + Apple/Google |

---

### Phase Status Summary

| Phase | Status | Remaining |
|-------|--------|-----------|
| Phase 1 | 🟢 92% | S1.10 DNS, S1.11 Meta token, S1.12 browser — owner action |
| Phase 2 | 🟢 ~80% | S2.12 deferred (e2e parallelization not needed yet) |
| Phase 3 | 🟡 20% | VPS execution: evidence collection, load test, restore drill |
| Phase 4 | 🔴 0% | Needs real UAT users + VPS |
| Phase 5 | 🟢 85% | 5.A ✅ 50/50 · 5.B ✅ 18/18 · 5.D ✅ · 5.C blocked (signing certs) |

### Final state of all open issues

| Issue | Status |
|-------|--------|
| I032 — 18 dep upgrades | ✅ CLOSED all 18/18 |
| I040 — Prisma 7 | ✅ CLOSED |
| I041 — Tailwind 4 | ✅ CLOSED |
| I048 — Security audit | ✅ CLOSED (uuid moderate risk-accepted) |
| I009 — 2FA browser test | 🟡 Open — needs manual browser test only |

---

### Latest 6 commits

```
611f35a fix(web): remove duplicate useAuth() destructuring in login page
ed615e8 docs(roadmap): mark 5.B steps 4-5 complete — I032 18/18
30112ce fix(I047 cycle 9): defensive try/catch in commissions.listEntries
e9b33db docs(handoff): Session 26 final closeout
0940b73 feat(phase5-d): re-enable BillingSweepProcessor cron
f9cdcd0 ops(s1.9): VPS disk-setup deployed
```
