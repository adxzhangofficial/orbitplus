#!/usr/bin/env bash
# Mints an API key for local CLI testing.
#
# Usage:  bash cli/scripts-make-key.sh [scopes]
# Prints the secret once — the API never shows it again.
set -euo pipefail

API="${ORBIT_API_URL:-http://127.0.0.1:4400/api/v1}"
EMAIL="${ORBIT_EMAIL:-admin@orbit.dev}"
PASSWORD="${ORBIT_PASSWORD:-OrbitAdmin123!}"
SCOPES="${1:-\"servers:read\",\"servers:write\",\"files:read\",\"files:write\",\"backups:read\",\"backups:write\",\"transfers:read\",\"transfers:write\",\"deployments:read\",\"monitoring:read\",\"activity:read\"}"

TOKEN=$(curl -s -m 15 -X POST "$API/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).data.token')

curl -s -m 15 -X POST "$API/api-keys" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"CLI local testing\",\"scopes\":[$SCOPES]}" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).data.secret'
