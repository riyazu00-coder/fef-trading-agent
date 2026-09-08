# Phase 4K: Windows VPS Quote-Relay Dry-Run Evidence Plan

## Purpose and strict safety boundary

Phase 4K defines the evidence package for the first native Windows VPS dry run
of this quote-only chain:

```text
Windows VPS
  -> Demo MT5
  -> FEF_TradingAgentsBridge EA
  -> Common Files/fef_mt5_quote_snapshot.json
  -> deploy/windows/quote-relay/run-once.ps1
  -> deploy/windows/quote-relay/health-check.ps1
  -> authenticated relay
  -> /api/status with MT5_RELAY / MT5 LIVE provenance
```

This runbook does not test execution or position-management behavior. Use a
dedicated demo account with no open positions and no real-account credentials on
the VPS. Keep terminal trading disabled. Do not initiate a BUY, SELL, order,
close-all, or break-even action. If quote export does not work while terminal
trading is disabled, record the failure and stop; do not enable execution merely
to complete this runbook.

The quote-relay secret authorizes quote ingestion only. It must not be accepted
by any trading-state mutation route. A successful quote-only VPS dry run does
not approve real-money execution, which remains blocked.

## Prerequisites from Phase 4I and Phase 4J

- [ ] `PHASE_4I_VPS_QUOTE_RELAY_DEPLOYMENT_PLAN.md` has been reviewed.
- [ ] The reviewed `deploy/windows/quote-relay/` assets are present unchanged.
- [ ] The exact approved Git branch, revision, and artifact hashes are recorded.
- [ ] A patched native Windows VPS and least-privilege runtime account are ready.
- [ ] A dedicated broker demo account is connected in MT5.
- [ ] Real-account credentials are absent from the VPS.
- [ ] The Windows clock is synchronized and its UTC offset is recorded.
- [ ] The relay destination is loopback for a local dry run or HTTPS for remote.
- [ ] A unique, high-entropy `FEF_QUOTE_RELAY_SECRET` is provisioned securely.
- [ ] The relay rejects that quote secret on every trading mutation endpoint.
- [ ] Firewall rules expose no MT5, command listener, Common Files share, or
      trading endpoint to the public internet.
- [ ] An evidence owner, reviewer, storage location, and rollback owner are named.

Do not proceed if any prerequisite is missing.

## Evidence-handling rules

Create a dated evidence folder outside the repository. Evidence may include UTC
timestamps, software versions, Git revision, file hashes, compiler results,
canonical and broker symbols, sanitized JSON, HTTP status, and read-only API
responses. Redact broker account numbers, personal data, hostnames where
required, Authorization headers, `.env` values, and every secret.

Do not use `Start-Transcript`, `Get-ChildItem Env:`, `set`, or any command that
dumps the process environment. Do not copy the populated `.env` into evidence.
Never capture a command line containing the secret.

Example evidence directory:

```powershell
$EvidenceRoot = "C:\FEF\evidence\phase-4k-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Force $EvidenceRoot | Out-Null
Get-Date -AsUTC -Format o | Set-Content "$EvidenceRoot\start-utc.txt"
```

## 1. Pre-start VPS evidence

Run from a normal PowerShell session as the intended runtime account:

```powershell
Set-Location C:\FEF\fef-trading-agent
py -3.12 --version
git branch --show-current
git status --short
git rev-parse HEAD
git log -1 --oneline
w32tm /query /status
Get-TimeZone
```

Capture:

- Windows edition/build and VPS region/provider identifier;
- Python version, repository branch, clean status, revision, and latest commit;
- UTC time, time-zone output, NTP source, offset, and last synchronization;
- Windows Firewall profile state and approved relay egress rule;
- MT5 terminal and MetaEditor build numbers;
- a screenshot proving demo-account status, with account identifiers redacted;
- an MT5 Toolbox Trade-tab screenshot showing no open positions;
- confirmation that terminal trading remains disabled;
- confirmation that no publisher or scheduled publisher instance is running.

If the worktree is dirty, revision is unapproved, clock is unsynchronized, the
account is not demo, or any position is open, mark the run failed and stop.

## 2. Python virtual-environment evidence

Create the environment if it does not already exist:

```powershell
Set-Location C:\FEF\fef-trading-agent
py -3.12 -m venv .venv
& .\.venv\Scripts\Activate.ps1
python --version
python -c "import pathlib, ssl, urllib.request; print(ssl.OPENSSL_VERSION)"
deactivate
```

Capture the Python and OpenSSL versions. Do not install packages merely for the
standard-library quote publisher.

## 3. EA copy and MetaEditor compile evidence

Copy only the reviewed `mql5/FEF_TradingAgentsBridge.mq5` into the demo
terminal's active `MQL5\Experts` folder. Before compilation, capture hashes of
the repository and installed source:

```powershell
Get-FileHash .\mql5\FEF_TradingAgentsBridge.mq5 -Algorithm SHA256
Get-FileHash "<active-MT5-Experts-path>\FEF_TradingAgentsBridge.mq5" -Algorithm SHA256
```

Open that installed source in MetaEditor and compile it. Capture:

- full source path;
- MetaEditor build number;
- compile timestamp;
- complete Errors pane with error and warning counts;
- generated `.ex5` path, modified time, and SHA-256 hash;
- the source markers `fef_mt5_quote_snapshot.json`, `MT5_RELAY`, `MT5 LIVE`,
  and `FileMove`.

The required compile result is zero errors. Treat warnings as review items and
do not continue unless the reviewer accepts the exact warning evidence. A
compile error is a hard failure; preserve its number, message, file, and line.
Do not edit source on the VPS during the evidence run.

## 4. EA attachment and Market Watch evidence

Attach the compiled EA to one demo chart without enabling terminal trading.
Capture:

- chart symbol/timeframe and visible EA name;
- Experts/Journal attachment and quote-export messages;
- trading-disabled state;
- empty MT5 Toolbox Trade tab;
- Market Watch rows with current nonzero bid and ask;
- each canonical-to-broker-symbol mapping.

Required canonical symbols:

- `XAUUSD`
- `USOIL`
- `EURUSD`
- `GBPUSD`
- `USDJPY`

Reject missing, tickless, or ambiguous mappings. Do not fabricate or substitute
a quote. The EA attachment is for quote export only.

## 5. Common Files JSON evidence

Set the actual runtime-user path, then verify existence and modified time:

```powershell
$QuoteFile = "C:\Users\<User>\AppData\Roaming\MetaQuotes\Terminal\Common\Files\fef_mt5_quote_snapshot.json"
Test-Path -LiteralPath $QuoteFile -PathType Leaf
Get-Item -LiteralPath $QuoteFile | Select-Object FullName, Length, LastWriteTimeUtc
Get-FileHash -LiteralPath $QuoteFile -Algorithm SHA256
```

Inspect only the quote fields:

```powershell
$Snapshot = Get-Content -LiteralPath $QuoteFile -Raw | ConvertFrom-Json
@($Snapshot.quotes) | Select-Object symbol, broker_symbol, bid, ask, mid, spread, timestamp, source, source_label, is_broker_quote, is_tradeable | Format-Table
```

Capture the sanitized table twice several seconds apart. It must show all five
canonical symbols, actual broker symbols, nonzero bid/ask, ask greater than bid,
correct mid/spread, advancing timestamps, `source = MT5_RELAY`,
`source_label = MT5 LIVE`, `is_broker_quote = true`, and
`is_tradeable = true`. The last field is relay provenance; it is not execution
permission. The JSON must contain no credential, command, or account secret.

## 6. Configure `.env` without exposing its secret

Create the untracked configuration from the placeholder template:

```powershell
Set-Location C:\FEF\fef-trading-agent\deploy\windows\quote-relay
Copy-Item .env.example .env
notepad .env
icacls .env /inheritance:r
icacls .env /grant:r "${env:USERDOMAIN}\${env:USERNAME}:(R)"
```

Point `FEF_QUOTE_SOURCE_FILE` to the absolute `$QuoteFile` path. For a remote
run, `FEF_QUOTE_RELAY_URL` must be HTTPS and end in `/api/relay/quotes`.

Capture only configured key names, never values:

```powershell
$EnvFile = "C:\FEF\fef-trading-agent\deploy\windows\quote-relay\.env"
$ConfiguredKeys = Get-Content -LiteralPath $EnvFile |
    Where-Object { $_.Trim() -and -not $_.Trim().StartsWith('#') } |
    ForEach-Object { ($_ -split '=', 2)[0].Trim() }
$ConfiguredKeys
```

The safe evidence output should list only `FEF_QUOTE_RELAY_SECRET`,
`FEF_QUOTE_RELAY_URL`, `FEF_QUOTE_SOURCE_FILE`,
`FEF_QUOTE_PUBLISH_INTERVAL_SECONDS`, and optional `FEF_QUOTE_STATUS_URL`.
Do not capture the editor window or `.env` contents.

## 7. One-shot publisher evidence

Run exactly once from the repository root:

```powershell
Set-Location C:\FEF\fef-trading-agent
& .\deploy\windows\quote-relay\run-once.ps1
$LASTEXITCODE
```

Capture the sanitized console output. Required output is exit code `0` and:

```text
Published quote for XAUUSD (HTTP 202)
Published quote for USOIL (HTTP 202)
Published quote for EURUSD (HTTP 202)
Published quote for GBPUSD (HTTP 202)
Published quote for USDJPY (HTTP 202)
```

No secret or Authorization header may appear. Do not continue if any symbol is
missing, invalid, rejected, stale, or fails publication.

## 8. Health-check evidence

Run the Phase 4J read-only health check:

```powershell
Set-Location C:\FEF\fef-trading-agent
& .\deploy\windows\quote-relay\health-check.ps1 -MaximumFileAgeSeconds 15
$LASTEXITCODE
```

Required output includes:

```text
Quote source exists; age_seconds=<fresh-value>
Quote source JSON parsed successfully
Read-only relay endpoint responded successfully
Quote relay health check passed
```

If `FEF_QUOTE_STATUS_URL` is configured, also require the read-only dashboard
status success message. Capture exit code `0`, file age, and safe status text;
never capture the secret.

## 9. Relay and status API evidence

Use GET requests only, with no Authorization header:

```powershell
$RelayUrl = "https://<approved-relay-host>/api/relay/quotes"
$StatusUrl = "https://<approved-dashboard-host>/api/status"
$RelayState = Invoke-RestMethod -Method Get -Uri $RelayUrl -TimeoutSec 5
$StatusState = Invoke-RestMethod -Method Get -Uri $StatusUrl -TimeoutSec 5
$RelayState | ConvertTo-Json -Depth 8
$StatusState | ConvertTo-Json -Depth 8
```

For a loopback dry run only, substitute `http://127.0.0.1:<port>` or
`http://localhost:<port>`. Required evidence is:

- relay response `status = READY` where that field is available;
- all five symbols are present;
- `source = MT5_RELAY`;
- `source_label = MT5 LIVE`;
- `is_broker_quote = true`;
- `is_tradeable = true`;
- prices and broker symbols agree with the captured MT5 snapshot;
- quote ages are inside the approved freshness window.

Store sanitized JSON only. A remote HTTP URL, TLS bypass, or Authorization
header on these read requests is a hard failure.

## 10. No-open-position and no-trade evidence

The authoritative evidence is an MT5 demo Toolbox Trade-tab screenshot showing
zero positions both before and after the dry run. As a secondary check, inspect
the account snapshot when the selected `/api/status` environment exposes it:

```powershell
$HasOpenPositions = $StatusState.account -and ($StatusState.account.PSObject.Properties.Name -contains "open_positions")
if ($HasOpenPositions) {
    "open_positions count: $(@($StatusState.account.open_positions).Count)"
} else {
    "open_positions: NOT AVAILABLE FROM THIS QUOTE-ONLY STATUS ENVIRONMENT"
}
```

Pass requires `open_positions count: 0`, or a recorded `NOT AVAILABLE` result
paired with the two empty MT5 Trade-tab screenshots. Any new position, pending
order, deal, or command activity is an immediate safety failure.

Complete and sign this operator attestation:

```text
No BUY/SELL/order/close-all/break-even confirmation:
- no trading control was selected;
- no order payload or execution credential was used;
- no position-management operation was requested;
- no position was open before or after the dry run;
- the quote-relay secret was used only for quote ingestion.
```

## Failure decision tree

```text
Preflight or demo-account gate fails
  -> Do not attach or publish; preserve sanitized evidence; correct operational setup.

MetaEditor compile fails or has an unapproved warning
  -> Stop; capture complete compiler evidence; do not edit source on the VPS.

EA attaches but JSON is absent/stale/invalid
  -> Keep trading disabled; check attachment, Market Watch, mapping, clock, and Common Files permissions.

run-once.ps1 fails
  -> Missing/configuration error: correct only approved local configuration.
  -> Stale/schema error: stop and diagnose MT5 export/clock.
  -> HTTP 401/403: stop retries; verify provisioning; rotate if exposure is possible.
  -> TLS/network/5xx: do not bypass TLS; retain failure evidence and escalate.

health-check.ps1 or read API fails
  -> Separate file-freshness failure from relay/status reachability; do not relabel stale data live.

Provenance is wrong or a symbol is missing
  -> Fail the run; stop publishing; preserve MT5, relay, and status snapshots.

Any position, order, command, or secret exposure appears
  -> Safety incident: stop immediately, revoke the quote secret, isolate the VPS, and preserve evidence.
```

Do not modify production code during failure diagnosis. Code changes require a
separate reviewed phase.

## Rollback steps

1. Stop any interactive publisher process with Ctrl+C.
2. If a task was created outside this first-run scope, stop and disable it:

```powershell
Stop-ScheduledTask -TaskName "FEF Quote Relay Publisher"
Disable-ScheduledTask -TaskName "FEF Quote Relay Publisher"
```

3. Detach the EA from the demo chart or close the demo MT5 terminal.
4. Revoke the VPS quote-relay secret at the relay.
5. Restrict the populated `.env` and rotate the secret if exposure is possible.
6. Wait for cached quotes to expire; confirm relay/status becomes stale, empty,
   unavailable, external, or fallback rather than remaining `MT5 LIVE`.
7. Confirm the MT5 Trade tab remains empty.
8. Preserve sanitized evidence, hashes, timestamps, and the failure classification.
9. Restore only a previously reviewed side-by-side checkout; do not use a
   destructive Git reset.

## Pass and fail criteria

The Phase 4K dry run passes only when all of these are evidenced:

- native Windows VPS, dedicated demo MT5, reviewed Git revision, and clean tree;
- successful reviewed MetaEditor compile and quote-only EA attachment;
- fresh atomic Common Files JSON containing all five supported symbols;
- one-shot exit code `0` and HTTP 202 for all five symbols;
- health-check exit code `0` and fresh source-file age;
- relay `status = READY` where applicable;
- relay/status show `MT5_RELAY`, `MT5 LIVE`, broker flag true, and tradeable flag
  true for all five symbols;
- empty MT5 Trade tab before and after;
- API `open_positions` empty, or its absence explicitly documented with MT5
  screenshots as the authoritative evidence;
- no trading or position-management action and no execution credential;
- no secret in console output, logs, screenshots, commands, or evidence;
- successful stale/expiry observation during controlled publisher shutdown if
  included in the approved window.

Anything else is a failed or incomplete run. A pass authorizes only progression
to separately approved quote-relay supervision, reboot, monitoring, and remote
HTTPS evidence work. It does not approve real-money execution.
