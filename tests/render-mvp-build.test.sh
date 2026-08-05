#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp -R "$ROOT"/. "$TMP"/
(
  cd "$TMP"
  SUPABASE_URL='https://example.supabase.co' \
  SUPABASE_PUBLISHABLE_KEY='sb_publishable_example_key_abcdefghijklmnopqrstuvwxyz123456' \
  bash scripts/render-build.sh >/tmp/sporty_mvp_build.log
)
grep -q 'sporty.codes 21.5.0' "$TMP/.render-site/render-build.txt"
grep -q 'sportybet-browser-agent-custom-api' "$TMP/.render-site/render-build.txt"
grep -q 'https://example.supabase.co' "$TMP/.render-site/config.js"
grep -q 'sb_publishable_example_key' "$TMP/.render-site/config.js"
test -f "$TMP/.render-site/smart-board.html"
test -f "$TMP/.render-site/login.html"
test -f "$TMP/.render-site/admin-login.html"
test -f "$TMP/.render-site/admin-users.html"
test -f "$TMP/.render-site/privacy.html"
test -f "$TMP/.render-site/account.html"
test -f "$TMP/.render-site/saved.html"
test -f "$TMP/.render-site/login/index.html"
test -f "$TMP/.render-site/admin-login/index.html"
test -f "$TMP/.render-site/admin-users/index.html"
test -f "$TMP/.render-site/privacy/index.html"
test -f "$TMP/.render-site/account/index.html"
test -f "$TMP/.render-site/saved/index.html"
test -f "$TMP/.render-site/src/auth.js"
test -f "$TMP/.render-site/src/market-board.js"
test -f "$TMP/.render-site/src/login.js"
test -f "$TMP/.render-site/src/admin-login.js"
test -f "$TMP/.render-site/src/admin-users.js"
test -f "$TMP/.render-site/src/saved.js"
test -f "$TMP/.render-site/src/account.js"
test -f "$TMP/.render-site/src/saved-page.js"
test -f "$TMP/.render-site/src/experience.js"
test -f "$TMP/.render-site/src/handoff.js"
test -f "$TMP/.render-site/responsive.css"
test -f "$TMP/.render-site/assets/logo-wordmark-dark.webp"
test ! -e "$TMP/.render-site/supabase"
test ! -e "$TMP/.render-site/tests"
test ! -e "$TMP/.render-site/scripts"
test -f "$TMP/.render-site/assets/logo-email.png"
echo 'Render branded account email build test passed'
