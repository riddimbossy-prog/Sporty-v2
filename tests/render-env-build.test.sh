#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp -R "$ROOT"/. "$TMP"/
(
  cd "$TMP"
  SUPABASE_URL='https://example.supabase.co' \
  SUPABASE_PUBLISHABLE_KEY='sb_publishable_example_key_abcdefghijklmnopqrstuvwxyz123456' \
  bash scripts/render-build.sh >/tmp/sporty_render_test.log
)
grep -q 'https://example.supabase.co' "$TMP/.render-site/config.js"
grep -q 'sb_publishable_example_key' "$TMP/.render-site/config.js"
grep -q 'sporty.codes 21.6.1' "$TMP/.render-site/render-build.txt"
test -f "$TMP/.render-site/assets/logo-wordmark-dark.webp"
test -f "$TMP/.render-site/login.html"
test -f "$TMP/.render-site/admin-login.html"
test -f "$TMP/.render-site/admin-users.html"
test ! -e "$TMP/.render-site/supabase"
echo 'render-env-build-test: passed'
