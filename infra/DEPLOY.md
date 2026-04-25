# دليل النشر على VPS — Al-Ruya ERP

## VPS الحالي
- **المزود**: Hostinger KVM4
- **OS**: Ubuntu 24.04 LTS
- **IP**: `187.124.183.140`
- **Resources**: 16GB RAM · 200GB SSD · 4 vCPU

---

## الخطوات (5 دقائق)

### 1. ادخل إلى VPS عبر SSH (من جهازك المحلي)

```bash
ssh root@187.124.183.140
```

> أول مرة سيسألك عن fingerprint — اكتب `yes` ثم أدخل root password من Hostinger panel.

### 2. شغّل سكربت Bootstrap (أمر واحد)

```bash
curl -fsSL https://raw.githubusercontent.com/ahrrfy/IBH/main/infra/scripts/vps-bootstrap.sh | bash
```

السكربت سيقوم تلقائياً بـ:
1. تثبيت Docker + Docker Compose
2. إعداد UFW firewall (يفتح 22, 80, 443)
3. clone المستودع إلى `/opt/al-ruya-erp`
4. توليد كلمات سر عشوائية قوية في `/opt/al-ruya-erp/infra/.env`
5. بناء صور Docker للـ API و Web (5–10 دقائق أول مرة)
6. تشغيل Postgres + Redis + MinIO + API + Web + Nginx
7. تطبيق Prisma migrations + seed (Iraqi CoA + admin user)
8. التحقق من `/health`

### 3. افتح المتصفح

```
http://187.124.183.140/
```

- **Web Admin**: الواجهة الرئيسية
- **API health**: `http://187.124.183.140/health` يجب أن يرجع JSON
- **API**: `http://187.124.183.140/api/...` (Nginx ينزع `/api` ويوجّه للـ NestJS)

### 4. سجّل الدخول

بعد seed سيكون هناك حساب admin افتراضي (راجع `apps/api/prisma/seed.ts` للبيانات).

---

## الأوامر اليومية

```bash
cd /opt/al-ruya-erp/infra

# عرض السجلات
docker compose -f docker-compose.bootstrap.yml --env-file .env logs -f api
docker compose -f docker-compose.bootstrap.yml --env-file .env logs -f web

# إعادة تشغيل خدمة
docker compose -f docker-compose.bootstrap.yml --env-file .env restart api

# عرض حالة الخدمات
docker compose -f docker-compose.bootstrap.yml --env-file .env ps

# تحديث من Git ثم إعادة بناء
git pull
docker compose -f docker-compose.bootstrap.yml --env-file .env build api web
docker compose -f docker-compose.bootstrap.yml --env-file .env up -d
```

---

## النقل من IP إلى Domain + SSL (لاحقاً)

عندما يصبح لديك domain (مثلاً `erp.al-ruya.iq`):

1. **اضبط DNS A record** يشير إلى `187.124.183.140`
2. **عدّل `.env`**:
   ```
   APP_URL=https://erp.al-ruya.iq
   CORS_ORIGINS=https://erp.al-ruya.iq
   ```
3. **اطلب شهادة Let's Encrypt**:
   ```bash
   docker compose -f docker-compose.bootstrap.yml run --rm \
     -v /etc/letsencrypt:/etc/letsencrypt \
     -v /var/www/certbot:/var/www/certbot \
     certbot/certbot certonly --webroot -w /var/www/certbot \
     -d erp.al-ruya.iq --email admin@al-ruya.iq --agree-tos --no-eff-email
   ```
4. **استبدل bootstrap.conf بـ erp-api.conf** في nginx:
   ```bash
   ln -sf /opt/al-ruya-erp/infra/nginx/conf.d/erp-api.conf \
          /opt/al-ruya-erp/infra/nginx/conf.d/default.conf
   docker compose -f docker-compose.bootstrap.yml restart nginx
   ```

---

## استكشاف الأخطاء

### `port 80 already in use`
أوقف Apache/Nginx المثبّت مسبقاً:
```bash
systemctl stop apache2 nginx 2>/dev/null
systemctl disable apache2 nginx 2>/dev/null
```

### `prisma migrate deploy` فشل
السكربت يكمل رغم الفشل ويحفظ تحذيراً. شغّل يدوياً بعد البناء:
```bash
cd /opt/al-ruya-erp/infra
docker compose -f docker-compose.bootstrap.yml exec api \
  sh -c 'cd /app && npx prisma migrate deploy'
```

### `/health` لا يستجيب
```bash
docker compose -f docker-compose.bootstrap.yml logs api --tail=100
docker compose -f docker-compose.bootstrap.yml ps  # تأكد api status = healthy
```

### نسخة احتياطية يدوية لقاعدة البيانات
```bash
docker compose -f docker-compose.bootstrap.yml exec -T postgres \
  pg_dump -U erp_app alruya_erp | gzip > backup-$(date +%F).sql.gz
```

---

## ما الذي يعمل بعد Bootstrap؟

✅ **Web Admin** على `:80` — جميع الصفحات (`/sales`, `/purchases`, `/finance`, `/assets`, `/job-orders`, `/marketing`, `/reports`, إلخ)
✅ **NestJS API** خلف Nginx (`/api/...` و `/health`)
✅ **PostgreSQL 16** مع 75 model + Iraqi CoA
✅ **Redis 7** للـ cache و BullMQ
✅ **MinIO** مع 3 buckets (documents/attachments/exports)

❌ **غير مفعّل في bootstrap** (تحتاج profile manual):
- AI Brain (يحتاج 6GB RAM إضافية لـ Ollama)
- WhatsApp Bridge (يحتاج WA Cloud API token)
- Monitoring (Prometheus + Loki + Grafana)
- Backups (Restic) — راجع `infra/scripts/backup.sh`

---

## الأمان

- `.env` على VPS: `chmod 600` تلقائياً
- Postgres + Redis على شبكة `erp-internal` فقط — غير مكشوفين خارجياً
- MinIO Console (`:9001`) غير مكشوف — استخدم SSH tunnel للوصول
- UFW يحجب كل المنافذ ما عدا 22/80/443

```bash
# للوصول إلى MinIO Console من جهازك المحلي:
ssh -L 9001:localhost:9001 root@187.124.183.140
# ثم افتح http://localhost:9001 في المتصفح
```
