#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Al-Ruya ERP — VPS Inspection (READ-ONLY, safe to run anytime)
# Maps the current state of the VPS before deployment changes.
#
# Usage on VPS:
#   curl -fsSL https://raw.githubusercontent.com/ahrrfy/IBH/main/infra/scripts/vps-inspect.sh | bash
# ─────────────────────────────────────────────────────────────────────────────

set -uo pipefail

C='\033[0;36m'; G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; NC='\033[0m'
sec() { echo -e "\n${C}══════ $* ══════${NC}"; }
ok()  { echo -e "${G}✓${NC} $*"; }
warn(){ echo -e "${Y}⚠${NC} $*"; }
err() { echo -e "${R}✗${NC} $*"; }
have(){ command -v "$1" &>/dev/null; }

sec "1. System"
echo "Host:    $(hostname)"
echo "OS:      $(. /etc/os-release && echo "$PRETTY_NAME")"
echo "Kernel:  $(uname -r)"
echo "Uptime:  $(uptime -p 2>/dev/null || uptime)"
echo "RAM:     $(free -h | awk '/^Mem:/ {print $3 " used / " $2 " total"}')"
echo "Disk /:  $(df -h / | awk 'NR==2 {print $3 " used / " $2 " total (" $5 " used)"}')"
echo "Public IP: $(curl -s --max-time 3 ifconfig.me 2>/dev/null || echo unknown)"

sec "2. Listening ports (80/443/3000/3001/5432/6379/9000)"
if have ss; then
  ss -tulnp 2>/dev/null | awk 'NR==1 || /:(80|443|3000|3001|5432|6379|9000|9001) /' || true
elif have netstat; then
  netstat -tulnp 2>/dev/null | awk 'NR<=2 || /:(80|443|3000|3001|5432|6379|9000|9001) /' || true
else
  warn "Neither ss nor netstat available"
fi

sec "3. Docker"
if have docker; then
  ok "Docker installed: $(docker --version)"
  if docker compose version &>/dev/null; then
    ok "Compose plugin: $(docker compose version --short)"
  else
    warn "docker compose plugin NOT installed"
  fi
  echo
  echo "── Running containers ──"
  docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || warn "cannot list containers"
  echo
  echo "── All containers (incl. stopped) ──"
  docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' 2>/dev/null | head -30
  echo
  echo "── Networks ──"
  docker network ls 2>/dev/null
  echo
  echo "── Volumes (top 20) ──"
  docker volume ls 2>/dev/null | head -20
else
  warn "Docker NOT installed"
fi

sec "4. Nginx / Apache (host-level, not in Docker)"
if systemctl is-active --quiet nginx 2>/dev/null; then
  warn "host nginx is RUNNING — will conflict with our Docker nginx on :80/:443"
  echo "  Configs:"
  ls -la /etc/nginx/sites-enabled/ 2>/dev/null | tail -n +2 | head -20
  ls -la /etc/nginx/conf.d/ 2>/dev/null | tail -n +2 | head -20
elif systemctl list-unit-files nginx.service &>/dev/null; then
  ok "host nginx installed but stopped"
else
  ok "no host nginx"
fi
if systemctl is-active --quiet apache2 2>/dev/null; then
  warn "Apache is RUNNING — will conflict with :80/:443"
else
  ok "no Apache running"
fi

sec "5. Existing 'ibh' / 'siraj' artifacts"
echo "── Containers matching 'ibh' or 'siraj' ──"
docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}' 2>/dev/null | grep -Ei 'ibh|siraj|quran' || ok "none found"
echo
echo "── Directories under /opt, /var/www, /srv, /root ──"
ls -ld /opt/* /var/www/* /srv/* /root/*-* 2>/dev/null | head -30 || true
echo
echo "── Cron jobs ──"
crontab -l 2>/dev/null | head -20 || ok "no root cron"

sec "6. DNS for our domains"
for d in ibherp.cloud sirajalquran.org; do
  res=$(dig +short "$d" 2>/dev/null | head -1)
  if [ -z "$res" ]; then
    warn "$d → no A record (or dig missing)"
  else
    echo "$d → $res"
  fi
done

sec "7. Firewall"
if have ufw; then
  ufw status 2>/dev/null | head -15
else
  warn "ufw not installed"
fi

sec "8. Letsencrypt certs"
if [ -d /etc/letsencrypt/live ]; then
  ls /etc/letsencrypt/live 2>/dev/null
else
  ok "no existing Let's Encrypt certs"
fi

sec "Done"
echo "Send this output back so we can plan the safe migration."
