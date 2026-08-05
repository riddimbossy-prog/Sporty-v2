# START HERE — Sporty.codes v21.5.0

## 1. Upload the repository

Extract the ZIP and upload its contents directly to the root of the GitHub repository. Confirm these files are at root:

```text
Dockerfile
render.yaml
package.json
server/
scripts/
src/
index.html
```

Commit and push:

```text
Deploy v21.5.0 browser-agent collector
```

## 2. Update the Render Blueprint

This release changes the service from a normal Node runtime to a Docker runtime so Chromium can be installed.

In Render, sync/apply the Blueprint from the updated `render.yaml`. If Render will not change the existing service runtime, create a new Blueprint service from the same repository and test it on its temporary `.onrender.com` URL.

Do not create a Static Site.

## 3. Keep these Render secrets

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
CUSTOM_API_ADMIN_TOKEN
```

No new Supabase SQL migration is required when migrations 001–007 already ran.

## 4. Deploy and verify

After Render finishes building the Docker image, open:

```text
https://YOUR-SERVICE.onrender.com/api/health
https://YOUR-SERVICE.onrender.com/api/collector-status
```

The health response should report:

```json
{
  "version": "21.5.0",
  "browser_agent_collector": true,
  "collector": "sportybet-browser-agent"
}
```

## 5. Run the first collector manually

Windows PowerShell:

```powershell
$headers = @{
  Authorization = "Bearer YOUR_CUSTOM_API_ADMIN_TOKEN"
  "Content-Type" = "application/json"
}

Invoke-RestMethod `
  -Method Post `
  -Uri "https://YOUR-SERVICE.onrender.com/api/admin/collector/run" `
  -Headers $headers `
  -Body '{"limit":20}'
```

This run can take several minutes because Chromium must load the Code Hub and expand public codes one by one.

## 6. Inspect the result

```text
https://YOUR-SERVICE.onrender.com/api/collector-status
https://YOUR-SERVICE.onrender.com/api/get_code_hub_codes
https://YOUR-SERVICE.onrender.com/smart-board.html
```

A successful collector status should show a recent `last_success_at`, `codes_discovered` greater than zero, and ideally `tips_found` greater than zero.

If `codes_discovered` is positive but `tips_found` is zero, code cards were found but the public load-code page could not be expanded. The status output will show the browser diagnostics.
