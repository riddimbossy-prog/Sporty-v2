# Sporty.codes custom API reference — v21.4.1

Base URL on staging:

`https://YOUR-RENDER-SERVICE.onrender.com`

## Health

`GET /api/health`

Reports Supabase readiness, direct collector presence, and optional-provider flags. API-Football is not required for `ready: true`.

## Collector diagnostics

`GET /api/source-status`

Returns sanitized status for the direct public SportyBet event and Code Hub collectors, including last attempt, last success, last error and item count. It never returns secret values or the administrator token.

## Upcoming public events

`GET /api/get_upcoming_events?days=3`

- `days` accepts `1` through `7`.
- Tries the direct public SportyBet collector first.
- Normalizes fixtures, leagues, kickoff times and 1X2 odds.
- Uses API-Football only as an optional fallback.
- Uses The Odds API only as optional fallback enrichment.
- Returns cached data when available.

Preferred response source:

```text
sportybet-public-direct
```

## Code Hub

`GET /api/get_code_hub_codes?limit=24`

- Reads published records already stored in Supabase.
- When the table is empty or an administrator forces refresh, checks the public SportyBet Code Hub source.
- Stores collected public codes and detailed selections in Supabase.
- Returns an empty list rather than fabricating codes when no public code data is exposed.

## Booking details

`GET /api/get_booking?code=ABC123`

Returns one published public booking code and its selections.

## Match search

`GET /api/search_matches?date=2026-08-04`

Returns normalized fixtures for the requested date.

## Fixture statistics

`GET /api/get_fixture_stats?event_id=api-football:12345`

Optional API-Football statistical enrichment. This route requires `API_FOOTBALL_KEY`; the direct SportyBet event collector does not.

## Administrator refresh

`POST /api/admin/refresh`

Header:

`Authorization: Bearer CUSTOM_API_ADMIN_TOKEN`

Forces the event collector, public Code Hub collector and cache refresh.

## Administrator code publishing

`POST /api/admin/codes`

Header:

`Authorization: Bearer CUSTOM_API_ADMIN_TOKEN`

Example body:

```json
{
  "code": "ABC123",
  "title": "Weekend goals",
  "odds": 3.25,
  "author": "Verified Tipster",
  "tag": "Goals",
  "expires_at": "2026-08-10T18:00:00Z",
  "tips": [
    {
      "fixture": "Home Team vs Away Team",
      "market": "Total goals",
      "pick": "Over 1.5",
      "odds": 1.30,
      "league": "Example League",
      "kickoff": "2026-08-10T15:00:00Z"
    }
  ]
}
```
