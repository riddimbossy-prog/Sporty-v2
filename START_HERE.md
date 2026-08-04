# START HERE — Sporty.codes v21.3.0 Fresh Start

This package is designed for a brand-new GitHub repository and a brand-new Render Blueprint service. It does not contain a `CNAME`, GitHub Pages deployment, scheduled paid collectors, old cached matches, or old public booking-code data.

## What this API is

The included Node service is the Sporty.codes same-domain compatibility API. It supplies the routes the website expects, stores administrator or verified-contributor booking codes in Supabase, obtains football fixtures/statistics from API-Football, and can optionally add consensus odds from The Odds API.

It is not an official SportyBet API and does not bypass SportyBet login, private endpoints, anti-bot controls, or booking-code creation rules. Genuine SportyBet booking codes must come from an authorized source, an administrator, or a verified contributor.

## Stage 1 — Create the GitHub repository

1. Create a new empty GitHub repository.
2. Extract this ZIP.
3. Upload the contents of the extracted folder so `package.json`, `render.yaml`, `server`, `src`, and `supabase` are at the repository root.
4. Commit and push.

Do not add a `CNAME` file yet. Do not enable GitHub Pages.

## Stage 2 — Create the Render Blueprint

1. In Render, create a new Blueprint.
2. Connect the new GitHub repository.
3. Render will read `render.yaml` and create `sporty-codes-staging` as a Node Web Service.
4. The first deployment can open before Supabase or API-Football is connected.

The initial health response should show `ok: true` and `ready: false`. That is expected during setup.

Open:

- `/api/health`
- `/deployment-check.html`

## Stage 3 — Prepare the existing Supabase project

Because the existing Supabase project is being kept, run only:

`supabase/migrations/007_custom_api.sql`

The migration is idempotent and adds:

- `api_cache`
- `api_request_usage`
- `booking_codes`
- `booking_code_selections`
- `reserve_api_request(...)`

Do not rerun migrations `001` through `006` unless the existing project never received them.

## Stage 4 — Add Render environment values

Add these in the Render Web Service environment settings:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `API_FOOTBALL_KEY`

Render generates `CUSTOM_API_ADMIN_TOKEN` automatically from the Blueprint. Copy it into a password manager.

Optional, after the core service is verified:

- `ODDS_API_KEY`
- `ODDS_API_SPORT_KEYS`
- `ODDS_API_REGIONS`

After adding values, save and redeploy.

## Stage 5 — Confirm readiness

Open `/api/health`. A complete setup should show:

- `ok: true`
- `ready: true`
- `supabase_status: connected`
- `migration_ready: true`
- `api_football_configured: true`

Then test:

- `/api/get_upcoming_events?days=1`
- `/api/get_code_hub_codes?limit=3`
- `/international`
- `/elite-picks`
- `/smart-board`
- `/login`

On Windows, run `tools/check-staging.ps1` for the same checks.

## Stage 6 — Refresh through the private admin route

Run `tools/admin-refresh.ps1`, or send:

`POST /api/admin/refresh`

with:

`Authorization: Bearer YOUR_CUSTOM_API_ADMIN_TOKEN`

Never place the service-role key or admin token in browser code, GitHub files, screenshots, or public messages.

## Stage 7 — Connect the domain later

Keep the temporary Render URL until all tests pass. Then add the custom domain in Render and copy the exact DNS records Render displays into Hostinger.

Do not create a repository `CNAME`; the production domain belongs to the Render Web Service.
