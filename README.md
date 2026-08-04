# Sporty.codes v21.3.0

Fresh-start website and same-domain Node compatibility API for Ghana and international users.

## Included

- Existing Sporty.codes user interface and PWA
- Ghana and international region flow
- Node Web Service for Render
- Supabase cache, request-budget, and booking-code tables
- API-Football fixture and statistics adapter
- Optional The Odds API adapter
- Same-domain API routes
- Private administrator publishing and refresh routes
- Clean GitHub validation workflow
- Render Blueprint
- Browser deployment checker and Windows PowerShell helpers

## Important first file

Read [`START_HERE.md`](START_HERE.md).

## Commands

```bash
npm test
npm run build
npm run smoke
npm start
```

`npm run build` creates `.render-site`. The server serves the website and API from the same Render Web Service.

## Public routes

- `GET /api/health`
- `GET /api/get_upcoming_events`
- `GET /api/get_code_hub_codes`
- `GET /api/get_booking?code=...`
- `GET /api/search_matches?date=YYYY-MM-DD`
- `GET /api/get_fixture_stats?event_id=...`

Compatibility aliases without `/api` remain available for the existing frontend.

## Private routes

- `POST /api/admin/refresh`
- `POST /api/admin/codes`

Private routes require `CUSTOM_API_ADMIN_TOKEN` in a Bearer authorization header.

## Data-source boundary

This repository does not include a paid pass-through collector or unauthorized access to a betting platform. Fixtures/statistics come from configured providers. Booking codes come from records stored in Supabase by authorized administrators or verified contributors.

18+ only. Predictions are informational and are not guarantees.
