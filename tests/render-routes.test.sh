#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if grep -Eq '^[[:space:]]*source:[[:space:]]*/\*[[:space:]]*$' "$ROOT/render.yaml"; then
  echo 'render-routes-test: catch-all rewrite must not be present; it sends assets and pages to 404.html' >&2
  exit 1
fi
for route in marketplace free-codes most-added won-codes login admin-login admin-users; do
  grep -q "source: /$route" "$ROOT/render.yaml"
done
grep -q 'destination: /marketplace.html' "$ROOT/render.yaml"
grep -q 'destination: /most-added.html' "$ROOT/render.yaml"
grep -q 'destination: /won-codes.html' "$ROOT/render.yaml"
echo 'render-routes-test: passed'
