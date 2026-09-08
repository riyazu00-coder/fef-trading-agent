# Phase 4H: MT5 Evidence and VPS Quote Relay Checklist

## Status and safety boundary

Phase 4G manual quote-export and local relay verification **passed** on the
Mac/Wine demo-MT5 environment described below. The pass covers quote export and
quote relay only.

No position was open during the verification. No BUY/SELL action, close-all,
break-even, or order execution was attempted. The relay credential authenticates
quote ingestion only and does not authorize trading.

**Real-money execution remains blocked and is not approved.** Phase 4G does not
validate trade execution, position controls, broker acknowledgements, or any
live-account behavior.

## Recorded Phase 4G evidence

### Environment

- Platform: MetaTrader 5 on macOS through Wine.
- Broker environment: Exness demo MT5.
- Chart used: XAUUSD M30.
- EA attached: `FEF_TradingAgentsBridge`.
- Open positions during verification: zero.

### Active source and compile artifact

The latest Phase 4E source was copied to the active MT5 Experts folder:

```text
/Users/mac/Library/Application Support/net.metaquotes.wine.metatrader5/drive_c/Program Files/MetaTrader 5/MQL5/Experts/Advisors/FEF_TradingAgentsBridge.mq5
```

The active source was inspected and contained these expected exporter markers:

- `fef_mt5_quote_snapshot.json`
- `fef_mt5_quote_snapshot.json.tmp`
- `MT5_RELAY`
- `MT5 LIVE`
- `FileMove`

MetaEditor compiled the source and generated:

```text
/Users/mac/Library/Application Support/net.metaquotes.wine.metatrader5/drive_c/Program Files/MetaTrader 5/MQL5/Experts/Advisors/FEF_TradingAgentsBridge.ex5
```

The compile/generation step passed for this manual check. The retained evidence
package should still preserve the exact MetaEditor error and warning counts,
terminal build, and editor build for later audit.

### Common Files quote output

The EA created the quote snapshot at the verified Mac/Wine Common Files path:

```text
/Users/mac/Library/Application Support/net.metaquotes.wine.metatrader5/drive_c/users/user/AppData/Roaming/MetaQuotes/Terminal/Common/Files/fef_mt5_quote_snapshot.json
```

The JSON contained all supported canonical symbols:

- `XAUUSD`
- `USOIL`
- `EURUSD`
- `GBPUSD`
- `USDJPY`

The inspected snapshot contained nonzero bid/ask values, updating timestamps,
and the expected provenance:

```json
{
  "source": "MT5_RELAY",
  "source_label": "MT5 LIVE",
  "is_broker_quote": true,
  "is_tradeable": true
}
```

`is_tradeable` is quote provenance metadata required by the relay contract. It
does not grant execution permission or indicate that a trade occurred.

### Commands recorded for the successful local relay check

The local backend command was:

```bash
FEF_QUOTE_RELAY_SECRET='phase-4g-local-only-not-production' python3 -m backend.server 8000
```

The one-shot publisher command, using the real MT5 file, was:

```bash
FEF_QUOTE_RELAY_SECRET='phase-4g-local-only-not-production' \
FEF_QUOTE_RELAY_URL='http://localhost:8000/api/relay/quotes' \
FEF_QUOTE_SOURCE_FILE='/Users/mac/Library/Application Support/net.metaquotes.wine.metatrader5/drive_c/users/user/AppData/Roaming/MetaQuotes/Terminal/Common/Files/fef_mt5_quote_snapshot.json' \
python3 scripts/quote_relay_publisher.py --once
```

The read-only verification commands were:

```bash
curl -s http://localhost:8000/api/relay/quotes | python3 -m json.tool
curl -s http://localhost:8000/api/status | python3 -m json.tool
```

### Publisher and status results

The publisher received HTTP 202 for every exported symbol:

```text
Published quote for XAUUSD (HTTP 202)
Published quote for USOIL (HTTP 202)
Published quote for EURUSD (HTTP 202)
Published quote for GBPUSD (HTTP 202)
Published quote for USDJPY (HTTP 202)
```

Immediately afterward, `/api/status` reported all five instruments with:

```text
source = MT5_RELAY
source_label = MT5 LIVE
is_broker_quote = true
is_tradeable = true
```

This proves the manually observed chain from the demo terminal's Common Files
snapshot through the publisher and authenticated local relay cache into the
status response. It does not prove durable cloud storage or remote delivery.

### No-trade safety result

- No open positions were present.
- No trade action was initiated.
- No close-all or break-even operation was initiated.
- No order-execution path was included in the test procedure.
- No real account was used.

## Remaining risks after the local pass

- MetaEditor compile output and build identifiers must remain attached to the
  evidence package; generating `.ex5` alone is not a permanent audit record.
- The test used Mac/Wine. Native Windows VPS paths, service permissions,
  MetaEditor build compatibility, and restart behavior remain unverified.
- The relay cache is process-local and in-memory; a restart loses snapshots.
- A remote/cloud deployment still needs a shared TTL-backed store if multiple
  instances must see the same quote.
- Quote replay/sequence controls, rate limits, monitoring, and secret rotation
  remain deployment requirements.
- Broker symbols and trading sessions may differ on another broker or VPS.
- Host clock drift can cause fresh quotes to be rejected or stale quotes to be
  misclassified; VPS and relay clocks require monitored synchronization.
- Market closure, terminal disconnection, EA removal, file permission failure,
  or publisher failure must result in an observable stale/empty state.
- The active EA also contains existing execution command handlers. The VPS
  quote design must keep command ports and trading endpoints inaccessible and
  must never treat the quote-relay secret as an execution credential.
- Local HTTP was acceptable only for the loopback test. Every remote hop must
  use HTTPS with certificate validation.

## Quote-only Windows VPS deployment checklist

### A. Host and MT5 isolation

- [ ] Use a supported native Windows VPS for the MT5 runtime; do not treat the
      Mac/Wine pass as production-runtime validation.
- [ ] Start with a dedicated broker demo account only.
- [ ] Keep real-account credentials off the VPS during quote-relay validation.
- [ ] Apply Windows updates, endpoint protection, least-privilege service
      accounts, disk encryption where available, and restrictive firewall rules.
- [ ] Synchronize the Windows clock with monitored NTP and alert on drift.
- [ ] Do not expose MT5, port 5555, Common Files, RDP, or a local backend
      directly to the public internet.

### B. EA installation and demo compilation

- [ ] Copy only the reviewed `mql5/FEF_TradingAgentsBridge.mq5` into the VPS
      terminal's `MQL5\Experts` directory.
- [ ] Record repository commit, file hash, MT5 build, and MetaEditor build.
- [ ] Compile in MetaEditor and require zero errors and zero warnings.
- [ ] Retain the compile log and generated `.ex5` hash.
- [ ] Attach the EA to a demo XAUUSD chart with trading permissions disabled.
- [ ] Confirm no pending command file exists and use an unused command socket
      port for the quote-only verification.
- [ ] Show XAUUSD, USOIL, EURUSD, GBPUSD, and USDJPY in Market Watch where the
      broker offers them.
- [ ] Configure each exact broker prefix/suffix mapping explicitly and reject
      ambiguity rather than guessing.

### C. Common Files quote source

- [ ] Locate the VPS value of `TERMINAL_COMMONDATA_PATH` and record the absolute
      path to `Files\fef_mt5_quote_snapshot.json`.
- [ ] Configure that absolute path as `FEF_QUOTE_SOURCE_FILE`.
- [ ] Restrict file and directory access to the MT5/publisher service account.
- [ ] Confirm atomic temp-to-final replacement and absence of partial JSON.
- [ ] Confirm all expected symbols have nonzero, uncrossed bid/ask values and
      correct broker symbols.
- [ ] Confirm timestamps advance and remain within the relay's freshness window.
- [ ] Confirm terminal disconnection or stopped ticks cause quotes to expire.

### D. Publisher service preparation

- [ ] First run `scripts/quote_relay_publisher.py --once` interactively against
      the demo-generated file and capture its exit status.
- [ ] Later configure the publisher as a supervised Windows service under a
      dedicated least-privilege account.
- [ ] Use a bounded restart policy with backoff; avoid an unbounded retry loop.
- [ ] Store configuration in the service environment or an approved secret
      manager, never in source code, JSON files, command logs, or screenshots.
- [ ] Generate a unique high-entropy `FEF_QUOTE_RELAY_SECRET` for the VPS. Do
      not reuse the local Phase 4G development value or any trading credential.
- [ ] Redact authorization headers and confirm the relay secret never appears
      in application, service-manager, proxy, or monitoring logs.
- [ ] Configure `FEF_QUOTE_RELAY_URL` as an HTTPS URL ending exactly in
      `/api/relay/quotes`; remote plain HTTP is prohibited.
- [ ] Validate the server certificate and document secret rotation/revocation.

### E. Network and endpoint boundary

- [ ] Prefer outbound publisher traffic from the VPS to the authenticated
      quote-only relay endpoint.
- [ ] Do not expose or forward any trading mutation endpoint from the VPS.
- [ ] Do not configure a trading authentication secret for this quote-only
      service.
- [ ] Restrict firewall egress to required DNS/NTP and the approved HTTPS relay.
- [ ] Confirm the quote secret is rejected by all trading-state mutation routes.
- [ ] Apply relay request-size limits, rate limits, authentication monitoring,
      and safe audit logging without payload secrets.

### F. Monitoring and failure handling

- [ ] Monitor MT5 process health, demo connection state, EA attachment, and
      Market Watch tick age.
- [ ] Monitor quote-file modification time and newest embedded timestamp.
- [ ] Monitor publisher process health, last successful HTTP response, retry
      count, and consecutive failures.
- [ ] Alert before or at the configured stale threshold; never continue showing
      an expired snapshot as MT5 LIVE.
- [ ] Monitor relay authentication failures, rejected schemas, future clock
      skew, and unexpected symbol changes.
- [ ] Confirm `/api/relay/quotes` and `/api/status` show `MT5_RELAY` / `MT5 LIVE`
      only while the demo quotes are fresh.
- [ ] Stop MT5 and the publisher deliberately and verify relay expiry and honest
      fallback labeling.
- [ ] Test service restart and VPS reboot recovery without creating commands or
      positions.

### G. Approval gate

- [ ] Complete a documented demo soak period covering market-open and
      market-closed transitions.
- [ ] Review monitoring evidence, file permissions, firewall rules, TLS,
      authentication, expiry behavior, and service recovery.
- [ ] Keep order execution, position management, and trading credentials out of
      the VPS quote-relay verification scope.
- [ ] Do not enable real-money execution. A separate explicit approval process
      is required after all execution safety gates—not this quote-relay pass.

## Phase 4H conclusion

Phase 4G local Mac/Wine quote export and relay verification is recorded as
passed. Phase 4H prepares, but does not perform or approve, native Windows VPS
deployment. The next permitted work is quote-only VPS preparation and demo
validation under the checklist above. Real-money execution remains blocked.
