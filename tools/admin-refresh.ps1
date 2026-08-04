$BaseUrl = (Read-Host "Paste the temporary Render URL").TrimEnd('/')
$Token = Read-Host "Paste CUSTOM_API_ADMIN_TOKEN"
$Headers = @{ Authorization = "Bearer $Token" }
Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/admin/refresh" -Headers $Headers | ConvertTo-Json -Depth 8
