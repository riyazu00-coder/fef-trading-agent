param(
    [string]$EnvironmentFile = (Join-Path $PSScriptRoot ".env"),
    [int]$MaximumFileAgeSeconds = 15
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")

try {
    $configuration = Initialize-FefQuoteRelayEnvironment -EnvironmentFile $EnvironmentFile
    $paths = Get-FefPublisherPaths
    $sourceItem = Get-Item -LiteralPath $configuration.SourceFile
    $fileAgeSeconds = [math]::Round(
        ((Get-Date).ToUniversalTime() - $sourceItem.LastWriteTimeUtc).TotalSeconds,
        1
    )
    Write-Host "Quote source exists; age_seconds=$fileAgeSeconds"
    Write-Host "Publisher asset exists: $($paths.PublisherPath)"

    if ($fileAgeSeconds -lt 0 -or $fileAgeSeconds -gt $MaximumFileAgeSeconds) {
        throw "Quote source file is outside the allowed freshness window"
    }

    $quotePayload = Get-Content -LiteralPath $configuration.SourceFile -Raw |
        ConvertFrom-Json
    if ($null -eq $quotePayload) {
        throw "Quote source JSON is empty"
    }
    Write-Host "Quote source JSON parsed successfully"

    $relayState = Invoke-RestMethod `
        -Method Get `
        -Uri $configuration.RelayUrl `
        -TimeoutSec 5
    Write-Host "Read-only relay endpoint responded successfully"

    $statusUrl = [Environment]::GetEnvironmentVariable(
        "FEF_QUOTE_STATUS_URL",
        "Process"
    )
    if (-not [string]::IsNullOrWhiteSpace($statusUrl)) {
        if ($statusUrl -match '^<.*>$') {
            throw "FEF_QUOTE_STATUS_URL is still a placeholder"
        }
        $safeStatusUrl = Assert-FefSafeReadUrl `
            -Url $statusUrl `
            -AllowedPaths @("/api/status")
        $statusState = Invoke-RestMethod `
            -Method Get `
            -Uri $safeStatusUrl `
            -TimeoutSec 5
        Write-Host "Read-only dashboard status endpoint responded successfully"
    }

    Write-Host "Quote relay health check passed"
    exit 0
}
catch {
    Write-Error "Quote relay health check failed closed: $($_.Exception.Message)"
    exit 1
}
