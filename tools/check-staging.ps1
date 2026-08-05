$BaseUrl = (Read-Host "Paste the temporary Render URL (example: https://sporty-codes-staging.onrender.com)").TrimEnd('/')
Write-Host "`nHealth" -ForegroundColor Cyan
Invoke-RestMethod "$BaseUrl/api/health" | ConvertTo-Json -Depth 8
Write-Host "`nBrowser collector status" -ForegroundColor Cyan
Invoke-RestMethod "$BaseUrl/api/collector-status" | ConvertTo-Json -Depth 10
Write-Host "`nUpcoming events" -ForegroundColor Cyan
Invoke-RestMethod "$BaseUrl/api/get_upcoming_events?days=1" | ConvertTo-Json -Depth 5
Write-Host "`nCode Hub" -ForegroundColor Cyan
Invoke-RestMethod "$BaseUrl/api/get_code_hub_codes?limit=3" | ConvertTo-Json -Depth 8
Write-Host "`nBrowser checker: $BaseUrl/deployment-check.html" -ForegroundColor Green
