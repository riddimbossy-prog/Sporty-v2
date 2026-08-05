# START HERE — Sporty.codes v21.5.1

This hotfix stops Chromium from crashing the Render web service.

## Architecture

- Render: lightweight Node web/API service only.
- GitHub Actions: public SportyBet Code Hub browser collector.
- Supabase: persistent booking codes, selections and collector status.

## 1. Replace the repository

Replace the current repository files with this package and push:

```text
Deploy v21.5.1 external browser collector
```

## 2. Apply the Render Blueprint

Open the Render Blueprint and use **Sync Blueprint**. The service must change from Docker to Node.

Confirm these Render values:

```text
Runtime: Node
Build command: npm run build
Start command: npm start
SPORTYBET_BROWSER_COLLECTOR_ENABLED=false
SPORTYBET_BROWSER_EXECUTION_MODE=github-actions
```

Keep the existing Supabase URL, publishable key and service-role key in Render.

## 3. Add two GitHub Actions secrets

Repository → Settings → Secrets and variables → Actions:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Use the same project values already stored privately in Render. Never put the service-role key in repository files or browser JavaScript.

## 4. Run the collector

GitHub → Actions → **Sync SportyBet Code Hub** → **Run workflow**.

The workflow also runs hourly.

## 5. Verify

Open:

```text
https://sporty-codes-staging.onrender.com/api/collector-status
https://sporty-codes-staging.onrender.com/api/get_code_hub_codes
https://sporty-codes-staging.onrender.com/smart-board.html
```

A successful collector status has a non-null `last_started_at`, `last_finished_at` and `last_success_at`.
