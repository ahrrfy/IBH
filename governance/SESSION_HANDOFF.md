# SESSION_HANDOFF.md

---

## Session 29 — 2026-04-29 — Closed I052+I053+I054+I055

### Branch: main
### Latest commit: d7cdddc
### Pushed to origin: ✅

---

### Completed this session

| # | What | Commit |
|---|------|--------|
| 1 | I053 — host vhost: dedicated `/socket.io/` location with 86400s timeouts so the catch-all 90s read_timeout no longer drops WS frames. I055 — split `erp_auth` into login (10r/m) + refresh (60r/m) zones; fixed latent bug where `/api/auth/` never matched (real path is `/api/v1/auth/...`), so login was effectively un-rate-limited in production. | `d9175c8` |
| 2 | I054 — refresh-token rotation in `apps/web/src/lib/api.ts`. Persist `refreshToken` on login + 2FA verify; on 401 try `/auth/refresh` once before clearing session; coalesce concurrent 401s into one refresh round-trip. logout forwards refreshToken so the DB row gets revoked. + POS `globals.d.ts` (TS6 strict + `*.css` side-effect import). | `475ba34` |
| 3 | I052 — extracted `LicensingMirrorModule` (read-only `MeFeaturesController` + `FeatureCacheService` only; no global guard). Loaded unconditionally in `coreImports` so the web shell can boot on greenfield installs even with `BACKGROUND_JOBS_DISABLED=1`. `PlatformLicensingModule` now imports the mirror instead of re-providing the cache. me-features.controller.spec 3/3 pass. | `d7cdddc` |
| 4 | Earlier: PHASES_3_5_ROADMAP marked 5.B steps 4-5 ✅ DONE (NestJS 11 + Zod 4 + Recharts 3); login.tsx duplicate destructure (TS2451) fixed. | `ed615e8`, `611f35a` |

---

### What remains (by who)

#### Claude can do immediately

| Item | Notes |
|------|-------|
| — | All four newly-opened issues (I052-I055) closed. No code-only work pending. |

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
