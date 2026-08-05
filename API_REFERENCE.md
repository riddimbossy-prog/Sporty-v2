# Sporty.codes custom API reference — v21.5.2

The browser collector runs in GitHub Actions; Render serves persisted Supabase results and does not launch Chromium.

## Public routes

### GET `/api/health`
Service, Supabase, collector, and optional enrichment readiness.

### GET `/api/source-status`
Combined direct-event and browser-agent diagnostics.

### GET `/api/collector-status`
Safe browser-agent run status.

### GET `/api/get_code_hub_codes?limit=24`
Returns normalized public codes and expanded selections stored in Supabase.

### GET `/api/get_booking?code=ABC123`
Returns one normalized code and its selections.

### GET `/api/get_upcoming_events?days=3`
Returns public upcoming football events. This remains separate from the browser-driven Code Hub feed.

## Protected routes

Use:

```text
Authorization: Bearer CUSTOM_API_ADMIN_TOKEN
```

### POST `/api/admin/collector/run`

```json
{"limit":20}
```

Starts one browser run. Concurrent calls reuse the active run instead of opening multiple Chromium sessions.

### GET `/api/admin/collector/status`
Returns protected collector status.

### POST `/api/admin/refresh`
Refreshes the combined feeds.

### POST `/api/admin/codes`
Publishes an administrator-supplied verified public code.

## Code Hub response

```json
{
  "source": "sportybet-browser-agent",
  "collector": "sportybet-browser-agent",
  "count": 1,
  "slips_with_tips": 1,
  "total_tips": 4,
  "items": [
    {
      "code": "ABC123",
      "odds": 5.25,
      "selections": 4,
      "tips": [
        {
          "fixture": "Home Team vs Away Team",
          "market": "Total Goals",
          "pick": "Over 1.5",
          "odds": 1.30
        }
      ]
    }
  ]
}
```
