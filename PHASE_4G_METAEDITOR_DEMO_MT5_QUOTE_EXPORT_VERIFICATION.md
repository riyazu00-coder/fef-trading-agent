# Phase 4G: MetaEditor and Demo-MT5 Quote Export Verification

## Purpose

Phase 4G is the manual verification gate for the Phase 4E quote exporter. It
checks this data-only chain on the machine running MetaTrader 5:

```text
Demo MT5
  -> mql5/FEF_TradingAgentsBridge.mq5
  -> <MT5 Common Files>/fef_mt5_quote_snapshot.json
  -> scripts/quote_relay_publisher.py
  -> local POST /api/relay/quotes
  -> GET /api/relay/quotes and GET /api/status
```

## Strict safety boundary

This verification is **quote export only and demo MT5 only**. It is not
approved for a real account or real-money execution. Do not test BUY or SELL,
do not submit or test any order, and do not test close-all or break-even.

- Use a dedicated demo terminal with no real-account credentials.
- Disable algorithmic trading globally and leave the EA's **Allow Algo
  Trading** permission unchecked. Quote timer events should still be observed;
  stop if the broker terminal behaves differently.
- Do not set or use a trading authentication token. The only credential used
  in the relay steps is the temporary local `FEF_QUOTE_RELAY_SECRET`.
- Before attaching the EA, confirm `fef_pending_order.json` is absent from MT5
  Common Files. If it exists, stop and have its origin reviewed; do not attach
  the EA where it could consume a stale command.
- Configure `InpSocketPort` to a confirmed unused loopback port for this
  quote-only check so the EA cannot poll the backend's command queue.
- Stop immediately if any order, position, or account mutation is observed.

Passing Phase 4G proves only quote-file and relay behavior. It does not approve
real-money execution.

## Record the environment first

Capture these values without exposing an account number, password, token, or
server credential:

- Windows version and whether MT5 is native Windows or Wine;
- MT5 terminal build and MetaEditor build;
- broker name and the visible **Demo** account indicator;
- local system time, timezone, and clock-sync status;
- repository commit/branch used to obtain the EA source.

## 1. Copy and open the active EA

1. In the demo MT5 terminal, choose **File -> Open Data Folder**.
2. Open `MQL5\Experts` and create or choose a clearly named FEF subfolder.
3. Copy only the active repository file
   `mql5/FEF_TradingAgentsBridge.mq5` into that subfolder. Do not substitute an
   older or similarly named bridge.
4. Open MetaEditor from MT5 (F4), then use **File -> Open** to open that copied
   `.mq5` file.
5. Confirm the file contains `FEF_QUOTE_EXPORT_FILE` with the filename
   `fef_mt5_quote_snapshot.json` before compiling.

MT5's Open Data Folder points to the terminal data area containing
`MQL5\Experts`. The shared output is instead written through `FILE_COMMON` to
the common data area described below.

## 2. Compile in MetaEditor

1. With `FEF_TradingAgentsBridge.mq5` active, select **File -> Compile** or
   press **F7**.
2. Open the MetaEditor **Toolbox -> Errors** tab.
3. The pass result is **0 errors, 0 warnings** and a generated
   `FEF_TradingAgentsBridge.ex5` beside the source.
4. Treat every warning as unresolved even if an `.ex5` file is generated.

For any error or warning, stop before attaching the EA and capture:

- complete description;
- file name;
- line and column;
- total error and warning counts;
- MetaEditor and MT5 build numbers;
- a screenshot of the Errors tab and a text copy of the compile output.

Do not make an unreviewed workaround in the terminal copy. Return the evidence
for an approved source change.

## 3. Prepare demo Market Watch and symbol mappings

The exporter attempts these canonical symbols:

- `XAUUSD`
- `USOIL`
- `EURUSD`
- `GBPUSD`
- `USDJPY`

In MT5 Market Watch, locate and show the exact broker instrument corresponding
to every canonical symbol. Verify it has nonzero bid and ask ticks. The exact
canonical name is tried first. Broker naming may instead use suffixes or
prefixes such as `XAUUSDm`, `EURUSD.a`, `pro.GBPUSD`, or a broker-specific oil
alias.

For any broker name that is not resolved uniquely, set the matching EA input
to the exact Market Watch name:

| Canonical symbol | EA input |
| --- | --- |
| `XAUUSD` | `InpQuoteXAUUSDBrokerSymbol` |
| `USOIL` | `InpQuoteUSOILBrokerSymbol` |
| `EURUSD` | `InpQuoteEURUSDBrokerSymbol` |
| `GBPUSD` | `InpQuoteGBPUSDBrokerSymbol` |
| `USDJPY` | `InpQuoteUSDJPYBrokerSymbol` |

Do not guess an oil alias or silently substitute the chart symbol. If multiple
prefix/suffix variants match, supply one explicit mapping. If the correct
instrument cannot be identified unambiguously, leave that symbol unverified
and report it as a failure.

## 4. Attach to a demo chart

1. Return to MT5 and refresh the Navigator if the compiled EA is not visible.
2. Open a **demo XAUUSD chart**; the timeframe does not affect this file-format
   check.
3. Confirm algorithmic trading remains disabled and **Allow Algo Trading** is
   unchecked.
4. Drag `FEF_TradingAgentsBridge` from Navigator onto the chart.
5. In Inputs:
   - set explicit broker-symbol mappings identified above;
   - keep `InpQuoteExportIntervalSeconds = 2`;
   - keep `InpQuoteMaxTickAgeSeconds = 10`;
   - set `InpSocketPort` to a confirmed unused local port.
6. Confirm the Experts and Journal tabs show initialization without quote-file
   errors. Do not proceed if any command-processing message appears.

## 5. Locate and inspect the Common Files output

Expected file:

```text
<MT5 Common Files>\fef_mt5_quote_snapshot.json
```

Typical native Windows location:

```text
C:\Users\<User>\AppData\Roaming\MetaQuotes\Terminal\Common\Files\fef_mt5_quote_snapshot.json
```

The exact common root is the value of
`TerminalInfoString(TERMINAL_COMMONDATA_PATH)` with `\Files` appended. Wine
uses the corresponding path inside its Windows prefix; record the resolved
absolute host path for `FEF_QUOTE_SOURCE_FILE`.

The file must be a complete JSON object containing a `quotes` list. Every quote
must contain:

- `symbol`
- `broker_symbol`
- `bid`
- `ask`
- `mid`
- `spread`
- `timestamp`
- `age_seconds`
- `source`
- `source_label`
- `is_broker_quote`
- `is_tradeable`

Expected provenance for each exported item:

```json
{
  "source": "MT5_RELAY",
  "source_label": "MT5 LIVE",
  "is_broker_quote": true,
  "is_tradeable": true
}
```

Here `is_tradeable` is quote provenance required by the relay contract; it
does not authorize a transaction.

Verify these invariants for each item:

- `symbol` is the intended canonical symbol;
- `broker_symbol` exactly matches the Market Watch instrument;
- `bid > 0`, `ask > 0`, and `ask >= bid`;
- `mid` equals `(bid + ask) / 2` within normal numeric precision;
- `spread` equals `ask - bid` in price units;
- `timestamp` is Unix epoch seconds from the broker tick;
- the file and tick timestamps update repeatedly while ticks arrive.

The current receiver accepts quotes up to 10 seconds old and permits no more
than 2 seconds of future clock skew. Inspect the file at least twice, several
seconds apart. A timestamp that does not advance must become stale and must not
remain accepted as MT5 LIVE.

## 6. Failure detection

Stop and record failure if any of these occurs:

- no output file after several export intervals;
- an empty file, invalid JSON, truncated JSON, or visible temporary-file data;
- a stale or future timestamp;
- missing canonical symbols that should have active broker ticks;
- zero, negative, non-finite, or crossed bid/ask values;
- incorrect midpoint or spread;
- `broker_symbol` does not equal the selected Market Watch instrument;
- the required Market Watch symbol is absent or not selected;
- a broker prefix/suffix maps incorrectly or maps to multiple instruments;
- `source`, label, or boolean provenance differs from the contract;
- Experts/Journal reports temp-file, write, or atomic replacement errors.

A missing symbol is safer than a fabricated quote. Do not change the JSON by
hand to force acceptance.

## 7. Start the local backend

From the repository root, in a separate terminal, run exactly:

```bash
FEF_QUOTE_RELAY_SECRET='phase-4g-local-only-not-production' python3 -m backend.server 8000
```

Do not supply a trading authentication token. Confirm startup reports
`http://localhost:8000`. Keep the demo EA's socket input on the unused port so
this verification exercises quote export only.

## 8. Publish once from the real MT5 file

While the EA is producing fresh ticks, replace the source placeholder with the
absolute Common Files path and run:

```bash
FEF_QUOTE_RELAY_SECRET='phase-4g-local-only-not-production' \
FEF_QUOTE_RELAY_URL='http://localhost:8000/api/relay/quotes' \
FEF_QUOTE_SOURCE_FILE='<absolute path to fef_mt5_quote_snapshot.json>' \
python3 scripts/quote_relay_publisher.py --once
```

Expected publisher output contains one `Published quote for <symbol> (HTTP
202)` line per valid fresh item and exits successfully. It must not print the
relay secret. A stale, malformed, or invalid item must be rejected rather than
relabeled or sent as live.

## 9. Check relay and status immediately

The in-memory cache expires quotes after 10 seconds, so run these immediately
after the publisher succeeds:

```bash
curl -s http://localhost:8000/api/relay/quotes | python3 -m json.tool
curl -s http://localhost:8000/api/status | python3 -m json.tool
```

The minimum pass result is that XAUUSD appears in the relay response and in
`instruments.XAUUSD` from status with:

```text
source = MT5_RELAY
source_label = MT5 LIVE
is_broker_quote = true
is_tradeable = true
```

Also compare the relayed bid, ask, broker symbol, and timestamp to the source
file. After more than 10 seconds without another submission, confirm the relay
does not continue returning the snapshot as fresh.

## Manual verification checklist

- [ ] Dedicated demo MT5 account visibly confirmed; no real credentials present.
- [ ] Algorithmic trading disabled; EA trading permission unchecked.
- [ ] Common Files contains no pending-order command before attachment.
- [ ] Active repository EA copied to `MQL5\Experts` and opened in MetaEditor.
- [ ] F7 compile result is 0 errors and 0 warnings; `.ex5` exists.
- [ ] XAUUSD demo chart used and EA command socket points to an unused port.
- [ ] All five canonical symbols are shown in Market Watch where offered.
- [ ] Exact broker suffix/prefix mappings recorded and applied explicitly.
- [ ] `fef_mt5_quote_snapshot.json` exists and is complete JSON.
- [ ] Bid, ask, midpoint, spread, broker symbol, and timestamp match MT5.
- [ ] File/tick timestamps advance and stale data is not accepted.
- [ ] Publisher reads the absolute real MT5 file and reports HTTP 202.
- [ ] Relay GET shows MT5_RELAY / MT5 LIVE provenance.
- [ ] Status GET shows broker/tradeable booleans as true for XAUUSD.
- [ ] No order or position mutation occurred.
- [ ] Evidence package below is captured with all secrets redacted.

## Evidence to return after testing

Copy back:

1. MetaEditor compile output showing error/warning counts.
2. Screenshot of the MetaEditor Errors tab and recorded terminal/editor builds.
3. Screenshot of the demo indicator and Market Watch symbol names/prices, with
   account identifiers redacted.
4. EA Inputs screenshot showing quote mappings, freshness interval, and unused
   socket port; redact anything unrelated.
5. Experts/Journal lines for initialization and any quote-export error.
6. Two complete JSON snapshots or timestamped excerpts taken several seconds
   apart. Quote files contain no relay secret, but review them before sharing.
7. Publisher output and exit code, with secrets redacted.
8. Relevant excerpts from both curl responses showing symbol, broker symbol,
   bid/ask, timestamp, age, source, label, and both boolean flags.
9. The resolved Common Files path and host clock/timezone information.
10. Confirmation that no trade action was attempted and no position changed.

Do not return passwords, account numbers, access tokens, relay secrets, or
screenshots containing them.

## Final approval statement

Phase 4G remains pending until the evidence is reviewed. Even a clean compile,
fresh quote file, successful publisher response, and correct relay provenance
do not approve real-money execution or live-account testing.
