#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Al-Ruya ERP — Security Audit (READ-ONLY, safe to run anytime)
# Verifies real kernel/security state; prompted by suspicious phishing email
# claiming "CVE-2026-31431 / Copy Fail" requiring algif_aead disablement.
#
# This script makes ZERO modifications. Verify with:
#   grep -E '(apt (install|upgrade|remove)|rm |mv |sed -i|systemctl (stop|disable|mask)|>|chmod [0-9])' \
#     infra/scripts/security-audit-readonly.sh
# (the only matches should be the grep self-reference and the curl pipe).
#
# Usage on VPS:
#   bash /tmp/security-audit-readonly.sh
# ─────────────────────────────────────────────────────────────────────────────

set -u

C='\033[0;36m'; G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; NC='\033[0m'
sec() { echo -e "\n${C}══════ $* ══════${NC}"; }
ok()  { echo -e "${G}✓${NC} $*"; }
warn(){ echo -e "${Y}⚠${NC} $*"; }
err() { echo -e "${R}✗${NC} $*"; }
have(){ command -v "$1" &>/dev/null; }

echo "Al-Ruya ERP — Security Audit (read-only)"
echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Host: $(hostname)"

# 1. System info
sec "1. System"
uname -a
if [ -f /etc/os-release ]; then . /etc/os-release; echo "OS: $PRETTY_NAME"; fi
echo "Uptime: $(uptime -p 2>/dev/null || uptime)"
echo "Boot:   $(uptime -s 2>/dev/null || true)"

# 2. Kernel + suspect CVE check
sec "2. Kernel & alleged CVE-2026-31431"
echo "Running kernel: $(uname -r)"
echo "Build:          $(cat /proc/version 2>/dev/null)"
if have apt-cache; then
  echo "── Available linux-image-generic ──"
  apt-cache madison linux-image-generic 2>/dev/null | head -5 || warn "apt-cache madison failed"
fi
echo "── Search apt changelogs for CVE-2026-31431 (expected: no result) ──"
if have apt-get; then
  # apt-get changelog is read-only network fetch; bound the time
  timeout 8 apt-get changelog linux-image-generic 2>/dev/null | grep -i 'CVE-2026-31431' \
    && err "FOUND CVE-2026-31431 reference (suspicious — re-verify with NVD)" \
    || ok "No CVE-2026-31431 in linux-image-generic changelog"
fi

# 3. Pending security updates
sec "3. Pending security updates"
if have apt; then
  upgradable=$(apt list --upgradable 2>/dev/null)
  total=$(echo "$upgradable" | grep -c '/' || true)
  sec_count=$(echo "$upgradable" | grep -c -i 'security' || true)
  echo "Total upgradable packages:    $total"
  echo "Security-tagged upgradable:   $sec_count"
  if [ "$sec_count" -gt 0 ]; then
    echo "── Security packages ──"
    echo "$upgradable" | grep -i 'security' | head -20
  fi
else
  warn "apt not present"
fi

# 4. Unattended upgrades
sec "4. Unattended-upgrades"
if systemctl list-unit-files unattended-upgrades.service &>/dev/null; then
  echo "Enabled: $(systemctl is-enabled unattended-upgrades 2>/dev/null)"
  echo "Active:  $(systemctl is-active unattended-upgrades 2>/dev/null)"
  if [ -f /etc/apt/apt.conf.d/20auto-upgrades ]; then
    echo "── /etc/apt/apt.conf.d/20auto-upgrades ──"
    cat /etc/apt/apt.conf.d/20auto-upgrades
  fi
  if [ -d /var/log/unattended-upgrades ]; then
    echo "── Recent unattended-upgrades log files ──"
    ls -lt /var/log/unattended-upgrades/ 2>/dev/null | head -5
  fi
else
  warn "unattended-upgrades not installed"
fi

# 5. algif_aead module — ensure phishing instructions were NOT executed
sec "5. algif_aead module (phishing-instruction integrity check)"
echo "── Loaded algif* modules (should typically be present or auto-loadable) ──"
lsmod 2>/dev/null | grep -E '^algif' || echo "(no algif* currently loaded — normal; loaded on demand)"
echo "── /etc/modprobe.d entries blocking algif_aead (should be NONE) ──"
if ls /etc/modprobe.d/ 2>/dev/null | grep -i 'algif\|disable-algif' ; then
  err "FOUND blocking entry — phishing commands may have been executed!"
else
  ok "No /etc/modprobe.d/*algif* blocking files — phishing commands NOT executed"
fi
grep -rEn '^[[:space:]]*install[[:space:]]+algif_aead' /etc/modprobe.d/ 2>/dev/null \
  && err "FOUND 'install algif_aead' override — investigate!" \
  || ok "No 'install algif_aead' overrides in /etc/modprobe.d/"
echo "── modinfo algif_aead ──"
modinfo algif_aead 2>/dev/null | head -8 || warn "modinfo failed"

# 6. SSH hardening
sec "6. SSH server config (sshd -T)"
if have sshd; then
  sshd -T 2>/dev/null | grep -E '^(port|permitrootlogin|passwordauthentication|pubkeyauthentication|permitemptypasswords|x11forwarding|maxauthtries|protocol)' | sort
else
  warn "sshd binary not found in PATH"
fi

# 7. Listening services
sec "7. Listening services"
if have ss; then
  ss -tulnp 2>/dev/null | head -40
elif have netstat; then
  netstat -tulnp 2>/dev/null | head -40
else
  warn "neither ss nor netstat available"
fi

# 8. Auth anomalies
sec "8. Recent auth anomalies"
echo "── Last 5 failed login attempts (lastb) ──"
lastb -n 5 2>/dev/null || warn "lastb unavailable (no /var/log/btmp?)"
echo "── Last 20 ssh journal entries with fail/invalid ──"
journalctl -u ssh -n 200 --no-pager 2>/dev/null | grep -iE 'fail|invalid' | tail -20 \
  || journalctl -u sshd -n 200 --no-pager 2>/dev/null | grep -iE 'fail|invalid' | tail -20 \
  || warn "no journalctl entries"

sec "Audit complete"
echo "Review the four key questions:"
echo "  1. Pending security packages?     (section 3)"
echo "  2. unattended-upgrades enabled?   (section 4)"
echo "  3. algif_aead NOT blocked?        (section 5)"
echo "  4. SSH hardening reasonable?      (section 6)"
