# دليل النشر على VPS — Al-Ruya ERP

## السياق المهم

السيرفر **مشترك** بين نظامين:

| Domain | الحالة | الإجراء |
|---|---|---|
| `sirajalquran.org` | يعمل — نظام القرآن | 🟢 **لا يُمَس مطلقاً** |
| `ibherp.cloud` | كان يعمل ibh القديم | 🔴 **يُستبدل بالنظام الجديد** |
| VPS `187.124.183.140` | Hostinger KVM4 · Ubuntu 24.04 | يستضيف الاثنين |

**الحماية:** السكربتات لا تستخدم port 80 على الـ host مباشرة — Docker يستمع على `127.0.0.1:8080` فقط، و host nginx (الذي يقدّم sirajalquran) يضيف vhost إضافي لـ ibherp.cloud يوجّه إلى `:8080`.

---

## مرحلة 1: فحص آمن للسيرفر (read-only)

قبل أي تغيير، شغّل سكربت الفحص لمعرفة الوضع الحالي:

```bash
ssh root@187.124.183.140
curl -fsSL https://raw.githubusercontent.com/ahrrfy/IBH/main/infra/scripts/vps-inspect.sh | bash
```

سيُظهر:
- ما الذي يستمع على المنافذ
- containers Docker الموجودة (إن وُجدت)
- nginx host configs الحالية
- DNS لـ ibherp.cloud و sirajalquran.org
- شهادات Let's Encrypt الموجودة

**أرسل لي الـ output كاملاً** قبل المرحلة 2 إذا كنت غير متأكد.

---

## مرحلة 2: النشر الآمن

```bash
ssh root@187.124.183.140
git clone https://github.com/ahrrfy/IBH.git /opt/al-ruya-erp || \
  (cd /opt/al-ruya-erp && git pull)
bash /opt/al-ruya-erp/infra/scripts/vps-deploy.sh
```

السكربت يقوم بـ:
1. **إيقاف containers ibh القديمة** (data volumes تبقى — نسخة احتياطية)
2. **تعطيل nginx vhosts القديمة** لـ ibherp.cloud (مع backup `.disabled.<timestamp>`)
3. تثبيت Docker + nginx + certbot (additive — لا يحذف شيء)
4. clone/update المستودع → `/opt/al-ruya-erp`
5. توليد `.env` بكلمات سر قوية (`chmod 600`)
6. بناء صور Docker للـ API و Web (≈ 5–10 دقائق)
7. تشغيل postgres + redis + minio + api + web + nginx (داخلياً على :8080)
8. تطبيق `prisma migrate deploy` + `prisma db seed` (Iraqi CoA)
9. تثبيت host nginx vhost لـ ibherp.cloud
10. إصدار شهادة Let's Encrypt لـ `ibherp.cloud` و `www.ibherp.cloud`
11. التحقق من `https://ibherp.cloud/health`

**شرط النجاح:** DNS A record لـ `ibherp.cloud` يشير إلى `187.124.183.140` (للتحقق من شهادة SSL).

---

## مرحلة 3: CI/CD التلقائي (اختياري، لاحقاً)

GitHub Actions workflow جاهز في `.github/workflows/deploy-vps.yml`. يُفعَّل بإضافة هذه الأسرار في GitHub:

`Settings → Secrets and variables → Actions → New repository secret`:

| Name | Value |
|---|---|
| `VPS_HOST` | `187.124.183.140` |
| `VPS_SSH_KEY` | المحتوى الكامل لمفتاح `github-actions-deploy` الخاص (private key) |

> SSH public key الموجود مسبقاً في Hostinger هو الـ public نظيره — جمّعهما عبر:
> ```bash
> # على جهازك المحلي حيث المفتاح الأصلي:
> cat ~/.ssh/github-actions-deploy   # private — انسخ كامل المحتوى للـ secret
> cat ~/.ssh/github-actions-deploy.pub  # public — موجود في Hostinger
> ```

بعد الإضافة، أي push على `main` يطبّق تلقائياً على VPS.

---

## الأوامر اليومية

```bash
ssh root@187.124.183.140
cd /opt/al-ruya-erp/infra

# عرض السجلات
docker compose -f docker-compose.bootstrap.yml --env-file .env logs -f api
docker compose -f docker-compose.bootstrap.yml --env-file .env logs -f web

# حالة الخدمات
docker compose -f docker-compose.bootstrap.yml --env-file .env ps

# تحديث يدوي
git pull
docker compose -f docker-compose.bootstrap.yml --env-file .env build api web
docker compose -f docker-compose.bootstrap.yml --env-file .env up -d
```

---

## النسخ الاحتياطي

### تلقائي على Hostinger (موجود)
- Auto-backup أسبوعي مفعّل — آخر نسختين: 2026-04-22 (63 GB) و 2026-04-15 (24 GB)
- يحفظهما Hostinger في موقع منفصل

### يدوي للـ Postgres (موصى به قبل أي migration كبير)
```bash
cd /opt/al-ruya-erp/infra
docker compose -f docker-compose.bootstrap.yml exec -T postgres \
  pg_dump -U erp_app alruya_erp | gzip > /root/backup-$(date +%F-%H%M).sql.gz
```

---

## استكشاف الأخطاء

### `docker compose build` يستهلك ذاكرة كثيرة
- VPS عنده 16GB → كافي. لكن إذا حصل OOM:
  ```bash
  # أنشئ swap مؤقت 4GB
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  ```

### `certbot` فشل
- تأكد أن DNS A record لـ ibherp.cloud يشير لـ `187.124.183.140`:
  ```bash
  dig +short ibherp.cloud
  ```
- إذا لم يكن، عدّل في Hostinger DNS Manager وانتظر 5 دقائق ثم أعد التشغيل:
  ```bash
  bash /opt/al-ruya-erp/infra/scripts/vps-deploy.sh
  ```

### `prisma migrate deploy` فشل
السكربت يكمل رغم الفشل. شغّل يدوياً:
```bash
cd /opt/al-ruya-erp/infra
docker compose -f docker-compose.bootstrap.yml exec api \
  sh -c 'cd /app && npx prisma migrate deploy'
```

### الرجوع للنظام القديم في حال الكارثة
```bash
# 1. أوقف الجديد
cd /opt/al-ruya-erp/infra
docker compose -f docker-compose.bootstrap.yml down

# 2. أرجع nginx vhost القديم
ls /etc/nginx/sites-enabled/*.disabled.*  # شوف الـ backups
mv /etc/nginx/sites-enabled/<old>.disabled.<ts> /etc/nginx/sites-enabled/<old>
systemctl reload nginx

# 3. شغّل containers ibh القديمة
docker ps -a | grep -i ibh   # شوف الأسماء
docker start <old-ibh-container-name>

# 4. أو استعد snapshot من Hostinger panel (30 دقيقة)
```

`sirajalquran.org` لن يتأثر بأي من هذه الخطوات لأن السكربت لا يلمس vhosts ولا containers تخصّه.

---

## ما الذي يعمل بعد النشر؟

✅ **Web Admin** على `https://ibherp.cloud/` — جميع الصفحات
✅ **NestJS API** خلف Nginx (`/api/...` و `/health`)
✅ **PostgreSQL 16** مع 75 model + Iraqi CoA + admin user
✅ **Redis 7** للـ cache و BullMQ
✅ **MinIO** مع 3 buckets
✅ **Let's Encrypt SSL** يتجدد تلقائياً
✅ **`sirajalquran.org`** يستمر في العمل بدون انقطاع

❌ **معطّل افتراضياً** (يُفعَّل لاحقاً عند الحاجة):
- AI Brain (يحتاج 6GB RAM إضافية)
- WhatsApp Bridge (يحتاج WA Cloud API token)
- Monitoring (Prometheus + Loki + Grafana)
