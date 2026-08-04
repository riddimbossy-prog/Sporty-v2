# Sporty.codes v21.4.0

Sporty.codes now includes a same-domain **direct public SportyBet collector** for upcoming football fixtures and public market prices, plus a public Code Hub collector, Supabase caching, and the existing Ghana/international PWA.

## Main change

The previous compatibility-only API has been replaced by a real collector module:

```text
server/lib/sportybet-public.mjs
```

It performs public GET requests only. It does not use user accounts, cookies, CAPTCHA bypasses, customer data, or private authentication.

## Live API routes

- `GET /api/health`
- `GET /api/source-status`
- `GET /api/get_upcoming_events?days=3`
- `GET /api/get_code_hub_codes`
- `GET /api/get_booking?code=...`
- `GET /api/search_matches?date=YYYY-MM-DD`
- `GET /api/get_fixture_stats?event_id=...`
- `POST /api/admin/refresh`
- `POST /api/admin/codes`

## Smart Board behavior

The Smart Board now has two independent layers:

1. **SportyBet Match Board** — upcoming public fixtures and 1X2 prices from the direct collector.
2. **Booking-code consensus** — only appears when public or administrator-published booking codes contain detailed selections.

This prevents the entire page from appearing empty while code consensus is still being collected.

## Optional providers

API-Football and The Odds API are optional fallbacks/enrichment sources. They are not required for the direct SportyBet collector or application readiness.

Read `SPORTYBET_COLLECTOR_SETUP.md` and `START_HERE.md` before deploying.
