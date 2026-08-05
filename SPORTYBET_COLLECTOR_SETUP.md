# SportyBet browser collector — v21.5.3

## Architecture

Chromium runs in GitHub Actions, not inside the Render web process. The collector persists verified public slips and status to Supabase; Render serves the stored feed.

## GitHub secrets

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

## Manual run

GitHub → Actions → **Sync SportyBet Code Hub** → **Run workflow**.

## Schedule

`.github/workflows/sync-sportybet-codehub.yml` runs at minute 17 of every hour.

## Verification rule

Discovery alone is not enough. Each candidate must be submitted through the public load-code page and return at least one normalized selection containing:

```text
fixture
market
pick
valid selection odd
```

Unverified candidates are recorded only in collector counters and safe network diagnostics. They are not written to `booking_codes`.

## Public-only boundaries

The worker uses the logged-out public Code Hub and public load-code flow. It does not import customer cookies, log into an account, bypass CAPTCHA, or access private customer information.
