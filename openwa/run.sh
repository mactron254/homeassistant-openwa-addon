#!/usr/bin/env bash
set -euo pipefail

OPTIONS_FILE="/data/options.json"
OPENWA_DATA_DIR="/data/openwa"

mkdir -p "${OPENWA_DATA_DIR}/sessions"
mkdir -p "${OPENWA_DATA_DIR}/media"
mkdir -p "${OPENWA_DATA_DIR}/plugins"

read_option() {
  local key="$1"
  local default_value="$2"

  python3 - "$OPTIONS_FILE" "$key" "$default_value" <<'PY'
import json
import sys

path = sys.argv[1]
key = sys.argv[2]
default_value = sys.argv[3]

try:
    with open(path, "r", encoding="utf-8") as file:
        data = json.load(file)
except Exception:
    print(default_value)
    raise SystemExit(0)

value = data.get(key, default_value)
if value is None:
    value = default_value

print(value)
PY
}

API_MASTER_KEY="$(read_option api_master_key "")"
LOG_LEVEL="$(read_option log_level "info")"

export API_KEY="owa_static_key_2026_development"
export NODE_ENV=development

# Force the static API key into the generated config file to prevent random generation
mkdir -p /app/data
echo "API_KEY=${API_KEY}" > /app/data/.env.generated
echo "API_KEY=${API_KEY}" > /data/.env.generated 2>/dev/null || true
export PORT=2785
export LOG_LEVEL="${LOG_LEVEL}"

export DATABASE_TYPE=sqlite
export DATABASE_NAME="${OPENWA_DATA_DIR}/openwa.sqlite"
export DATABASE_SYNCHRONIZE=false

export ENGINE_TYPE=whatsapp-web.js
export SESSION_DATA_PATH="${OPENWA_DATA_DIR}/sessions"
export PUPPETEER_HEADLESS=true
export PUPPETEER_ARGS="--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage,--disable-gpu"

export STORAGE_TYPE=local
export STORAGE_LOCAL_PATH="${OPENWA_DATA_DIR}/media"

export REDIS_ENABLED=false

export WEBHOOK_TIMEOUT=10000
export WEBHOOK_MAX_RETRIES=3
export WEBHOOK_RETRY_DELAY=5000

export RATE_LIMIT_TTL=60
export RATE_LIMIT_MAX=100

export PLUGINS_ENABLED=true
export PLUGINS_DIR="${OPENWA_DATA_DIR}/plugins"

export API_MASTER_KEY="${API_MASTER_KEY}"

echo "[OpenWA Add-on] Starting helper server on port 2786..."
python3 /usr/local/bin/helper_server.py &
HELPER_PID="$!"

cleanup() {
  echo "[OpenWA Add-on] Stopping helper server..."
  kill "${HELPER_PID}" 2>/dev/null || true
}

trap cleanup EXIT

echo "[OpenWA Add-on] Starting OpenWA API on port 2785..."
echo "[OpenWA Add-on] Data directory: ${OPENWA_DATA_DIR}"

cd /app 2>/dev/null || true

if [ -f "/app/dist/main.js" ]; then
  exec node /app/dist/main.js
fi

if [ -f "/app/dist/src/main.js" ]; then
  exec node /app/dist/src/main.js
fi

if [ -f "dist/main.js" ]; then
  exec node dist/main.js
fi

if [ -f "dist/src/main.js" ]; then
  exec node dist/src/main.js
fi

if command -v npm >/dev/null 2>&1; then
  exec npm run start:prod
fi

echo "[OpenWA Add-on] Could not find OpenWA start command."
exit 1