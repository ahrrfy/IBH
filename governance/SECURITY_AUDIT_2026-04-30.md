# Security Audit & Hardening — 2026-04-30

## Trigger

A Hostinger advisory email arrived claiming a Linux kernel vulnerability **CVE-2026-31431 ("Copy Fail")** with two remediation options:
1. `apt update && apt upgrade -y` (legitimate)
2. Disable the `algif_aead` kernel module via `/etc/modprobe.d/disable-algif.conf` (risky — breaks AF_ALG / Kernel Crypto API)

Initial analysis suspected phishing because of the 2026 CVE prefix, but the email is from `team@info.hostinger.com` with a Google-verified sender badge — it is a **legitimate Hostinger advisory** (today is 2026-04-30, so CVE-2026-XXXXX is a current-year CVE, not a fake future date).

## Email-instruction integrity check (Option 2 was NOT applied)

| Indicator | Result |
|---|---|
| `/etc/modprobe.d/disable-algif*` | ❌ not present |
| `install algif_aead /bin/false` overrides | ❌ none found |
| `algif_aead` module on disk | ✅ intact at `/lib/modules/6.8.0-110-generic/...` |
| `CVE-2026-31431` in `linux-image-generic` changelog | ❌ no reference at audit time |

**Conclusion:** Option 2 was not applied (good — it would have broken kernel crypto). Option 1 is unnecessary because the VPS is already on the latest `noble-security` kernel and `unattended-upgrades` is active with 0 security-tagged updates pending. **No action required from the email itself.**

## VPS state at audit time

- Host: `srv1548487` · `187.124.183.140`
- OS: Ubuntu 24.04.4 LTS
- Kernel: `6.8.0-110-generic` (latest noble-security)
- `unattended-upgrades`: enabled + active (last run 2026-04-30 06:13)
- Pending security updates: **0 of 10 upgradable** (none security-tagged)

## Real findings (unrelated to phishing) — addressed

### 1. Active SSH brute-force from `130.61.152.179` (Oracle Cloud)

5+ user enumeration attempts in 30 minutes (`ftpuser`, `ts3server`, `rtest`, `test`, `ubuntu`).

**Mitigation:**
- Installed `fail2ban 1.0.2-3ubuntu0.1`.
- Added `/etc/fail2ban/jail.local`:
  - `[sshd]`: `bantime=86400`, `findtime=600`, `maxretry=3`, mode=aggressive
  - `[recidive]`: 7-day ban for repeat offenders
- Status: enabled + active, 2 jails (sshd, recidive).

### 2. SSH allowed root password login

`PermitRootLogin yes` + `PasswordAuthentication yes` were effective despite `60-cloudimg-settings.conf` setting `PasswordAuthentication no`, because `50-cloud-init.conf` sorts first and OpenSSH uses **first-match** for `sshd_config` directives.

**Mitigation:**
- Backups taken: `/root/sshd_config.bak.20260430-113051`, `/root/sshd_config.d.bak.20260430-113051`.
- Created `/etc/ssh/sshd_config.d/00-al-ruya-hardening.conf` (sorts first → wins):
  ```
  PasswordAuthentication no
  KbdInteractiveAuthentication no
  PubkeyAuthentication yes
  PermitEmptyPasswords no
  PermitRootLogin prohibit-password
  MaxAuthTries 3
  LoginGraceTime 30
  ClientAliveInterval 300
  ClientAliveCountMax 2
  ```
- `sshd -t` validated config; `systemctl reload ssh` applied.
- Verified: fresh SSH key login works (`whoami=root`); password auth rejected with `Permission denied (publickey)`.

### 3. `prometheus-node-exporter` listening on `*:9100`

Initially appeared exposed to the internet, but UFW already restricts ingress on `9100/tcp` to the docker bridge networks (`172.17.0.0/16`, `172.18.0.0/16`). **No change needed.**

### 4. Port `5002` (`node /opt/siraj`) public

Owned by sirajalquran.org system. Out of scope for this audit per `infra/DEPLOY.md` ("لا يُمَس مطلقاً").

## Files added in repo

- `infra/scripts/security-audit-readonly.sh` — re-runnable read-only audit.
- `governance/SECURITY_AUDIT_2026-04-30.md` — this document.

## Branch

`chore/vps-security-hardening` (separate from `fix/i062-i066-rls-rollout` to keep scope clean).

## Verification commands (re-runnable)

```bash
# From local (audit only)
ssh ibherp 'bash -s' < infra/scripts/security-audit-readonly.sh

# Confirm SSH hardening still in effect
ssh ibherp 'sshd -T | grep -E "^(passwordauthentication|permitrootlogin|maxauthtries) "'
# Expected:
#   maxauthtries 3
#   passwordauthentication no
#   permitrootlogin without-password

# Confirm fail2ban active
ssh ibherp 'fail2ban-client status'
# Expected: jails = recidive, sshd
```

## Rollback (if ever needed)

```bash
# Restore SSH config
ssh ibherp 'cp /root/sshd_config.bak.20260430-113051 /etc/ssh/sshd_config && \
            rm -rf /etc/ssh/sshd_config.d && \
            cp -r /root/sshd_config.d.bak.20260430-113051 /etc/ssh/sshd_config.d && \
            sshd -t && systemctl reload ssh'

# Disable fail2ban
ssh ibherp 'systemctl disable --now fail2ban && apt-get remove -y fail2ban'
```

## Risk

🟢 **Low.** All changes are reversible. SSH lockout risk mitigated by:
- Validating config with `sshd -t` before reload.
- Verifying fresh key-based connection succeeds before considering the change complete.
- Keeping a backup of the prior config on the VPS.
