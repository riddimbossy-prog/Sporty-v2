# Sporty.codes custom API reference — v21.5.3

## Public routes

```text
GET /api/health
GET /api/source-status
GET /api/collector-status
GET /api/get_code_hub_codes
GET /api/get_booking?code=ABC123
GET /api/get_upcoming_events
```

`/api/get_code_hub_codes` returns only manual rows or verified auto-collected slips with one or more selections. Auto-collected rows with zero selections are filtered out.

Important response fields:

```text
count             number of publishable slips
slips_with_tips   publishable slips containing selections
total_tips        total normalized selections
status            ok or empty
browser_status    persisted collector diagnostics
```

A trustworthy automatic feed should have `count === slips_with_tips`.

## Collector status

```text
GET /api/collector-status
```

Important fields:

```text
codes_discovered       code-like candidates found on the public page
submissions_attempted  candidates submitted through public load-code
verified_slips         candidates that returned valid selections
rejected_unverified    candidates withheld from publication
tips_found             normalized selections in verified slips
last_expansion_network safe method/path/key-name diagnostics; no values or cookies
```

## Admin routes

```text
POST /api/admin/collector/run
GET  /api/admin/collector/status
POST /api/admin/refresh
```

Admin routes require:

```text
Authorization: Bearer CUSTOM_API_ADMIN_TOKEN
```

The Render web process does not start Chromium. The browser collector runs through the `Sync SportyBet Code Hub` GitHub Actions workflow.
