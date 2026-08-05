# Sporty.codes v21.5.2 — External browser-agent custom API

This build runs the public SportyBet browser agent outside the Render web process. GitHub Actions collects public codes and selections, stores them in Supabase, and the lightweight Render API serves those persisted results without launching Chromium.


This release replaces the paid Parse.bot Code Hub workflow with a self-hosted public browser agent.

## What it does

1. Render runs the included Chromium browser inside the Docker service.
2. The worker opens the logged-out public SportyBet Ghana Code Hub.
3. It observes public fetch/XHR responses and scans rendered public code cards.
4. It opens the public load-code page for a limited number of discovered codes.
5. It extracts public slip selections, normalizes them, and stores them in Supabase.
6. The website reads the stored records through the same-domain custom API.

The collector does not import private cookies, sign into a customer account, read private account data, or bypass CAPTCHA/access controls.

## Deployment model

- Render: Docker Web Service created from `render.yaml`
- Supabase: existing migrations 001–007
- Website and API: one same-origin service
- Chromium: installed by `Dockerfile`
- Schedule: first run after 45 seconds, then every 60 minutes by default

## Main routes

```text
GET  /api/health
GET  /api/source-status
GET  /api/collector-status
GET  /api/get_code_hub_codes
GET  /api/get_booking?code=ABC123
GET  /api/get_upcoming_events
POST /api/admin/collector/run
GET  /api/admin/collector/status
POST /api/admin/refresh
```

Admin routes require `Authorization: Bearer CUSTOM_API_ADMIN_TOKEN`.

## Required Render secrets

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
CUSTOM_API_ADMIN_TOKEN
```

`API_FOOTBALL_KEY` and Odds API settings remain optional enrichment/fallback values.

## Important live limitation

The browser-agent logic and Chromium flow were tested locally against controlled public-page fixtures. Live SportyBet behavior must be confirmed after deployment because the packaging environment cannot access the live site. If SportyBet changes the public page or blocks headless access, `/api/collector-status` will expose the failure instead of silently returning an empty board.


## v21.5.2 quality gate

Auto-collected booking codes now pass strict code, selection and odds validation before Supabase persistence. Invalid legacy browser rows are filtered immediately and removed on the next collector run.
