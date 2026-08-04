$BaseUrl = Read-Host "Paste the temporary Render URL (example: https://sporty-codes-staging.onrender.com)"
$BaseUrl = $BaseUrl.TrimEnd('/')
Write-Host "`nHealth" -ForegroundColor Cyan
Invoke-RestMethod "$BaseUrl/api/health" | ConvertTo-Json -Depth 8
Write-Host "`nUpcoming events" -ForegroundColor Cyan
Invoke-RestMethod "$BaseUrl/api/get_upcoming_events?days=1" | ConvertTo-Json -Depth 5
Write-Host "`nCode Hub" -ForegroundColor Cyan
Invoke-RestMethod "$BaseUrl/api/get_code_hub_codes?limit=3" | ConvertTo-Json -Depth 6
Write-Host "`nBrowser checker: $BaseUrl/deployment-check.html" -ForegroundColor Green
