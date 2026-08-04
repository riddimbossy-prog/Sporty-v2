#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(pwd)"
OUTPUT_DIR="$REPO_DIR/.render-site"
VERSION="$(tr -d '\r\n' < "$APP_DIR/VERSION" 2>/dev/null || printf '21.0.0')"
SUPABASE_URL_VALUE="${SUPABASE_URL:-}"
SUPABASE_KEY_VALUE="${SUPABASE_PUBLISHABLE_KEY:-}"

SETUP_PENDING=false
if [[ -z "$SUPABASE_URL_VALUE" || -z "$SUPABASE_KEY_VALUE" ]]; then
  SETUP_PENDING=true
  echo "Render build notice: Supabase browser configuration is not connected yet. The staging site will open in setup mode."
fi

# Only code and public static assets are hard requirements. Runtime data is
# copied when present and receives safe output-only defaults when absent.
CORE_REQUIRED=(
  index.html international.html marketplace.html smart-board.html elite-picks.html most-added.html won-codes.html
  performance.html sources.html control-room.html login.html admin-users.html
  privacy.html admin-login.html account.html saved.html deployment-check.html 404.html offline.html manifest.json service-worker.js styles.css responsive.css pwa.css
  favicon.svg
  src/mvp.js src/intelligence.js src/elite.js src/stability.js src/control-room.js src/region.js src/international.js
  src/handoff.js src/share.js src/auth.js src/member-home.js src/login.js src/admin-login.js src/admin-users.js src/saved.js src/account.js src/saved-page.js src/pwa.js src/experience.js
  assets/logo-mark.png assets/logo-wordmark-dark.png assets/logo-wordmark-light.png assets/logo-mark.webp assets/logo-wordmark-dark.webp assets/logo-wordmark-light.webp
  assets/logo-email.png assets/share-card-default.png
  icons/icon-192.png icons/icon-512.png icons/maskable-512.png
  supabase/migrations/002_auth_presence_admin.sql
  supabase/migrations/003_official_admin_lockdown.sql
  supabase/migrations/004_user_utility_admin_controls.sql
  supabase/migrations/005_remove_member_location_data.sql
  supabase/migrations/006_member_personalization.sql
  supabase/migrations/007_custom_api.sql
  server/index.mjs server/lib/core.mjs server/lib/supabase.mjs server/lib/data-service.mjs
  supabase/email-templates/confirm-signup.html
  supabase/email-templates/reset-password.html
  supabase/email-templates/password-changed.html
)

for required in "${CORE_REQUIRED[@]}"; do
  if [[ ! -f "$APP_DIR/$required" ]]; then
    echo "Render build error: missing $required" >&2
    exit 1
  fi
done

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"
if [[ "$APP_DIR" == "$REPO_DIR" ]]; then
  (cd "$APP_DIR" && tar --exclude='./.git' --exclude='./.render-site' -cf - .) | (cd "$OUTPUT_DIR" && tar -xf -)
else
  cp -R "$APP_DIR"/. "$OUTPUT_DIR"/
fi

# Repository-only implementation files must never be published by the static site.
rm -rf "$OUTPUT_DIR/.git" "$OUTPUT_DIR/.github" "$OUTPUT_DIR/tests" "$OUTPUT_DIR/scripts" "$OUTPUT_DIR/supabase" "$OUTPUT_DIR/server"
find "$OUTPUT_DIR" -maxdepth 1 -type f -name '*.md' -delete
rm -f "$OUTPUT_DIR/package.json" "$OUTPUT_DIR/package-lock.json" "$OUTPUT_DIR/render.yaml" "$OUTPUT_DIR/.gitignore"
rm -f "$OUTPUT_DIR/assets/logo-mark.png" "$OUTPUT_DIR/assets/logo-wordmark-dark.png" "$OUTPUT_DIR/assets/logo-wordmark-light.png" "$OUTPUT_DIR/assets/logo-wordmark-dark@2x.png" "$OUTPUT_DIR/assets/logo-wordmark-light@2x.png"

mkdir -p "$OUTPUT_DIR/data"
rm -f "$OUTPUT_DIR/data/elite-cache.json" "$OUTPUT_DIR/data/elite-history.json"

write_default_json() {
  local path="$1"
  local payload="$2"
  if [[ ! -f "$OUTPUT_DIR/data/$path" ]]; then
    printf '%s\n' "$payload" > "$OUTPUT_DIR/data/$path"
    echo "Render build notice: using an output-only default for data/$path"
  fi
}

write_default_json "codehub-banner.json" '{"version":3,"source":"sporty.codes-custom-api","generated_at":null,"status":"waiting_for_sync","count":0,"items":[]}'
write_default_json "tip-history.json" '{"version":3,"updated_at":null,"tips":[],"codes":[]}'
write_default_json "source-stats.json" '{"version":2,"updated_at":null,"sources":[]}'
write_default_json "performance-summary.json" '{"version":2,"updated_at":null,"total_settled":0,"verified_only":true,"groups":[]}'
write_default_json "feed-health.json" '{"version":2,"state":"preparing","source_name":"Public Code Hub","schedule":"Hourly","last_attempt_at":null,"last_successful_at":null,"last_failure_at":null,"last_error":null,"consecutive_failures":0,"max_public_age_hours":30,"published_count":0,"fresh_count":0,"mapped_slips":0,"mapped_tips":0,"hidden_count":0,"rejected_count":0,"duplicate_count":0,"expired_count":0,"incomplete_count":0,"rejected_by_reason":{},"quality_score":0,"public_status":"Preparing"}'
write_default_json "manual-overrides.json" '{"version":2,"updated_at":null,"overrides":[]}'
write_default_json "settlement-ledger.json" '{"version":1,"updated_at":null,"entries":[]}'
write_default_json "elite-picks.json" '{"version":1,"generated_at":null,"status":"waiting_for_sync","count":0,"elite_verified":0,"elite_supported":0,"trending":0,"items":[]}'
write_default_json "elite-feed-health.json" '{"version":1,"state":"preparing","last_attempt_at":null,"last_successful_at":null,"last_error":null,"candidate_count":0,"published_count":0,"credits_used":0,"run_credit_budget":60}'
write_default_json "elite-performance.json" '{"version":1,"updated_at":null,"verified_results_only":true,"minimum_public_sample":30,"total_settled":0,"groups":[]}'
write_default_json "results-summary.json" '{"version":1,"updated_at":null,"verified_total":0,"verified_won":0,"verified_lost":0,"verified_void":0,"needs_review":0,"latest_verified_at":null,"methods":{}}'

cat > "$OUTPUT_DIR/config.js" <<CONFIG
window.SPORTY_CONFIG = {
  mode: "auto",
  allowDemoFallback: false,
  setupPending: ${SETUP_PENDING},
  configSource: "render-build",
  buildVersion: "${VERSION}",
  supabaseUrl: "${SUPABASE_URL_VALUE}",
  supabaseAnonKey: "${SUPABASE_KEY_VALUE}",
  currency: "GHS",
  platformFeePercent: 10,
  codeHubBannerEnabled: true,
  apiBaseUrl: "/api",
  codeHubFeedUrl: "/api/get_code_hub_codes",
  upcomingEventsUrl: "/api/get_upcoming_events",
  codeHubLoadUrl: "https://www.sportybet.com/gh/m/code-hub/load-code",
  sportyOfficialUrl: "https://www.sportybet.com/",
  regionalSites: { GH: "https://www.sportybet.com/gh/" },
  carouselIntervalMs: 4300
};
CONFIG

printf 'sporty.codes %s\nproduct: clean-start-custom-api\napi: same-domain-compatibility-api\nsetup_pending: %s\n' "$VERSION" "$SETUP_PENDING" > "$OUTPUT_DIR/render-build.txt"

for route in international marketplace free-codes smart-board elite-picks most-added won-codes performance sources control-room login admin-login admin-users privacy account saved deployment-check; do
  mkdir -p "$OUTPUT_DIR/$route"
  source="$OUTPUT_DIR/${route}.html"
  [[ -f "$source" ]] || source="$OUTPUT_DIR/marketplace.html"
  cp "$source" "$OUTPUT_DIR/$route/index.html"
done

OUTPUT_REQUIRED=(
  index.html international.html marketplace.html smart-board.html elite-picks.html most-added.html won-codes.html
  performance.html sources.html control-room.html login.html admin-users.html
  privacy.html admin-login.html account.html saved.html deployment-check.html config.js render-build.txt service-worker.js manifest.json offline.html responsive.css
  src/mvp.js src/intelligence.js src/elite.js src/stability.js src/control-room.js src/region.js src/international.js
  src/handoff.js src/share.js src/auth.js src/member-home.js src/login.js src/admin-login.js src/admin-users.js src/saved.js src/account.js src/saved-page.js src/pwa.js src/experience.js
  data/codehub-banner.json data/tip-history.json data/source-stats.json
  data/performance-summary.json data/feed-health.json data/manual-overrides.json data/settlement-ledger.json data/results-summary.json data/elite-picks.json data/elite-feed-health.json data/elite-performance.json
  assets/logo-email.png assets/share-card-default.png assets/logo-mark.webp assets/logo-wordmark-dark.webp assets/logo-wordmark-light.webp icons/icon-192.png icons/icon-512.png icons/maskable-512.png
)

for required in "${OUTPUT_REQUIRED[@]}"; do
  [[ -f "$OUTPUT_DIR/$required" ]] || {
    echo "Render output missing $required" >&2
    exit 1
  }
done

echo "Render publish directory prepared at $OUTPUT_DIR"
echo "Build version: $VERSION"
echo "Product mode: Fresh-start custom API"
