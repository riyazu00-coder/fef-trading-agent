# Windows VPS quote publisher service assets

These assets run the existing `scripts/quote_relay_publisher.py` as a supervised,
quote-only process. They do not authorize trading, carry a trading credential,
or expose a command listener. Start with a dedicated broker demo account.
Real-money execution is not approved.

## Files

- `.env.example`: placeholder-only configuration template.
- `common.ps1`: shared fail-closed configuration and URL checks.
- `run-once.ps1`: publishes one fresh JSON snapshot and exits.
- `run-publisher.ps1`: runs the existing publisher continuously.
- `health-check.ps1`: checks the JSON file, file freshness, relay read endpoint,
  and optional dashboard status endpoint.

The wrappers accept plain HTTP only when the URL host is loopback for a local
dry run. Every remote relay or status URL must use HTTPS with normal certificate
and hostname validation.

## 1. Copy or clone the reviewed repository

Use a controlled checkout at an approved commit:

```powershell
New-Item -ItemType Directory -Force C:\FEF | Out-Null
Set-Location C:\FEF
git clone <approved-repository-url> fef-trading-agent
Set-Location C:\FEF\fef-trading-agent
git branch --show-current
git rev-parse HEAD
git status --short
```

For an offline copy, transfer a reviewed archive through the approved channel,
verify its recorded hash, and expand it to `C:\FEF\fef-trading-agent`. Do not
copy a developer working tree containing `.env`, logs, credentials, or generated
artifacts.

## 2. Create the Python 3.12 environment

```powershell
Set-Location C:\FEF\fef-trading-agent
py -3.12 --version
py -3.12 -m venv .venv
& .\.venv\Scripts\python.exe --version
```

The quote publisher uses the Python standard library. These assets do not
require another package merely to run it.

## 3. Create and protect `.env`

```powershell
Set-Location C:\FEF\fef-trading-agent\deploy\windows\quote-relay
Copy-Item .env.example .env
notepad .env
icacls .env /inheritance:r
icacls .env /grant:r "${env:USERDOMAIN}\${env:USERNAME}:(R)"
```

Replace every placeholder. The required source path normally resembles:

```text
C:\Users\<User>\AppData\Roaming\MetaQuotes\Terminal\Common\Files\fef_mt5_quote_snapshot.json
```

Required variables are `FEF_QUOTE_RELAY_SECRET`, `FEF_QUOTE_RELAY_URL`, and
`FEF_QUOTE_SOURCE_FILE`. `FEF_QUOTE_PUBLISH_INTERVAL_SECONDS` defaults in the
publisher but is explicit in the example. `FEF_QUOTE_STATUS_URL` is an optional
read-only health-check target.

Use a unique, high-entropy quote-relay secret from an approved secret manager.
Never reuse a broker, Windows, browser, or execution credential. The populated
`.env` is ignored by Git, must be readable only by the runtime account, and must
never be copied into logs or evidence.

## 4. One-shot verification

From an interactive PowerShell session running as the intended service account:

```powershell
Set-Location C:\FEF\fef-trading-agent
& .\deploy\windows\quote-relay\run-once.ps1
$LASTEXITCODE
```

Require exit code `0` and HTTP 202 for XAUUSD, USOIL, EURUSD, GBPUSD, and USDJPY
before continuous operation. Stop if the source file is absent, stale, malformed,
or if authentication/TLS fails.

## 5. Continuous publisher

```powershell
Set-Location C:\FEF\fef-trading-agent
& .\deploy\windows\quote-relay\run-publisher.ps1
```

Stop the interactive run with Ctrl+C. Confirm bounded retries, secret-free logs,
and honest quote expiry before configuring supervision.

## 6. Health check

```powershell
Set-Location C:\FEF\fef-trading-agent
& .\deploy\windows\quote-relay\health-check.ps1 -MaximumFileAgeSeconds 15
$LASTEXITCODE
```

The health check sends unauthenticated GET requests only. It does not add an
Authorization header or reveal the relay secret. Its file-age threshold should
match the reviewed operational alert threshold; backend quote expiry remains
independently enforced.

## 7. Task Scheduler supervision

First validate the scripts interactively as the dedicated least-privilege
runtime account. Create a task using Task Scheduler with:

- program: `powershell.exe`;
- arguments: `-NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File
  "C:\FEF\fef-trading-agent\deploy\windows\quote-relay\run-publisher.ps1"`;
- start in: `C:\FEF\fef-trading-agent`;
- trigger: runtime-account logon after demo MT5 starts;
- restart: bounded delay and count;
- multiple instances: do not start a new instance;
- account: the dedicated runtime account, never a broad administrator account.

Inspect the configured task without exposing configuration values:

```powershell
Get-ScheduledTask -TaskName "FEF Quote Relay Publisher"
Get-ScheduledTaskInfo -TaskName "FEF Quote Relay Publisher"
Start-ScheduledTask -TaskName "FEF Quote Relay Publisher"
```

Do not place the secret in task arguments, task descriptions, command lines, or
redirected output. NSSM or a different service wrapper requires separate
approval, pinned-source verification, and equivalent least-privilege, restart,
single-instance, and redaction controls.

## 8. Relay and dashboard validation

Use read-only HTTPS requests without the relay secret:

```powershell
$Relay = Invoke-RestMethod -Method Get -Uri "https://<approved-relay-host>/api/relay/quotes"
$Status = Invoke-RestMethod -Method Get -Uri "https://<approved-dashboard-host>/api/status"
$Relay | ConvertTo-Json -Depth 8
$Status | ConvertTo-Json -Depth 8
```

All five symbols must publish with HTTP 202. `/api/status` must show:

```text
source = MT5_RELAY
source_label = MT5 LIVE
is_broker_quote = true
is_tradeable = true
```

Confirm quotes expire or downgrade when publishing stops. The presence of the
publisher process alone must never preserve live provenance.

## 9. Secret rotation

1. Create a new unique secret in the approved secret manager.
2. Configure the relay to accept the new secret during a bounded rotation window.
3. Stop the scheduled publisher task.
4. Replace only the secret value in the ACL-protected `.env` file.
5. Run `run-once.ps1` and verify HTTP 202 without recording the secret.
6. Restart the scheduled task and verify health and provenance.
7. Revoke the old secret immediately after validation.
8. Preserve only sanitized timestamps, status codes, and operator evidence.

If a secret may have entered a log or command history, stop publishing, restrict
the evidence, revoke it immediately, and investigate before resuming.

## 10. Reboot verification and rollback

After a scheduled demo-only reboot, confirm clock synchronization, demo MT5/EA
recovery, fresh JSON timestamps, exactly one publisher instance, HTTP 202 for all
five symbols, health-check success, and correct dashboard provenance.

Rollback safely:

```powershell
Stop-ScheduledTask -TaskName "FEF Quote Relay Publisher"
Disable-ScheduledTask -TaskName "FEF Quote Relay Publisher"
```

Then revoke the VPS quote-relay secret, wait for cached quotes to expire, confirm
the dashboard downgrades provenance, and preserve sanitized diagnostic evidence.
Do not use destructive Git operations for rollback. Restore a previously
reviewed side-by-side checkout only after approval.

These assets are quote-only deployment scaffolding. They provide no approval for
real-money execution or for testing any trading action.
