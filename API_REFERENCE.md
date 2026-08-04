# Custom API reference

Base URL on staging:

`https://YOUR-RENDER-SERVICE.onrender.com`

## Health

`GET /api/health`

Returns service status and configuration booleans without revealing secret values.

## Upcoming events

`GET /api/get_upcoming_events?days=3`

- `days` accepts `1` through `7`.
- Fixtures use API-Football when configured.
- H2H odds are added only when The Odds API is configured.
- Cached fallback output is used when an upstream provider is unavailable.

## Code Hub

`GET /api/get_code_hub_codes?limit=24`

Returns published, unexpired booking-code records from Supabase.

## Booking details

`GET /api/get_booking?code=ABC123`

Returns one published booking code and its selections.

## Match search

`GET /api/search_matches?date=2026-08-04`

Returns normalized fixtures for the requested date.

## Fixture statistics

`GET /api/get_fixture_stats?event_id=api-football:12345`

Returns recent-team statistical summaries from API-Football.

## Administrator refresh

`POST /api/admin/refresh`

Header:

`Authorization: Bearer CUSTOM_API_ADMIN_TOKEN`

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
