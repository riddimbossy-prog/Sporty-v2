# Browser-agent SportyBet collector — v21.5.0

## Public workflow being replicated

```text
Code Hub page
  → rendered public code cards and public network responses
  → public load-code page
  → expanded slip selections
  → Supabase booking_codes + booking_code_selections
  → /api/get_code_hub_codes
  → Free Codes + Smart Board
```

## Render Blueprint defaults

```text
SPORTYBET_BROWSER_COLLECTOR_ENABLED=true
SPORTYBET_BROWSER_CODEHUB_URL=https://www.sportybet.com/gh/m/code-hub/codes
SPORTYBET_BROWSER_LOAD_CODE_URL=https://www.sportybet.com/gh/m/code-hub/load-code
SPORTYBET_BROWSER_CODE_LIMIT=20
SPORTYBET_CODE_EXPANSION_LIMIT=8
SPORTYBET_BROWSER_PAGE_WAIT_MS=8000
SPORTYBET_BROWSER_AFTER_SUBMIT_MS=6500
SPORTYBET_BROWSER_EXPANSION_DELAY_MS=900
SPORTYBET_BROWSER_SCHEDULE_ENABLED=true
SPORTYBET_BROWSER_SCHEDULE_MINUTES=60
SPORTYBET_BROWSER_START_DELAY_MS=45000
CHROMIUM_PATH=/usr/bin/chromium
```

The worker permits only HTTPS URLs on `sportybet.com`/`www.sportybet.com` and sets only public locale/country preferences. It does not import browser cookies supplied by a user.

## Collector status

Public safe status:

```text
GET /api/collector-status
```

Protected status:

```text
GET /api/admin/collector/status
Authorization: Bearer CUSTOM_API_ADMIN_TOKEN
```

Protected manual run:

```text
POST /api/admin/collector/run
Authorization: Bearer CUSTOM_API_ADMIN_TOKEN
Content-Type: application/json

{"limit":20}
```

## Data preservation

Previously expanded selections are preserved when a later collector run rediscovers a code but cannot expand it. A failed run does not erase the last successful Supabase feed.

## Expected diagnostics

```text
running
last_started_at
last_finished_at
last_success_at
last_error
last_duration_ms
codes_discovered
codes_expanded
tips_found
network_responses
chromium.stderr_tail
```

No CAPTCHA bypass or private-account automation is implemented. If the public site presents an access challenge, the collector reports it and stops.
