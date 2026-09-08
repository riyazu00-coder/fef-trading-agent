param(
    [string]$EnvironmentFile = (Join-Path $PSScriptRoot ".env")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")

try {
    $configuration = Initialize-FefQuoteRelayEnvironment -EnvironmentFile $EnvironmentFile
    $paths = Get-FefPublisherPaths
    Write-Host "Quote source verified: $($configuration.SourceFile)"
    Write-Host "Starting continuous quote-only publisher"
    Push-Location $paths.RepositoryRoot
    try {
        & $paths.PythonPath $paths.PublisherPath
        $publisherExitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }
    if ($publisherExitCode -ne 0) {
        throw "Quote publisher exited with code $publisherExitCode"
    }
    exit 0
}
catch {
    Write-Error "Quote relay publisher failed closed: $($_.Exception.Message)"
    exit 1
}
