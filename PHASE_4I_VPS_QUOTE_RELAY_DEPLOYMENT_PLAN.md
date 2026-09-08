# Phase 4I: Windows VPS Quote Relay Deployment Plan

## Purpose and safety boundary

Phase 4I defines a repeatable deployment plan for this quote-only chain:

```text
Native Windows VPS
  -> Demo MT5
  -> FEF_TradingAgentsBridge EA
  -> Common Files/fef_mt5_quote_snapshot.json
  -> scripts/quote_relay_publisher.py
  -> authenticated HTTPS /api/relay/quotes
  -> dashboard/backend MT5_RELAY / MT5 LIVE display
```

This phase is deployment planning only. The first VPS deployment must use a
dedicated demo MT5 account. It must not test BUY or SELL, submit an order, alter
a position, or carry a trading credential. Real-money execution remains blocked
and is not approved.

The quote-relay secret authenticates quote ingestion only. It must not authorize
any execution route. The VPS sends outbound HTTPS snapshots; it does not expose
MT5, Common Files, a command listener, or trading endpoints to the internet.

## Deployment gates

Do not begin the VPS dry run until all of these are true:

- [ ] The Phase 4G/4H Mac/Wine evidence and reviewed repository commit are recorded.
- [ ] A native Windows VPS and dedicated demo broker account are approved.
- [ ] The remote endpoint accepts authenticated quote-only submissions over
      HTTPS and rejects the quote secret on every trading-state mutation route.
- [ ] TLS validation, payload limits, authentication failure handling, and quote
      expiry have been verified in the target environment.
- [ ] The target cache is suitable for the hosting topology. The current
      process-local in-memory cache is not a durable multi-instance cloud store.
- [ ] A rollback owner, monitoring owner, maintenance window, and evidence
      location are assigned.

## Recommended VPS requirements

Use a supported native 64-bit Windows Server or Windows desktop VPS compatible
with the broker's current MT5 build. Size it from observed demo resource usage,
then retain headroom for MT5, MetaEditor, Python, logging, updates, and monitoring.

Minimum operational requirements:

- persistent SSD storage with backup/snapshot support;
- stable outbound internet and DNS access;
- monitored UTC/NTP clock synchronization;
- a dedicated least-privilege Windows account for MT5 and the publisher;
- restrictive Windows Firewall rules and no public MT5/TCP listener;
- private administrative access through an approved VPN or IP allowlist;
- endpoint protection, automatic security updates, and disk encryption where
  supported;
- monitoring for CPU, memory, disk, process health, quote age, and HTTPS failures.

Do not select a VPS solely from this document. Record the provider, region,
Windows edition/build, resources, backup policy, network controls, and responsible
operator during the deployment review.

## 1. Windows VPS baseline checklist

- [ ] Provision a clean native Windows VPS from an approved image.
- [ ] Apply all security updates and reboot before installing MT5.
- [ ] Create a named, non-administrator runtime account.
- [ ] Restrict RDP at the network boundary; never expose it broadly.
- [ ] Enable Windows Firewall and deny unsolicited inbound traffic by default.
- [ ] Permit only approved outbound DNS, NTP, Windows/broker services, Git source,
      and the HTTPS relay destination.
- [ ] Configure time synchronization and record current offset.
- [ ] Create `C:\FEF` with access limited to administrators and the runtime account.
- [ ] Configure backup/snapshot retention without capturing plaintext secrets.
- [ ] Record the initial VPS image/version and recovery procedure.

Useful PowerShell inventory commands:

```powershell
Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, OsBuildNumber
Get-TimeZone
w32tm /query /status
Get-NetFirewallProfile | Select-Object Name, Enabled, DefaultInboundAction
```

## 2. Python installation checklist

Use a currently supported CPython version covered by project CI; Python 3.12 is
the recommended deployment baseline for this plan. Install it from an approved
official source for all users or for the dedicated runtime account. Do not rely
on an unversioned interpreter that may change during an update.

Verify the selected interpreter:

```powershell
py -3.12 --version
py -3.12 -c "import ssl, urllib.request; print(ssl.OPENSSL_VERSION)"
```

Create an isolated environment:

```powershell
Set-Location C:\FEF\fef-trading-agent
py -3.12 -m venv .venv
& .\.venv\Scripts\python.exe --version
```

The quote publisher itself uses the Python standard library. Do not install
additional packages merely for the publisher. If the full backend or test suite
is later required on the VPS, dependency installation must follow a separately
reviewed, pinned deployment process rather than an ad hoc global install.

## 3. Repository clone and controlled update

Initial clone from the approved repository URL:

```powershell
Set-Location C:\FEF
git clone <approved-repository-url> fef-trading-agent
Set-Location C:\FEF\fef-trading-agent
git branch --show-current
git rev-parse HEAD
git status --short
```

Require `main`, the approved commit hash, and a clean status before copying the
EA or starting the publisher. Record the commit and file hashes:

```powershell
git log --oneline -5
Get-FileHash .\mql5\FEF_TradingAgentsBridge.mq5 -Algorithm SHA256
Get-FileHash .\scripts\quote_relay_publisher.py -Algorithm SHA256
```

For a later approved fast-forward update:

```powershell
Set-Location C:\FEF\fef-trading-agent
git status --short
git fetch --prune origin
git log --oneline HEAD..origin/main
git pull --ff-only origin main
git rev-parse HEAD
git status --short
```

Stop if the worktree is dirty, the update is not fast-forward, or the commit is
not approved. Keep the prior approved checkout or VPS snapshot available for
rollback; do not perform a destructive reset.

## 4. MT5 installation and demo login

- [ ] Download the broker's MT5 installer from its verified official channel.
- [ ] Verify publisher/signature information according to organizational policy.
- [ ] Install MT5 under the dedicated runtime account.
- [ ] Start MT5 interactively and record terminal and MetaEditor build numbers.
- [ ] Log in only to the dedicated broker demo account.
- [ ] Confirm the terminal visibly identifies the account as demo.
- [ ] Confirm no open positions, pending orders, or stale FEF command file exists.
- [ ] Keep global Algo Trading off and EA trading permission unchecked during
      quote-relay verification.
- [ ] Do not store real-account credentials on this VPS.

MT5 is a desktop application and may depend on an interactive user session.
Validate the broker terminal's behavior after RDP disconnect without logging off,
and document the approved auto-login/session-recovery approach before claiming
continuous availability.

## 5. Copy and compile the EA

- [ ] In MT5 choose **File -> Open Data Folder**.
- [ ] Copy the reviewed `mql5\FEF_TradingAgentsBridge.mq5` into a clearly named
      subfolder under `MQL5\Experts`.
- [ ] Open that exact file in MetaEditor and confirm the recorded SHA256 hash.
- [ ] Compile with F7 and require **0 errors, 0 warnings**.
- [ ] Record the full compile output and hash the resulting `.ex5`.
- [ ] Refresh Navigator and attach the EA to a demo XAUUSD chart.
- [ ] Keep Algo Trading off and **Allow Algo Trading** unchecked.
- [ ] Set `InpSocketPort` to a confirmed unused loopback port so command polling
      is not connected during quote-only validation.
- [ ] Keep `InpQuoteExportIntervalSeconds = 2` and
      `InpQuoteMaxTickAgeSeconds = 10` unless a reviewed configuration changes them.

Any compile warning, unexpected command message, or position change is a stop
condition. Preserve evidence and roll back rather than editing on the VPS.

## 6. Market Watch and broker-symbol mapping

Show and verify all five canonical instruments:

- `XAUUSD`
- `USOIL`
- `EURUSD`
- `GBPUSD`
- `USDJPY`

For every instrument:

- [ ] Record the exact Market Watch broker symbol, including prefix/suffix.
- [ ] Confirm current nonzero bid and ask ticks.
- [ ] Configure the corresponding `InpQuote*BrokerSymbol` input when the exact
      canonical name is unavailable or discovery is ambiguous.
- [ ] Confirm exported `symbol` stays canonical and `broker_symbol` exactly
      matches Market Watch.
- [ ] Reject unavailable or ambiguous mappings; never substitute a different
      chart instrument or fabricate a quote.

## 7. Common Files JSON source

Determine the actual value of `TERMINAL_COMMONDATA_PATH`. The expected native
Windows pattern is:

```text
C:\Users\<RuntimeUser>\AppData\Roaming\MetaQuotes\Terminal\Common\Files\fef_mt5_quote_snapshot.json
```

Checklist:

- [ ] Record the exact absolute path.
- [ ] Confirm `fef_mt5_quote_snapshot.json.tmp` is moved atomically over the final
      `fef_mt5_quote_snapshot.json`.
- [ ] Confirm the service account can read but does not need to modify the file.
- [ ] Restrict directory access from unrelated accounts.
- [ ] Validate the JSON repeatedly with:

```powershell
$QuoteFile = "C:\Users\<RuntimeUser>\AppData\Roaming\MetaQuotes\Terminal\Common\Files\fef_mt5_quote_snapshot.json"
Get-Content -Raw $QuoteFile | ConvertFrom-Json | ConvertTo-Json -Depth 6
Get-Item $QuoteFile | Select-Object FullName, Length, LastWriteTimeUtc
```

- [ ] Confirm all five expected symbols, valid bid/ask, correct mid/spread,
      exact broker symbols, and advancing timestamps.
- [ ] Confirm no secret, account credential, order, or command is present.

## 8. Publisher environment variables and secret handling

Required variables:

```powershell
$env:FEF_QUOTE_SOURCE_FILE = $QuoteFile
$env:FEF_QUOTE_RELAY_URL = "https://<approved-relay-host>/api/relay/quotes"
$env:FEF_QUOTE_PUBLISH_INTERVAL_SECONDS = "2"
$env:FEF_QUOTE_RELAY_SECRET = "<unique-high-entropy-secret-from-approved-store>"
```

The placeholder is never a literal deployment secret. Generate at least 256
bits with a cryptographically secure generator and provision the same value to
the relay through approved secret-management channels. It must be unique to
this VPS/environment and must not equal `FEF_BRIDGE_SECRET`, the Phase 4G local
value, an account password, or any browser credential.

Do not print the secret, include it in command arguments, commit it, save it in
the quote JSON, or place it in Task Scheduler/NSSM logs. Clear the interactive
session after testing:

```powershell
Remove-Item Env:FEF_QUOTE_RELAY_SECRET -ErrorAction SilentlyContinue
```

Every non-loopback `FEF_QUOTE_RELAY_URL` must use `https://`, end exactly in
`/api/relay/quotes`, and pass normal certificate and hostname validation. Plain
HTTP is prohibited for the VPS-to-relay hop.

## 9. Publisher one-shot test

Set the four session variables above, confirm the EA is producing a fresh file,
then run:

```powershell
Set-Location C:\FEF\fef-trading-agent
& .\.venv\Scripts\python.exe .\scripts\quote_relay_publisher.py --once
$LASTEXITCODE
```

Pass criteria:

- exit code is `0`;
- all five symbols report `HTTP 202`;
- no secret or Authorization header appears in output;
- the remote relay read endpoint shows the submitted broker symbols and prices;
- the quote age is within the configured freshness window.

Do not continue to supervision until this one-shot evidence passes.

## 10. Interactive continuous test

The publisher enters continuous mode when `--once` is omitted:

```powershell
Set-Location C:\FEF\fef-trading-agent
& .\.venv\Scripts\python.exe .\scripts\quote_relay_publisher.py
```

Run this interactively on demo data through market-open, transient-network, and
market-closed conditions. Stop with Ctrl+C. Confirm bounded HTTP retries, the
configured two-second interval, honest stale transitions, and secret-free logs.

## 11. Task Scheduler or supervised service

### Native Task Scheduler baseline

After the interactive demo test passes, create a task under the dedicated runtime
account with:

- trigger: at that account's logon, after MT5/session startup;
- program: `C:\FEF\fef-trading-agent\.venv\Scripts\python.exe`;
- arguments: `C:\FEF\fef-trading-agent\scripts\quote_relay_publisher.py`;
- start in: `C:\FEF\fef-trading-agent`;
- no `--once` flag;
- restart on failure with bounded delay/count;
- stop the existing instance before starting a duplicate;
- no plaintext secret in arguments, task name, description, or log path.

The task account must have only the file and outbound-network permissions it
needs. Validate environment-variable availability in that non-interactive
context; do not assume variables from an administrator's PowerShell session are
inherited.

Useful inspection commands after a task named `FEF Quote Relay Publisher` is
created through the reviewed Task Scheduler UI or deployment tooling:

```powershell
Get-ScheduledTask -TaskName "FEF Quote Relay Publisher"
Get-ScheduledTaskInfo -TaskName "FEF Quote Relay Publisher"
```

### NSSM/Windows service option

NSSM or another service wrapper may be considered only after separate security
approval, version pinning, hash/signature verification, and testing with this
console process. Configure the same Python executable, script path, working
directory, least-privilege account, delayed automatic start, bounded restart
policy, and redacted output. Never put the relay secret in a visible command
line. This repository does not bundle, install, or approve NSSM.

Because MT5 itself is interactive, supervising the publisher as a service does
not solve terminal session recovery. Monitor both components independently.

## 12. Logging, monitoring, and alerting

Logs may contain timestamp, canonical symbol, HTTP status, retry count, process
start/stop, and safe error class. They must not contain secrets, Authorization
headers, broker account identifiers, or complete environment dumps.

Monitor and alert on:

- MT5/demo connection and EA attachment;
- quote file existence, size, modification time, newest timestamp, and symbol set;
- publisher process state, last successful HTTP 202, consecutive failures, and
  restart count;
- relay rejection reason, authentication failures, schema errors, and clock skew;
- end-to-end quote age in `/api/relay/quotes` and `/api/status`;
- any `MT5 LIVE` label older than the permitted freshness window;
- unexpected broker-symbol changes or missing symbols;
- disk space, VPS clock offset, certificate expiry, and Windows update/reboot state.

An expired or absent quote must downgrade to external/fallback/unavailable. It
must never remain labeled `MT5 LIVE` merely because the publisher process exists.

## 13. Relay and dashboard verification

Use the approved read-only HTTPS URLs; do not send the relay secret to GET
requests. Example PowerShell:

```powershell
$RelayReadUrl = "https://<approved-relay-host>/api/relay/quotes"
$StatusUrl = "https://<approved-dashboard-host>/api/status"
$RelayState = Invoke-RestMethod -Method Get -Uri $RelayReadUrl
$StatusState = Invoke-RestMethod -Method Get -Uri $StatusUrl
$RelayState | ConvertTo-Json -Depth 8
$StatusState | ConvertTo-Json -Depth 8
```

Exact pass targets:

- XAUUSD, USOIL, EURUSD, GBPUSD, and USDJPY each publish with HTTP 202;
- `source = MT5_RELAY`;
- `source_label = MT5 LIVE`;
- `is_broker_quote = true`;
- `is_tradeable = true`;
- bid, ask, broker symbol, and timestamp match the current MT5 export;
- `open_positions` remains empty if account state is displayed;
- no BUY/SELL testing or order testing occurs.

Stop the publisher and verify that relay entries expire and dashboard provenance
downgrades within the approved freshness behavior. Restart it and verify clean
recovery without duplicate publisher processes.

## 14. Reboot recovery test

On demo only:

1. Record current hashes, timestamps, publisher state, relay state, and zero
   positions.
2. Reboot the VPS during an approved window.
3. Confirm Windows time synchronization and firewall profiles recover.
4. Confirm the demo MT5 terminal/session returns through the approved mechanism.
5. Confirm the EA is attached, mappings remain correct, and the JSON resumes.
6. Confirm exactly one publisher instance starts under the intended account.
7. Confirm the first fresh submissions receive HTTP 202 for all available symbols.
8. Confirm `/api/status` returns correct fresh provenance.
9. Confirm stale data was not shown as live during the outage.
10. Confirm open positions remain empty and no command was sent.

Capture task/service history, Windows Event Viewer excerpts, process identity,
file timestamps, publisher output, relay/status excerpts, and recovery duration.

## 15. Failure modes and rollback

| Failure | Safe response |
| --- | --- |
| EA compile error/warning | Stop; retain compiler evidence; restore prior approved artifact |
| MT5 demo disconnected | Stop publishing live provenance; investigate terminal/session/network |
| Missing or malformed JSON | Publisher fails closed; retain last complete file for diagnosis |
| Stale/future timestamp | Reject quote; check MT5 ticks and both host clocks |
| Missing/ambiguous broker symbol | Omit/reject it; correct reviewed explicit mapping |
| HTTP 401/403 | Stop retry storm; verify secret provisioning and revoke if exposed |
| HTTP 5xx/network outage | Keep bounded retries; alert; dashboard must downgrade |
| TLS validation failure | Stop; do not disable certificate verification |
| Duplicate publisher process | Stop both, identify supervisor fault, restart exactly one |
| Secret appears in logs | Stop service, restrict evidence, rotate/revoke secret, remediate logging |
| Quote stays live after outage | Disable ingest/read exposure and correct expiry before resuming |
| Any command or position activity | Stop MT5/publisher test, preserve evidence, escalate safety incident |

Rollback procedure:

1. Stop and disable the scheduled task/service.
2. Stop the publisher process and detach the demo EA if necessary.
3. Revoke the VPS quote-relay secret at the relay.
4. Confirm cached snapshots expire and the dashboard downgrades honestly.
5. Block the VPS relay egress or ingest credential until the incident is reviewed.
6. Restore the prior approved side-by-side checkout/artifact and configuration;
   do not use a destructive Git reset.
7. Preserve sanitized logs, hashes, timestamps, and failure evidence.
8. Re-enter at the one-shot demo gate only after review and explicit approval.

## Final approval gate

Phase 4I produces a plan, not a deployment. Remaining required evidence includes
the native Windows VPS dry run, authenticated remote HTTPS relay test, supervised
continuous run, stale-quote alert, reboot recovery, and dashboard provenance
check. None of these quote-only checks approve real-money execution.
