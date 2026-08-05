$BaseUrl = (Read-Host "Paste the temporary Render URL").TrimEnd('/')
$Token = Read-Host "Paste CUSTOM_API_ADMIN_TOKEN"
$Headers = @{
  Authorization = "Bearer $Token"
  "Content-Type" = "application/json"
}
Write-Host "Starting the public Code Hub browser collector. This can take several minutes..." -ForegroundColor Cyan
Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/admin/collector/run" -Headers $Headers -Body '{"limit":20}' | ConvertTo-Json -Depth 12
