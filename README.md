# sporty.codes v21.6.1 — Popular Tips + Prediction Slip

Phase 1 adds a daily popular-tips list and a simulated prediction-slip builder using practice points only. No real-money staking or wallet is included.

# Sporty.codes v21.5.3 — Verified public-slip collector

Sporty.codes replaces the old Parse.bot Code Hub workflow with a public browser agent. The browser runs in GitHub Actions, writes verified public slips to Supabase, and the lightweight Render service serves those persisted results through the existing same-domain API.

## Verified-only pipeline

1. GitHub Actions opens the logged-out public SportyBet Ghana Code Hub.
2. The worker observes public fetch/XHR responses and labelled code cards.
3. Every candidate is submitted through the public load-code page.
4. A candidate is accepted only when the expansion returns at least one real fixture, market, pick and valid selection odd.
5. Only verified slips and their selections are written to Supabase.
6. The API immediately hides, and the next collector run removes, legacy auto-collected rows with no selections.

Code-like page tokens, JavaScript values, IDs and unexpanded candidates are diagnostics only. They are never public codes.

The collector does not import private cookies, sign into a customer account, read private account data, or bypass CAPTCHA/access controls.

## Deployment model

- Render: lightweight Node website and API (`npm run build`, `npm start`)
- GitHub Actions: Chromium browser collector, manual or hourly
- Supabase: booking codes, booking selections, API cache and persistent collector status
- Browser runtime on Render: disabled

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

Admin routes require `Authorization: Bearer CUSTOM_API_ADMIN_TOKEN`. The web-service collector route does not launch Chromium; it reports that collection runs through GitHub Actions.

## Required secrets

Render:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
CUSTOM_API_ADMIN_TOKEN
```

GitHub Actions:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

`API_FOOTBALL_KEY` and Odds API settings remain optional enrichment/fallback values and are not the Code Hub collector.

## Data-quality behavior

When SportyBet exposes candidate codes but the public load-code flow returns no selections, the public feed stays empty rather than publishing guessed codes. `/api/collector-status` reports `verified_slips`, `rejected_unverified`, `submissions_attempted`, and a safe summary of the last expansion request without cookies, tokens or request values.

Live SportyBet behavior must still be checked on each GitHub Actions run because the public page can change. This build fails closed: unverified rows do not reach Free Codes or Smart Board.
