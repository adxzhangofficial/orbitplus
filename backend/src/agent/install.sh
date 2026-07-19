#!/bin/sh
# Orbit+ read-only server agent.
#
# Reports directory metadata and host metrics to Orbit over outbound HTTPS.
# It opens no port, accepts no commands, and never writes to anything outside
# its own state directory. Everything Orbit can do to this machine still goes
# over SFTP with the credentials you configured; enrolling this agent grants no
# additional ability to act on the host.
#
# Read it before running it. It is deliberately short and dependency-free.
#
#   curl -fsSL https://your-orbit/api/v1/agent/install.sh \
#     | sudo ORBIT_API_URL=... ORBIT_ENROLLMENT_TOKEN=... sh
set -eu

ORBIT_API_URL="${ORBIT_API_URL:-}"
ORBIT_ENROLLMENT_TOKEN="${ORBIT_ENROLLMENT_TOKEN:-}"
ORBIT_ROOT="${ORBIT_ROOT:-/}"
ORBIT_MAX_DEPTH="${ORBIT_MAX_DEPTH:-12}"
STATE_DIR="/var/lib/orbit-agent"
BIN="/usr/local/bin/orbit-agent"

[ -n "$ORBIT_API_URL" ] || { echo "ORBIT_API_URL is required" >&2; exit 1; }
[ -n "$ORBIT_ENROLLMENT_TOKEN" ] || { echo "ORBIT_ENROLLMENT_TOKEN is required" >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; exit 1; }

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"

echo "Enrolling with $ORBIT_API_URL ..."
RESPONSE=$(curl -fsS -X POST "$ORBIT_API_URL/agent/enroll" \
  -H 'content-type: application/json' \
  -d "{\"enrollmentToken\":\"$ORBIT_ENROLLMENT_TOKEN\",\"hostname\":\"$(hostname)\",\"platform\":\"$(uname -sr)\",\"agentVersion\":\"1.0.0\"}")

# Extracted without jq so the agent has no dependency beyond curl.
AGENT_TOKEN=$(printf '%s' "$RESPONSE" | sed -n 's/.*"agentToken":"\([^"]*\)".*/\1/p')
[ -n "$AGENT_TOKEN" ] || { echo "Enrolment failed: $RESPONSE" >&2; exit 1; }

umask 077
printf '%s' "$AGENT_TOKEN" > "$STATE_DIR/token"
chmod 600 "$STATE_DIR/token"

cat > "$BIN" <<'AGENT'
#!/bin/sh
# Collects read-only data and posts it to Orbit. Sends only; never receives
# anything it acts on.
set -eu
API_URL="$(cat /var/lib/orbit-agent/api_url)"
TOKEN="$(cat /var/lib/orbit-agent/token)"
ROOT="$(cat /var/lib/orbit-agent/root)"
MAX_DEPTH="$(cat /var/lib/orbit-agent/max_depth)"
TREE_EVERY=10
counter_file=/var/lib/orbit-agent/counter
[ -f "$counter_file" ] || echo 0 > "$counter_file"

metrics() {
  cpu=$(awk '/^cpu /{u=$2+$4; t=$2+$4+$5; if(t>0) printf "%.1f", u*100/t}' /proc/stat 2>/dev/null || echo "")
  mem=$(awk '/MemTotal/{t=$2} /MemAvailable/{a=$2} END{ if(t>0) printf "%.1f", (t-a)*100/t }' /proc/meminfo 2>/dev/null || echo "")
  disk=$(df -P "$ROOT" 2>/dev/null | awk 'NR==2{gsub("%","",$5); print $5}' || echo "")
  up=$(awk '{printf "%d", $1}' /proc/uptime 2>/dev/null || echo "")
  out=""
  [ -n "$cpu" ] && out="$out\"cpuPercent\":$cpu,"
  [ -n "$mem" ] && out="$out\"memoryPercent\":$mem,"
  [ -n "$disk" ] && out="$out\"diskPercent\":$disk,"
  [ -n "$up" ] && out="$out\"uptimeSeconds\":$up,"
  printf '{%s}' "$(printf '%s' "$out" | sed 's/,$//')"
}

# Emitted as JSON directly so the whole tree never has to be held in memory.
tree_json() {
  printf '['
  first=1
  find "$ROOT" -maxdepth "$MAX_DEPTH" \
    \( -name node_modules -o -name .git -o -name venv -o -name .venv \
       -o -name __pycache__ -o -name vendor -o -name dist -o -name build \
       -o -name .next -o -name target -o -name .cache \) -prune -o \
    -printf '%y\t%s\t%T@\t%m\t%p\n' 2>/dev/null | head -n 200000 | \
  while IFS="$(printf '\t')" read -r type size mtime mode path; do
    case "$type" in d) t=directory ;; l) t=symlink ;; *) t=file ;; esac
    rel=$(printf '%s' "$path" | sed "s|^$ROOT||")
    [ -z "$rel" ] && continue
    case "$rel" in /*) ;; *) rel="/$rel" ;; esac
    esc=$(printf '%s' "$rel" | sed 's/\\/\\\\/g; s/"/\\"/g')
    [ "$first" = 1 ] && first=0 || printf ','
    printf '{"path":"%s","type":"%s","size":%s,"mode":"%s","modifiedAt":%s}' \
      "$esc" "$t" "${size:-0}" "${mode:-}" "${mtime%%.*}"
  done
  printf ']'
}

count=$(cat "$counter_file")
count=$((count + 1))
echo "$count" > "$counter_file"

if [ $((count % TREE_EVERY)) -eq 1 ]; then
  body="{\"metrics\":$(metrics),\"entries\":$(tree_json)}"
else
  body="{\"metrics\":$(metrics)}"
fi

printf '%s' "$body" | curl -fsS --max-time 120 -X POST "$API_URL/agent/report" \
  -H 'content-type: application/json' \
  -H "x-orbit-agent-token: $TOKEN" \
  --data-binary @- >/dev/null 2>&1 || exit 0
AGENT

printf '%s' "$ORBIT_API_URL"    > "$STATE_DIR/api_url"
printf '%s' "$ORBIT_ROOT"       > "$STATE_DIR/root"
printf '%s' "$ORBIT_MAX_DEPTH"  > "$STATE_DIR/max_depth"
chmod 700 "$BIN"

if command -v systemctl >/dev/null 2>&1; then
  cat > /etc/systemd/system/orbit-agent.service <<UNIT
[Unit]
Description=Orbit+ read-only server agent
After=network-online.target

[Service]
Type=oneshot
ExecStart=$BIN
# No write access anywhere except its own state directory, and no ability to
# gain privileges. The agent only reads.
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$STATE_DIR
NoNewPrivileges=true
PrivateTmp=true
UNIT

  cat > /etc/systemd/system/orbit-agent.timer <<'UNIT'
[Unit]
Description=Run the Orbit+ agent periodically

[Timer]
OnBootSec=30s
OnUnitActiveSec=60s
AccuracySec=5s

[Install]
WantedBy=timers.target
UNIT

  systemctl daemon-reload
  systemctl enable --now orbit-agent.timer
  echo "Installed. Reporting every 60s via systemd timer."
else
  # Fall back to cron on systems without systemd.
  ( crontab -l 2>/dev/null | grep -v orbit-agent; echo "* * * * * $BIN" ) | crontab -
  echo "Installed. Reporting every 60s via cron."
fi

"$BIN" || true
echo "First report sent. Uninstall with: systemctl disable --now orbit-agent.timer; rm -rf $STATE_DIR $BIN"
