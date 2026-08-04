# START HERE — Sporty.codes v21.4.0

This is a full replacement build for the current staging repository and Render Blueprint service.

## What changed

- Added `server/lib/sportybet-public.mjs`.
- Added direct public SportyBet fixture and 1X2 normalization.
- Added public Code Hub discovery and optional booking-detail expansion.
- Added `/api/source-status` diagnostics.
- Added a visible SportyBet Match Board so Smart Board is not blank while booking-code consensus is unavailable.
- Made API-Football optional instead of a readiness requirement.
- Kept Supabase accounts, profiles, booking tables and all existing pages.

## Deploy this replacement

1. Replace the files in the GitHub repository with this ZIP.
2. Commit and push.
3. In Render, open the Blueprint-managed service.
4. Use **Manual Deploy → Clear build cache & deploy**.
5. Keep your existing Supabase variables unchanged.

No new SQL migration is required when migrations 001–007 already succeeded.

## Blueprint variables

The included `render.yaml` supplies:

```env
SPORTYBET_COUNTRY=gh
SPORTYBET_PUBLIC_EVENTS_URL=https://www.sportybet.com/api/{country}/factsCenter/pcUpcomingEvents?sportId=sr%3Asport%3A1&marketId=1&pageNum={page}&pageSize=100
SPORTYBET_PUBLIC_CODEHUB_URL=https://www.sportybet.com/{country}/m/code-hub/codes
SPORTYBET_MAX_PAGES=3
SPORTYBET_CODE_EXPANSION_LIMIT=6
```

The public website route can change. After deployment, `/api/source-status` will show whether the collector returned data or a sanitized error.

## First checks

Open these in order:

```text
/api/health
/api/source-status
/api/get_upcoming_events?days=3
/api/get_code_hub_codes
/smart-board.html
```

A healthy application should show:

```json
{
  "ok": true,
  "ready": true,
  "collector": "sportybet-public-direct"
}
```

`ready: true` now depends on Supabase and migration readiness. API-Football is optional.

The events response should preferably show:

```text
source: sportybet-public-direct
count: greater than 0
```

## Force the first refresh

Use the existing Render `CUSTOM_API_ADMIN_TOKEN`:

```powershell
$headers = @{
  Authorization = "Bearer YOUR_CUSTOM_API_ADMIN_TOKEN"
}

Invoke-RestMethod `
  -Method Post `
  -Uri "https://sporty-codes-staging.onrender.com/api/admin/refresh" `
  -Headers $headers
```

Then reload `/api/source-status` and `/smart-board.html`.

## About public booking codes

The match board can populate from the public SportyBet event feed. Booking-code consensus requires code records with detailed selections. The collector reads embedded public Code Hub JSON when available. A confirmed public booking-detail endpoint can be added later with:

```env
SPORTYBET_PUBLIC_BOOKING_URL_TEMPLATE=https://PUBLIC-SPORTYBET-ENDPOINT/{code}
```

No private account access or protected automation is included.
