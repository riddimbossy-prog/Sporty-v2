# START HERE — Sporty.codes v21.5.4

This release fixes the zero-tip feed shown by v21.5.2. Candidate tokens are no longer published as booking codes.

## 1. Replace the repository

Replace the current repository files with this package and push:

```text
Deploy v21.5.4 verified public-slip gate
```

## 2. Confirm Render remains lightweight

Sync the Render Blueprint only when its settings differ. The web service must show:

```text
Runtime: Node
Build command: npm run build
Start command: npm start
SPORTYBET_BROWSER_COLLECTOR_ENABLED=false
SPORTYBET_BROWSER_EXECUTION_MODE=github-actions
```

Keep the existing Supabase variables in Render. No SQL migration is required.

## 3. Confirm GitHub Actions secrets

Repository → Settings → Secrets and variables → Actions:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

## 4. Run the collector

GitHub → Actions → **Sync SportyBet Code Hub** → **Run workflow**.

The workflow tests up to 20 public candidates through the public load-code page. It stores only candidates that return actual selections.

## 5. Verify

Open:

```text
https://sporty-codes-staging.onrender.com/api/collector-status
https://sporty-codes-staging.onrender.com/api/get_code_hub_codes
https://sporty-codes-staging.onrender.com/smart-board.html
```

A publishable run has:

```text
verified_slips > 0
tips_found > 0
slips_with_tips = count
```

A run with `verified_slips: 0` is not a successful code harvest even when `codes_discovered` is greater than zero. In that case the site intentionally shows no automatic codes instead of fake ones.

Old zero-tip auto-collected rows are hidden as soon as Render deploys v21.5.4 and are deleted during the next workflow run.
