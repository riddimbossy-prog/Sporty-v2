# Sporty.codes v21.4.2 — Direct public SportyBet collector

The custom API now includes `server/lib/sportybet-public.mjs`. It makes public GET requests only, normalizes public fixture/market responses, caches them in Supabase, and exposes them through `/api/get_upcoming_events`.

## Render variables

The Blueprint supplies these defaults:

```env
SPORTYBET_COUNTRY=gh
SPORTYBET_PUBLIC_EVENTS_URL=https://www.sportybet.com/api/{country}/factsCenter/pcUpcomingEvents?sportId=sr%3Asport%3A1&marketId=1&pageNum={page}&pageSize=100
SPORTYBET_PUBLIC_CODEHUB_URL=https://www.sportybet.com/{country}/m/code-hub/codes
SPORTYBET_MAX_PAGES=3
SPORTYBET_CODE_EXPANSION_LIMIT=6
```

The events URL is configurable because public website routes can change. Check `/api/source-status` after deployment. When the public route changes, update only `SPORTYBET_PUBLIC_EVENTS_URL` in Render and redeploy.

## Booking code details

The public Code Hub page is scanned for embedded public JSON. When a confirmed public booking-detail endpoint exists, add:

```env
SPORTYBET_PUBLIC_BOOKING_URL_TEMPLATE=https://PUBLIC-SPORTYBET-ENDPOINT/{code}
```

The collector will expand at most `SPORTYBET_CODE_EXPANSION_LIMIT` codes per refresh. It does not use cookies, accounts, CAPTCHA bypasses, private headers, or customer data.

## Checks

- `/api/health` — application and Supabase readiness.
- `/api/source-status` — last collector attempts, counts, and sanitized errors.
- `/api/get_upcoming_events?days=3` — direct public match feed.
- `/api/get_code_hub_codes` — collected and administrator-published public codes.
- `POST /api/admin/refresh` — force both collectors using the admin token.

API-Football is optional and is used only if the direct public SportyBet event source returns no matches.
