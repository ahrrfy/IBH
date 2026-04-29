# Production VPS Verification Runbook

> Read-only sanity checks to confirm the live VPS is clean from the previous
> deploy and matches the current `main` branch architecture. Run these from an
> SSH session on the VPS — no edits, no `docker restart`. If any check fails,
> open an issue in `governance/OPEN_ISSUES.md` instead of fixing in place.

**Last updated**: 2026-04-29 — Session 24 (post-I050 fix, post-Phase C cleanup)
**Live host**: `ibherp.cloud` (Hostinger KVM4, Frankfurt, 16GB / 200GB)
**SSH**: `ssh root@ibherp.cloud`

---

## Why this exists

This VPS previously hosted a different ERP deploy (under the `al-ruya.iq`
domain, PM2-based, no Docker). It was wiped before the current Al-Ruya ERP
took over. There is also an **untouchable** sibling app on the same host —
`sirajalquran.org` — that **must never be modified** by any deploy or cleanup.

The 7 checks below confirm:
1. No leftover artefacts from the previous ERP deploy.
2. The Docker stack is scoped to the project we expect.
3. SSL certificates only cover the current domains.
4. The Postgres database matches the new schema, not the old one.
5. The siraj sibling app is intact.

Run all 7 in one session — copy/paste a block, paste the next. Each block
should match the **expected** output below it. Any deviation = stop and
investigate.

---

## ✅ Check 1 — No leftover ERP directories under /opt

```bash
ls /opt/
```

**Expected** (one directory per active app, no orphans):
```
al-ruya-erp
sirajalquran  # untouchable
```

**Failure modes**: Any other directory means a previous program left files
behind. Don't delete — confirm with the project owner first.

---

## ✅ Check 2 — Host nginx only serves the current domains

```bash
ls /etc/nginx/sites-enabled/
```

**Expected**:
```
ibherp.cloud      # main app + API
shop.ibherp.cloud # storefront (created when T55 host nginx is wired)
sirajalquran.org  # untouchable sibling
```

**Failure modes**:
- A file like `default` or `00-default.conf` → fine if it returns 444 / 200.
- A file referencing the legacy domain → orphan, flag it.
- Any `app.al-ruya.iq.conf`, `api.al-ruya.iq.conf`, `store.al-ruya.iq.conf`
  → leftover from the previous program. Should not exist.

```bash
# Quick scan for legacy domain refs in active host nginx config
grep -RIn 'al-ruya\.iq' /etc/nginx/ 2>/dev/null
```
Expected: zero hits.

---

## ✅ Check 3 — Docker volumes are scoped to the right project

```bash
docker volume ls --format '{{.Name}}' | grep -E 'postgres|redis|minio'
```

**Expected** (with `COMPOSE_PROJECT_NAME=al-ruya-erp` pinned in `.env`):
```
al-ruya-erp_postgres-data
al-ruya-erp_redis-data
al-ruya-erp_minio-data
```

(If COMPOSE_PROJECT_NAME isn't set, you may see `infra_postgres-data` instead
— that's the legacy Compose-derived name. Either is fine for now, but the
pinned name is preferred. Once `COMPOSE_PROJECT_NAME=al-ruya-erp` is in `.env`,
a fresh `docker compose up` will create the new volume names — at that point
you must MIGRATE data; do not run `volume rm` blindly.)

**Failure modes**: any volume named `<old-project>_*` from the previous deploy.
If found, do not remove until confirmed empty.

---

## ✅ Check 4 — Let's Encrypt certs cover only the current domains

```bash
ls /etc/letsencrypt/live/
```

**Expected**:
```
ibherp.cloud
sirajalquran.org   # untouchable
shop.ibherp.cloud  # appears once T55 storefront DNS+cert is provisioned
```

**Failure modes**: any cert for `app.al-ruya.iq`, `api.al-ruya.iq`,
`store.al-ruya.iq`, `minio.al-ruya.iq`, etc. — leftovers from the previous
deploy. Check expiry first — if already expired, certbot won't auto-renew
and they'll vanish on their own. If still valid, run
`certbot delete --cert-name <name>` after confirming with owner.

---

## ✅ Check 5 — Database name + user match the current stack

```bash
docker compose -f /opt/al-ruya-erp/infra/docker-compose.bootstrap.yml \
  exec -T postgres psql -U erp_app -l 2>/dev/null \
  | awk 'NR>=4 {print $1}' | grep -v '^|$' | grep -v '^$' | head -20
```

**Expected** (these databases must exist):
```
alruya_erp
alruya_erp_shadow   # used by Prisma migrate dev — may not exist on prod
postgres
template0
template1
```

**Failure modes**: a database matching the previous program's name
(typically something like `arabicvision_*`, `erp_db`, or any non-`alruya_erp`
ERP-shaped name). Confirm with owner before dropping — the previous deploy's
data may need archiving first.

---

## ✅ Check 6 — No Docker container orphans running

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
```

**Expected** (containers from `docker-compose.bootstrap.yml` only):
```
NAMES                              IMAGE                                STATUS
al-ruya-erp-api-1                  al-ruya-erp-api:latest               Up
al-ruya-erp-web-1                  al-ruya-erp-web:latest               Up
al-ruya-erp-storefront-1           al-ruya-erp-storefront:latest        Up
al-ruya-erp-postgres-1             postgres:16-alpine                   Up (healthy)
al-ruya-erp-redis-1                redis:7-alpine                       Up (healthy)
al-ruya-erp-minio-1                quay.io/minio/minio:latest           Up (healthy)
al-ruya-erp-nginx-1                nginx:1.27-alpine                    Up
```

(The siraj sibling runs under PM2, not Docker — it should NOT appear here.)

**Failure modes**: any container with an image name containing `al-ruya.iq`,
`erp-arabic`, or any prefix that doesn't start with `al-ruya-erp-` is a leftover
or a parallel deploy. Stop and investigate.

---

## ✅ Check 7 — Siraj sibling is intact (untouchable)

```bash
pm2 list 2>/dev/null | head -20
sudo systemctl status nginx | head -5
ls /opt/sirajalquran/ 2>/dev/null | head -5
```

**Expected**: PM2 shows the siraj process running, nginx is active, and
`/opt/sirajalquran/` exists with its app contents. **Don't touch any of
this** — it's a separate production app on the same host.

If any of these are missing or in an error state, **stop immediately** and
contact the siraj app owner before doing anything else on this VPS.

---

## Sign-off

After all 7 checks pass, log the verification at the bottom of this file
with date + initials. If a check fails, open an entry in
`governance/OPEN_ISSUES.md` describing the deviation and what was
investigated, then leave the VPS alone until the issue is triaged.

| Date       | Verified by     | Notes                                          |
|------------|-----------------|------------------------------------------------|
| 2026-04-29 | (pending owner) | First run scheduled after Phase C deploy lands |

---

## Related runbooks

- `governance/DR_RUNBOOK.md` — disaster recovery procedure (if the VPS dies)
- `governance/PHASE1_OPERATIONS_GUIDE.md` — first-time VPS setup steps
- `infra/scripts/deploy-on-vps.sh` — auto-deploy script invoked by GitHub Actions
- `.github/workflows/deploy-vps.yml` — CI/CD entry point
