# Phase 1 Operations Guide — S1.9 to S1.12

## Overview

Phase 1.B consists of VPS operational tasks that must be completed after testing passes (G4 gate). These tasks require direct access to external systems.

**Status:** Preparation phase — awaiting CI completion and authorization to proceed

---

## S1.9 — VPS Disk Setup Prevention

**Objective:** Prevent Docker from consuming all VPS disk space

**Prerequisite:** SSH access to VPS (Hostinger KVM4, Frankfurt)

**Steps:**

1. SSH into VPS:
   ```bash
   ssh root@ibherp.cloud
   ```

2. Run the disk setup playbook:
   ```bash
   cd /root/al-ruya-erp
   ansible-playbook infra/vps-disk-setup.yml
   ```

3. Verify Docker disk configuration:
   ```bash
   docker system df
   docker stats --no-stream
   ```

**Expected Outcome:**
- Docker auto-cleanup cron enabled
- Max container log size limited
- Disk usage < 80% after cleanup

**Files Involved:**
- `infra/vps-disk-setup.yml` — Ansible playbook (should be created if missing)

---

## S1.10 — Storefront DNS & SSL

**Objective:** Enable e-commerce storefront at shop.ibherp.cloud with valid SSL

**Prerequisites:**
- DNS provider access (currently using Hostinger)
- VPS IP address: (check in Hostinger dashboard)

**Steps:**

1. **Add DNS A Record:**
   - Go to Hostinger domain management
   - Add A record: `shop` → VPS IP (e.g., 31.220.x.x)
   - TTL: 3600 seconds
   - Wait 5-10 minutes for propagation

2. **Enable HTTPS on VPS:**
   ```bash
   ssh root@ibherp.cloud
   cd /root/al-ruya-erp
   
   # Verify DNS is working
   nslookup shop.ibherp.cloud
   
   # Run certbot for SSL
   docker run --rm -it \
     -v /etc/letsencrypt:/etc/letsencrypt \
     -v /var/lib/letsencrypt:/var/lib/letsencrypt \
     -v /var/log/letsencrypt:/var/log/letsencrypt \
     -p 80:80 \
     certbot/certbot certonly --standalone \
     -d shop.ibherp.cloud \
     --email admin@ibherp.cloud \
     --agree-tos --non-interactive
   ```

3. **Update Nginx config:**
   - Update `infra/nginx/sites-enabled/shop.conf`
   - Point to `/etc/letsencrypt/live/shop.ibherp.cloud/`
   - Reload: `docker compose exec nginx nginx -s reload`

4. **Test:**
   ```bash
   curl -I https://shop.ibherp.cloud
   # Should return 200 with valid SSL
   ```

**Expected Outcome:**
- HTTPS works: shop.ibherp.cloud → 200 OK
- SSL certificate valid (not self-signed)
- Storefront accessible to public

**Files Involved:**
- `infra/nginx/sites-enabled/shop.conf` — Nginx config (update with SSL paths)

---

## S1.11 — WhatsApp Bridge Integration

**Objective:** Enable WhatsApp notifications via WhatsApp Business API

**Prerequisites:**
- Meta Business Manager account (admin access)
- WhatsApp Business account linked to Meta
- Phone number verified for 2FA
- Access to WhatsApp API webhook settings

**Steps:**

1. **Get WhatsApp Token from Meta:**
   - Go to: https://developers.facebook.com/apps/
   - Select: "Al-Ruya ERP" app
   - Navigate: Settings → Basic → API Credentials
   - Find: Business Account ID + Phone Number ID
   - Generate: Long-lived User Access Token (60 days)

2. **Set VPS Environment Variable:**
   ```bash
   ssh root@ibherp.cloud
   
   # Edit .env
   nano /root/al-ruya-erp/apps/whatsapp-bridge/.env
   
   # Add line:
   WHATSAPP_TOKEN=<paste-token-here>
   WHATSAPP_PHONE_NUMBER_ID=<your-phone-id>
   WHATSAPP_BUSINESS_ACCOUNT_ID=<your-account-id>
   
   # Save (Ctrl+O, Enter, Ctrl+X)
   ```

3. **Restart WhatsApp Bridge service:**
   ```bash
   docker compose restart whatsapp-bridge
   docker compose logs whatsapp-bridge
   # Should show: "WhatsApp Bridge started on port 3010"
   ```

4. **Test webhook (from Meta dashboard):**
   - Set Webhook URL: https://ibherp.cloud/webhook/whatsapp
   - Subscribe to: messages, message_template_status_update
   - Verify webhook: Test sends from official WhatsApp test message

5. **Verify in app:**
   - Trigger a test message from ERP (e.g., invoice PDF to WhatsApp)
   - Check VPS logs: `docker compose logs whatsapp-bridge`

**Expected Outcome:**
- WhatsApp API token accepted
- Webhook URL verified by Meta
- Test messages sent successfully

**Files Involved:**
- `.env` (VPS) — Contains WHATSAPP_TOKEN, etc.
- `apps/whatsapp-bridge/src/index.ts` — Bridge service (should already be running)

---

## S1.12 — Manual 2FA UI Flow Test

**Objective:** Verify 2FA login flow works end-to-end in browser

**Prerequisites:**
- VPS running and accessible
- Test user account with email (created in CI seed)
- Email client for reading OTP codes

**Steps:**

1. **Open Admin Panel in Browser:**
   - Navigate to: https://ibherp.cloud/admin
   - Should show login page (no SSL errors)

2. **Login with TEST_ADMIN:**
   ```
   Email: admin@test.local (or from seed)
   Password: (from seed — check github.com/ahrrfy/IBH secrets)
   ```

3. **Enter 2FA Code:**
   - Should see: "Enter 6-digit code from your email"
   - Check: Email inbox for code (subject: "2FA Code for Al-Ruya ERP")
   - Enter code in form
   - Should redirect to: Dashboard (authenticated)

4. **Verify Session:**
   - Logged in as: admin@test.local
   - Sidebar visible: Products, Inventory, Sales, Finance, HR, Reports, CRM
   - Can click any module without redirecting to login

5. **Test Logout & Re-Login:**
   - Click: Account → Logout
   - Should redirect to: Login page
   - Re-login should work (not cached)

6. **Document Findings:**
   - ✅ 2FA code sent via email
   - ✅ UI form accepts 6-digit code
   - ✅ Session created after 2FA verification
   - ✅ Logout works correctly
   - ❌ (any failures)

**Expected Outcome:**
- Full login → 2FA email → code entry → dashboard flow works
- Session persists across page reloads
- Logout clears session

**Files Involved:**
- `apps/web/src/pages/auth/login.tsx` — Login page
- `apps/web/src/pages/auth/2fa.tsx` — 2FA form
- `apps/api/src/engines/auth/controllers/auth.controller.ts` — Backend

---

## Timeline

| Task | Duration | Blocker? | Dependencies |
|------|----------|----------|---|
| S1.9 | 30 min | No | SSH access, Ansible |
| S1.10 | 1-2 hr | Yes* | DNS, certbot, Nginx reload |
| S1.11 | 1 hr | No | Meta API token, .env access |
| S1.12 | 30 min | No | Live VPS, email working |

*S1.10 blocks public HTTPS access but doesn't block internal API testing

---

## Execution Checklist

- [ ] **Pre-Phase 1B:** Confirm CI passes (all 30 e2e tests)
- [ ] **Pre-Phase 1B:** Get VPS credentials + API tokens
- [ ] **S1.9:** Run disk setup playbook
- [ ] **S1.10:** Add DNS A record
- [ ] **S1.10:** Run certbot
- [ ] **S1.10:** Verify HTTPS
- [ ] **S1.11:** Set WhatsApp env vars
- [ ] **S1.11:** Verify webhook
- [ ] **S1.12:** Test login → 2FA → dashboard flow
- [ ] **Sign-off:** All Phase 1 tasks complete → Move to Phase 2

---

## Rollback Plan

If any task fails:

| Scenario | Rollback |
|----------|----------|
| Disk fills up | Stop Docker, clean logs, run S1.9 again |
| DNS propagation fails | Wait 1-2 hrs, recheck (DNS TTL) |
| SSL cert fails | Check ACME logs, retry with new domain if needed |
| WhatsApp token invalid | Regenerate token, restart bridge |
| 2FA email not sent | Check email service logs, verify SMTP config |

---

**Last Updated:** 2026-04-29 — Phase 1 Preparation
**Next Review:** After CI passes (expected today)
