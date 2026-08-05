# SportyBet browser collector — v21.5.2

## Why the collector is external

Chromium exceeded the memory available to the Render web process, causing a 502 and process restart. The browser agent now runs in GitHub Actions, while Render serves persisted Supabase results.

## GitHub secrets

Add:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

## Manual run

Open GitHub → Actions → Sync SportyBet Code Hub → Run workflow.

## Schedule

`.github/workflows/sync-sportybet-codehub.yml` runs at minute 17 of every hour.

## Public-only boundaries

The worker uses the logged-out public Code Hub and public load-code flow. It does not import customer cookies, log into an account, bypass CAPTCHA, or access private customer information.
