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
    Write-Host "Starting one-shot quote relay verification"
    Push-Location $paths.RepositoryRoot
    try {
        & $paths.PythonPath $paths.PublisherPath --once
        $publisherExitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }
    if ($publisherExitCode -ne 0) {
        throw "Quote publisher one-shot verification failed with exit code $publisherExitCode"
    }
    Write-Host "One-shot quote relay verification completed safely"
    exit 0
}
catch {
    Write-Error "Quote relay one-shot failed closed: $($_.Exception.Message)"
    exit 1
}
