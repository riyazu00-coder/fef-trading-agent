Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:FefAllowedEnvironmentVariables = @(
    "FEF_QUOTE_RELAY_URL",
    "FEF_QUOTE_RELAY_SECRET",
    "FEF_QUOTE_SOURCE_FILE",
    "FEF_QUOTE_PUBLISH_INTERVAL_SECONDS",
    "FEF_QUOTE_STATUS_URL"
)

function Import-FefQuoteRelayEnvironment {
    param(
        [Parameter(Mandatory = $true)]
        [string]$EnvironmentFile
    )

    if (-not (Test-Path -LiteralPath $EnvironmentFile -PathType Leaf)) {
        throw "Quote relay environment file was not found: $EnvironmentFile"
    }

    foreach ($rawLine in Get-Content -LiteralPath $EnvironmentFile) {
        $line = $rawLine.Trim()
        if (-not $line -or $line.StartsWith("#")) {
            continue
        }

        $parts = $line.Split(@("="), 2, [System.StringSplitOptions]::None)
        if ($parts.Count -ne 2) {
            throw "Malformed entry in the quote relay environment file"
        }

        $name = $parts[0].Trim()
        $value = $parts[1].Trim()
        if ($script:FefAllowedEnvironmentVariables -notcontains $name) {
            throw "Unsupported quote relay environment variable: $name"
        }
        if ($value.Length -ge 2) {
            $first = $value.Substring(0, 1)
            $last = $value.Substring($value.Length - 1, 1)
            if (($first -eq '"' -and $last -eq '"') -or
                ($first -eq "'" -and $last -eq "'")) {
                $value = $value.Substring(1, $value.Length - 2)
            }
        }

        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

function Assert-FefRequiredEnvironmentValue {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    $value = [Environment]::GetEnvironmentVariable($Name, "Process")
    if ([string]::IsNullOrWhiteSpace($value) -or $value -match '^<.*>$') {
        throw "Required quote relay configuration is missing or still a placeholder: $Name"
    }
    return $value.Trim()
}

function Assert-FefSafeReadUrl {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url,
        [Parameter(Mandatory = $true)]
        [string[]]$AllowedPaths
    )

    $parsed = $null
    if (-not [Uri]::TryCreate($Url, [UriKind]::Absolute, [ref]$parsed)) {
        throw "Configured URL must be absolute"
    }
    if ($parsed.UserInfo -or $parsed.Query -or $parsed.Fragment) {
        throw "Configured URL must not contain credentials, a query, or a fragment"
    }
    if ($AllowedPaths -notcontains $parsed.AbsolutePath.TrimEnd('/')) {
        throw "Configured URL has an unexpected path"
    }
    if ($parsed.Scheme -eq "http" -and -not $parsed.IsLoopback) {
        throw "Remote quote relay URLs must use HTTPS"
    }
    if ($parsed.Scheme -notin @("http", "https")) {
        throw "Configured URL must use HTTPS, or loopback HTTP for a local dry run"
    }
    return $parsed.AbsoluteUri
}

function Initialize-FefQuoteRelayEnvironment {
    param(
        [string]$EnvironmentFile = (Join-Path $PSScriptRoot ".env")
    )

    Import-FefQuoteRelayEnvironment -EnvironmentFile $EnvironmentFile

    $relaySecret = Assert-FefRequiredEnvironmentValue -Name "FEF_QUOTE_RELAY_SECRET"
    $relayUrl = Assert-FefRequiredEnvironmentValue -Name "FEF_QUOTE_RELAY_URL"
    $sourceFile = Assert-FefRequiredEnvironmentValue -Name "FEF_QUOTE_SOURCE_FILE"

    if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) {
        throw "Quote source file was not found: $sourceFile"
    }

    $safeRelayUrl = Assert-FefSafeReadUrl `
        -Url $relayUrl `
        -AllowedPaths @("/api/relay/quotes")
    [Environment]::SetEnvironmentVariable(
        "FEF_QUOTE_RELAY_URL",
        $safeRelayUrl,
        "Process"
    )

    $intervalText = [Environment]::GetEnvironmentVariable(
        "FEF_QUOTE_PUBLISH_INTERVAL_SECONDS",
        "Process"
    )
    if (-not [string]::IsNullOrWhiteSpace($intervalText)) {
        $interval = 0.0
        if (-not [double]::TryParse(
            $intervalText,
            [Globalization.NumberStyles]::Float,
            [Globalization.CultureInfo]::InvariantCulture,
            [ref]$interval
        ) -or $interval -lt 1 -or $interval -gt 3600) {
            throw "FEF_QUOTE_PUBLISH_INTERVAL_SECONDS must be between 1 and 3600"
        }
    }

    return [PSCustomObject]@{
        RelayUrl = $safeRelayUrl
        SourceFile = $sourceFile
    }
}

function Get-FefRepositoryRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
}

function Get-FefPublisherPaths {
    $repositoryRoot = Get-FefRepositoryRoot
    $pythonPath = Join-Path $repositoryRoot ".venv\Scripts\python.exe"
    $publisherPath = Join-Path $repositoryRoot "scripts\quote_relay_publisher.py"

    if (-not (Test-Path -LiteralPath $pythonPath -PathType Leaf)) {
        throw "Python virtual environment was not found: $pythonPath"
    }
    if (-not (Test-Path -LiteralPath $publisherPath -PathType Leaf)) {
        throw "Quote publisher was not found: $publisherPath"
    }

    return [PSCustomObject]@{
        RepositoryRoot = $repositoryRoot
        PythonPath = $pythonPath
        PublisherPath = $publisherPath
    }
}
