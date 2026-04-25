# دليل الأمان — Al-Ruya ERP

## 🔐 ما الذي يُحفظ ولا يُكشف أبداً

### 1. كلمات مرور ومفاتيح
- **`OWNER_USERNAME` / `OWNER_PASSWORD`**: حساب المالك الدائم
- **`JWT_SECRET`**: مفتاح توقيع JWT (يجب أن يكون ≥32 حرف، عشوائي)
- **`POSTGRES_PASSWORD`**: قاعدة البيانات
- **`REDIS_PASSWORD`**: Redis
- **`MINIO_SECRET_KEY`**: التخزين
- **`RESTIC_PASSWORD`**: تشفير النسخ الاحتياطية
- **TOTP secrets**: مشفّرة في DB بـ AES-256-GCM (مفتاح من JWT_SECRET)
- **Backup codes**: مُجزّأة sha256 + salt

### 2. ملفات حساسة (في `.gitignore`)
```
.env, .env.production, .env.staging, *.env
*.pem, *.key, *.crt, *.p12          (مفاتيح TLS / RSA)
id_rsa*, id_ed25519*                  (SSH)
letsencrypt/, ssl/private/            (شهادات)
*.sql.gz, backup-*                    (نسخ احتياطية)
secrets/, credentials/, *.secret      (أي شيء آخر)
```

### 3. أين تعيش الأسرار في الإنتاج
| المكان | الملف |
|---|---|
| Owner password | VPS فقط: `/opt/al-ruya-erp/infra/.env` (chmod 600) |
| TOTP secrets | DB column `users.totpSecret` — مشفّرة بـ AES-256-GCM |
| JWT_SECRET | environment variable (لا في DB، لا في git) |
| Backup codes | DB column `users.backupCodes` — sha256+salt |

---

## 🛡️ الطبقات الأمنية المُفعّلة

### Authentication (Auth)
- **Argon2id** لكلمات المرور (مقاوم لـ GPU brute force)
- **JWT 15 دقيقة** access + **30 يوم** refresh token
- **Refresh tokens** مُجزّأة sha256، single-device tracking
- **Brute-force protection**: 5 محاولات فاشلة → قفل 15 دقيقة
- **Account lockout** بـ Redis rate limiter (per-email + per-IP)

### 2FA / TOTP
- **RFC 6238** عبر `otplib` (Google Authenticator / Authy متوافق)
- **TOTP secrets** AES-256-GCM مشفّرة، مفتاح من JWT_SECRET via scrypt
- **8 backup codes** مُجزّأة، كل واحد single-use
- **MFA token** في login بخطوتين: 5 دقائق TTL في Redis، single-use
- **Policy**: `system_owner / company_admin / branch_manager / accountant` يُفرَض عليهم 2FA

### Security Headers (Helmet)
- **CSP** صارم: `default-src 'self'`، لا scripts خارجية
- **HSTS**: 2 سنة + includeSubDomains + preload
- **X-Frame-Options**: DENY (anti-clickjacking)
- **X-Content-Type-Options**: nosniff
- **Referrer-Policy**: strict-origin-when-cross-origin
- **Cross-Origin-Opener/Resource-Policy**: same-origin/site
- **X-Powered-By** ُمحذوف

### CORS
- **Strict whitelist** من `CORS_ORIGINS` env فقط
- **Production fail-fast**: لو `CORS_ORIGINS` فارغ، API يرفض البدء
- **Wildcard `*` ممنوع** نهائياً

### Database (RLS)
- **Row Level Security** على جميع الجداول tenant-scoped
- Policy: `companyId = current_company_id()` (function STABLE)
- Append-only triggers على `audit_logs`, `journal_entries`, `stock_ledger_entries`
- Period lock: لا ترحيل في فترة محاسبية مغلقة

### F2 (المحاسبة)
- DB CHECK constraint: `total_debit = total_credit` على journal_entries
- Hash chain على القيود (للكشف عن التلاعب)
- لا حذف أبداً — فقط reverse entries

---

## 🔍 الفحص قبل الـ commit

### Pre-commit hook
```bash
bash infra/scripts/install-git-hooks.sh
```
يثبّت hook يفحص الـ staged files قبل كل commit:
- يرفض إذا وجد `password=` بقيمة literal
- يرفض إذا وجد private keys
- يرفض admin123 / Bearer tokens / AWS keys

### فحص يدوي للمستودع كاملاً
```bash
bash infra/scripts/security-scan.sh
```

---

## 🚨 إذا تسرّب سرّ

### 1. على الفور:
- `git rm --cached <file>` ثم `git commit`
- اعتبر السرّ مكشوفاً حتى لو حذفته من latest commit (التاريخ يحتفظ)

### 2. تدوير المفاتيح:
- **JWT_SECRET**: عدّل في `.env`، أعد تشغيل API → كل JWTs الحالية تُبطل
- **DB password**: `ALTER USER erp_app WITH PASSWORD 'new'` + `.env` + restart
- **MinIO**: roll keys via console + `.env` + restart
- **TOTP secrets**: لا يحتاج تدوير لو JWT_SECRET دار (مفتاح التشفير اشتُقّ منه)

### 3. تنظيف git history (إذا committed سرّ):
```bash
# استخدم git-filter-repo (أنظف من filter-branch)
pipx install git-filter-repo
git filter-repo --path-glob '*.env' --invert-paths
git push --force origin main
```

---

## ✅ Checklist للنشر الإنتاجي

- [ ] `.env` على VPS بـ `chmod 600`
- [ ] `JWT_SECRET` ≥ 64 حرف عشوائي (`openssl rand -base64 64`)
- [ ] `OWNER_USERNAME`, `OWNER_PASSWORD` معيّنين
- [ ] `CORS_ORIGINS` معيّن بدقّة (لا wildcards)
- [ ] HTTPS مع Let's Encrypt cert
- [ ] UFW يحجب كل المنافذ ما عدا 22/80/443
- [ ] Postgres + Redis على شبكة Docker داخلية فقط (لا exposed ports)
- [ ] MinIO console (`:9001`) خلف SSH tunnel أو VPN
- [ ] Backup يومي مع `restic` + تشفير
- [ ] Pre-commit hook مُثبّت محلياً
