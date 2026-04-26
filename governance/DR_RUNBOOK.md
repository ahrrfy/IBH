# DR_RUNBOOK.md — Disaster Recovery Runbook

> **Scope:** PostgreSQL data recovery for Al-Ruya ERP using Restic + pg_dump (3-2-1-1 strategy).
> **Audience:** على VPS — `root` على `ibherp.cloud`.
> **اللغة:** الخطوات بالإنجليزية (نسخ-لصق على shell)، السياق بالعربية.

---

## 1. خلفية سريعة

| البند | القيمة |
|---|---|
| استراتيجية | 3-2-1-1 (3 نسخ · 2 وسائط · 1 offsite · 1 immutable monthly) |
| أدوات | `pg_dump --format=custom` + `restic` |
| Repo | `$RESTIC_REPOSITORY` في `/opt/al-ruya-erp/infra/.env` |
| Schedule | يوميًا 02:00 server time عبر crontab |
| Retention | 7 daily · 4 weekly · 3 monthly |
| Wrapper | `infra/scripts/backup-cron.sh` |
| Engine | `infra/scripts/backup.sh` |
| Logs | `/var/log/al-ruya-erp/backup-YYYYMMDD.log` |

---

## 2. تحقّق من نشاط النظام (Health Check)

نفّذها أسبوعياً على الأقل:

```bash
# آخر نسخة احتياطية ناجحة
crontab -l | grep al-ruya-erp                              # cron entry موجود
ls -lh /var/log/al-ruya-erp/ | tail -5                      # logs حديثة
tail -20 /var/log/al-ruya-erp/backup-$(date +%Y%m%d).log    # نتيجة آخر run

# قائمة snapshots
set -a; source /opt/al-ruya-erp/infra/.env; set +a
restic snapshots --compact

# سلامة المخزن
restic check --read-data-subset=5%
```

شرط القبول: آخر snapshot عمره < 26 ساعة، و `restic check` ينجح.

---

## 3. الاستعادة الكاملة (Full Restore — Cold)

> **الحالة:** فقدنا DB كلياً (corruption / drop / disk failure).
> **الزمن المتوقع:** 5-15 دقيقة لـ DB بحجم < 5GB.

### 3.1. أوقف الخدمات اللي تكتب على DB

```bash
cd /opt/al-ruya-erp/infra
docker compose -f docker-compose.bootstrap.yml stop api web
```

### 3.2. اختر snapshot

```bash
set -a; source /opt/al-ruya-erp/infra/.env; set +a

restic snapshots --compact
# مثال: ID=abc12345 — Tags: erp-backup,db-20260426_020000
SNAPSHOT_ID=latest    # أو ID محدد
```

### 3.3. استخرج dump الفعلي

```bash
RESTORE_DIR=/tmp/restore-$(date +%s)
mkdir -p "$RESTORE_DIR"
restic restore "$SNAPSHOT_ID" --target "$RESTORE_DIR"

# الـ dump سيكون داخل: $RESTORE_DIR/tmp/erp-backup-<pid>/postgres_<ts>.dump
DUMP=$(find "$RESTORE_DIR" -name 'postgres_*.dump' | head -1)
ls -lh "$DUMP"
```

### 3.4. استعادة DB

```bash
# تحقّق من قاعدة فارغة جاهزة (drop + create — destructive!)
docker compose -f docker-compose.bootstrap.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\";"
docker compose -f docker-compose.bootstrap.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE \"$POSTGRES_DB\";"

# استعادة من dump (custom format)
docker compose -f docker-compose.bootstrap.yml exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl < "$DUMP"
```

### 3.5. تحقّق + شغّل من جديد

```bash
# عدد الجداول المتوقع: 86
docker compose -f docker-compose.bootstrap.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt" | wc -l

# آخر قيد محاسبي
docker compose -f docker-compose.bootstrap.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "SELECT MAX(\"createdAt\") FROM journal_entries;"

# triggers append-only ما زالت موجودة (F2 guard)
docker compose -f docker-compose.bootstrap.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "SELECT trigger_name FROM information_schema.triggers WHERE trigger_name LIKE 'no_update%';"
# Expect: 3 rows (no_update_audit_logs, no_update_je_lines, no_update_stock_ledger)

# شغّل الخدمات
docker compose -f docker-compose.bootstrap.yml start api web

# health
curl -sI https://ibherp.cloud/health
```

### 3.6. نظافة

```bash
rm -rf "$RESTORE_DIR"
```

---

## 4. الاستعادة الانتقائية (Point-in-Time Snapshot)

```bash
# سرد كل snapshots مرتّبة
restic snapshots

# استعادة snapshot من تاريخ معيّن — مثال: قبل 3 أيام
restic restore --target /tmp/restore-3d --time "$(date -u -d '3 days ago' +%FT%TZ)" latest
```

---

## 5. التمرين الدوري (Rehearsal)

> ⚠️ **إلزامي:** كل 90 يوماً نحاكي استعادة كاملة على VPS staging أو محلياً.

### إجراء الـ rehearsal

```bash
# 1. dump حالي للمقارنة
docker compose -f docker-compose.bootstrap.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" --format=custom -f /tmp/before.dump
md5sum /tmp/before.dump > /tmp/before.md5

# 2. استرجع آخر snapshot
restic restore latest --target /tmp/rehearsal

# 3. قارن md5
DUMP=$(find /tmp/rehearsal -name 'postgres_*.dump' | head -1)
md5sum "$DUMP"

# 4. سجّل النتيجة في §6 أدناه (يدوي — commit للريبو)
```

شرط النجاح: `restic restore` يخرج 0 + الـ dump يفتح بـ `pg_restore --list` بدون أخطاء.

---

## 6. سجل التمارين (Rehearsal Log)

| التاريخ | المُنفّذ | Snapshot ID | النتيجة | ملاحظات |
|---|---|---|---|---|
| — | — | — | — | لم يُجرَ بعد — أول rehearsal مستحق بعد 90 يوماً من تفعيل الـ cron |

> أضف صفاً جديداً بعد كل تمرين، commit + push.

---

## 7. أعطال شائعة + علاج

| الخطأ | السبب الأرجح | العلاج |
|---|---|---|
| `restic: repository not found` | env file لم يُحمَّل | `set -a; source /opt/al-ruya-erp/infra/.env; set +a` |
| `wrong password or no key found` | `RESTIC_PASSWORD` خطأ | تحقّق من `.env` على VPS (chmod 600) |
| `another backup is already running` | lock عالق من crash سابق | `rm -f /var/run/al-ruya-erp-backup.lock` ثم أعد التشغيل |
| `pg_dump: connection refused` | postgres container متوقف | `docker compose ... up -d postgres` |
| `pg_restore: error: could not execute query: ERROR: relation "..." already exists` | DB مو فاضية | step 3.4 (DROP/CREATE) قبل pg_restore |
| `no_update_*` triggers مفقودة بعد restore | dump قديم قبل migration 0008 | شغّل `prisma migrate deploy` بعد restore |

---

## 8. حدود معروفة (Limits)

- 🟡 لا offsite remote حالياً — repo محلي فقط على VPS. **TODO:** أضف Backblaze B2 أو SFTP secondary. حتى ذلك الحين فقدان VPS = فقدان البيانات.
- 🟡 لا encryption-at-rest خارج Restic (الذي يُشفّر بمفتاح في `.env`). فقدان `.env` = فقدان كل النسخ.
- 🟡 لا alerting — فشل cron يظهر فقط في `/var/log/al-ruya-erp/cron.log`. **TODO:** أضف healthcheck.io ping بعد كل run ناجح.

---

## 9. متطلبات .env (للـ VPS)

`infra/.env` يجب يحوي **كلها** قبل تشغيل `backup-cron.sh`:

```bash
POSTGRES_DB=alruya_erp           # mirror docker-compose
POSTGRES_USER=erp_app            # mirror docker-compose
POSTGRES_PASSWORD=<متطابق>       # موجود أصلاً
RESTIC_REPOSITORY=/backups/restic-repo
RESTIC_PASSWORD=<قوي 32 حرف>
RETENTION_DAILY=7      # اختياري (default 7)
RETENTION_WEEKLY=4     # اختياري (default 4)
RETENTION_MONTHLY=3    # اختياري (default 3)
```

تحقّق سريع (لا يكشف القيم):
```bash
ssh root@vps 'grep -E "^(POSTGRES_DB|POSTGRES_USER|RESTIC_REPOSITORY)=" /opt/al-ruya-erp/infra/.env'
```

> ⚠️ لو POSTGRES_DB مفقود، سيخرج الـ wrapper بـ exit 10 + رسالة `missing in $ENV_FILE`.

---

## 10. مراجع

- `infra/scripts/backup.sh` — Restic engine
- `infra/scripts/backup-cron.sh` — wrapper (env load + lock + logging)
- `infra/scripts/install-cron.sh` — مثبّت crontab
- `governance/OPEN_ISSUES.md` — I022 (F2 append-only triggers)
