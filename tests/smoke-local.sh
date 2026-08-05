#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PORT="${PORT:-18765}"
rm -rf .render-site
bash scripts/render-build.sh >/tmp/sporty-build.log
PORT="$PORT" node server/index.mjs >/tmp/sporty-server.log 2>&1 &
PID=$!
cleanup(){ kill "$PID" 2>/dev/null || true; }
trap cleanup EXIT
for _ in {1..30}; do
  curl -fsS "http://127.0.0.1:$PORT/api/health" >/tmp/sporty-health.json && break
  sleep 0.2
done
curl -fsS "http://127.0.0.1:$PORT/" >/dev/null
curl -fsS "http://127.0.0.1:$PORT/deployment-check.html" >/dev/null
curl -fsS "http://127.0.0.1:$PORT/api/get_code_hub_codes?limit=1" >/dev/null
curl -fsS "http://127.0.0.1:$PORT/api/get_upcoming_events?days=1" >/dev/null
node -e "const h=require('/tmp/sporty-health.json');if(!h.ok||h.version!=='21.5.4')process.exit(1)"
echo "Local smoke test passed on port $PORT"
