# Phase 4D: MT5 Quote Export Plan

## Scope and safety boundary

Phase 4D defines the file contract between a future MT5 quote exporter and the
existing quote-only publisher. It does not implement the EA exporter, alter the
MQL5 bridge, dispatch a trade, or authorize any execution operation.

**This project is not approved for real-money execution. Quote export is for
market-data relay only, not trade execution.** Initial integration and
verification must use a demo MT5 account.

The exporter and publisher must remain separate from order sending, close-all,
break-even, and all other position-management paths. The dedicated quote relay
secret authenticates quote submission only and must never authorize trading.

## Canonical quote contract

Each exported quote must contain every field below. Names and trusted values
match `backend/data/quote_relay.py`.

| Field | Format | Requirement |
| --- | --- | --- |
| `symbol` | string | FEF canonical symbol: `XAUUSD`, `USOIL`, `EURUSD`, `GBPUSD`, or `USDJPY` |
| `broker_symbol` | string | Exact symbol selected in MT5, including broker prefix/suffix |
| `bid` | positive number | Latest MT5 tick bid |
| `ask` | positive number | Latest MT5 tick ask; must be greater than or equal to bid |
| `mid` | positive number | Exactly `(bid + ask) / 2` within validator tolerance |
| `spread` | non-negative number | Exactly `ask - bid` in price units |
| `timestamp` | positive number | Unix epoch seconds for the observed MT5 tick |
| `age_seconds` | non-negative number | Age calculated when exported; the relay recalculates it |
| `source` | string | Must be `MT5_RELAY` |
| `source_label` | string | Must be `MT5 LIVE` |
| `is_broker_quote` | boolean | Must be `true` |
| `is_tradeable` | boolean | Must be `true` for a validated, fresh MT5 broker quote |

`is_tradeable: true` describes the provenance and freshness of the quote. It
does not grant trading authority, invoke an execution endpoint, or indicate
that an order has been sent or accepted.

### Single-symbol format

The source file may contain one quote object:

```json
{
  "symbol": "XAUUSD",
  "broker_symbol": "XAUUSD.a",
  "bid": 4413.2,
  "ask": 4413.4,
  "mid": 4413.3,
  "spread": 0.2,
  "timestamp": 2000000000.0,
  "age_seconds": 0.0,
  "source": "MT5_RELAY",
  "source_label": "MT5 LIVE",
  "is_broker_quote": true,
  "is_tradeable": true
}
```

See `examples/mt5_quote_snapshot.single.json` for a machine-readable example.

### Multi-symbol format

For normal operation, use a top-level `quotes` list containing one independent
quote per canonical symbol:

```json
{
  "quotes": [
    { "symbol": "XAUUSD", "broker_symbol": "XAUUSD.a", "bid": 4413.2,
      "ask": 4413.4, "mid": 4413.3, "spread": 0.2,
      "timestamp": 2000000000.0, "age_seconds": 0.0,
      "source": "MT5_RELAY", "source_label": "MT5 LIVE",
      "is_broker_quote": true, "is_tradeable": true }
  ]
}
```

See `examples/mt5_quote_snapshot.multi.json` for all five supported symbols.
The publisher also accepts a raw list or a map keyed by canonical symbol, but
the `quotes` wrapper is the recommended stable export format.

## File location and publisher handoff

Implemented relay-export filename: `fef_mt5_quote_snapshot.json` under the MT5
Common Files directory. The EA resolves that directory through `FILE_COMMON`;
the corresponding host path can be located with
`TerminalInfoString(TERMINAL_COMMONDATA_PATH)`. The EA must not embed a
machine-specific absolute path.

The existing `fef_live_quotes.json` single-chart telemetry file remains in
place for local `QuoteStore` compatibility. The new relay snapshot is separate,
contains the complete multi-symbol contract, and is the file that should be
assigned to `FEF_QUOTE_SOURCE_FILE`.

On the Windows/VPS host, determine the resulting absolute path and set:

```powershell
$env:FEF_QUOTE_SOURCE_FILE = "<MT5 common data path>\Files\fef_mt5_quote_snapshot.json"
$env:FEF_QUOTE_RELAY_URL = "https://<relay-host>/api/relay/quotes"
$env:FEF_QUOTE_RELAY_SECRET = "<dedicated quote-only secret>"
$env:FEF_QUOTE_PUBLISH_INTERVAL_SECONDS = "2"
python scripts\quote_relay_publisher.py
```

The Phase 4C publisher reads either format, normalizes the quote, validates it
against the relay contract, and posts each valid snapshot only to
`/api/relay/quotes`. Missing configuration, malformed JSON, invalid or stale
quotes, and network failures fail closed. Secrets must be supplied through the
service environment and must not appear in the JSON file or logs.

## Future EA write procedure

The future MQL5 exporter should run on its own timer and must have no dependency
on order-command handling:

1. Resolve the configured broker symbol for each canonical symbol.
2. Ensure the symbol is selected and available in Market Watch.
3. Read one coherent tick (`bid`, `ask`, and tick timestamp) from MT5.
4. Reject absent, zero, non-finite, crossed, or stale tick values.
5. Calculate `mid` and `spread` from that same tick.
6. Serialize the complete snapshot to `fef_mt5_quote_snapshot.json.tmp` in the
   same Common Files directory.
7. Flush and close the temporary file.
8. Replace the final JSON file with the completed temporary file using the
   safest same-directory replace operation supported by the deployed MT5
   build. Confirm its replacement semantics on the demo VPS first.

The EA must never write partial JSON directly to the final filename. A future
implementation should retain the last complete file if collection or
serialization fails. The publisher safely rejects malformed or incomplete
files during any replacement race.

## Symbol routing and Market Watch

Canonical symbols must be mapped explicitly to broker symbols. Broker naming
varies, so the exporter must not guess by blindly removing prefixes or suffixes.
A future EA configuration should provide an explicit mapping such as:

| Canonical symbol | Example broker symbol only |
| --- | --- |
| `XAUUSD` | `XAUUSD.a` |
| `USOIL` | `USOIL.cash` |
| `EURUSD` | `EURUSD.a` |
| `GBPUSD` | `GBPUSD.a` |
| `USDJPY` | `USDJPY.a` |

These examples are not defaults. During setup, an operator must identify each
exact broker symbol, call `SymbolSelect(broker_symbol, true)` if it is not
already selected, and confirm `SymbolInfoTick` succeeds. Failure for one symbol
must omit/reject that quote; it must not substitute the EA chart symbol or a
different instrument.

## Freshness and clock handling

The current relay freshness window defaults to 10 seconds. The receiver
recalculates `age_seconds` from `timestamp`; it does not trust the value claimed
by the file. A quote older than the configured window is rejected, and an
expired cached quote is removed. Timestamps more than the permitted future
clock skew are also rejected.

The MT5 host and relay host should use monitored NTP time synchronization.
Pauses, closed markets, disconnected terminals, missing ticks, and clock drift
must produce a stale/empty relay state—not a fabricated live price. Yahoo or
static references may still be displayed by the existing fallback path, but
they remain non-broker and non-tradeable.

## Windows VPS setup notes

- Run MT5 and the publisher under a dedicated, least-privilege service account.
- Use a demo terminal while implementing and validating the exporter.
- Keep the quote file and relay secret readable only by that account.
- Use HTTPS for every non-loopback relay destination.
- Allow outbound relay traffic only; do not expose MT5, Common Files, or a
  local listener publicly.
- Configure process supervision for the publisher and alert on repeated
  malformed, stale, or failed submissions.
- Confirm the publisher starts after its source path is mounted and available.
- Rotate the dedicated quote secret without reusing any execution credential.

## Manual demo-MT5 verification checklist

- [ ] Confirm the exact broker symbol for all five canonical instruments.
- [ ] Confirm each broker symbol is present/selectable in Market Watch.
- [ ] Compare exported bid and ask with the same MT5 Market Watch tick.
- [ ] Confirm mid and spread are derived from that tick without rounding drift.
- [ ] Confirm the exported timestamp represents the tick time in Unix seconds.
- [ ] Confirm the final file is always complete JSON during repeated updates.
- [ ] Stop ticks or disconnect MT5 and confirm the relay rejects/expires stale data.
- [ ] Deliberately use a wrong broker symbol and confirm no chart-symbol fallback.
- [ ] Confirm a multi-symbol failure does not relabel another symbol's quote.
- [ ] Confirm the publisher submits only to `/api/relay/quotes` over HTTPS.
- [ ] Confirm missing/wrong quote-relay authentication is rejected.
- [ ] Confirm no order, close-all, break-even, or execution path is invoked.
- [ ] Confirm dashboard fallback remains clearly non-broker when relay data expires.

## Approval gate

No MQL5 quote exporter should be implemented until this contract and the exact
broker-symbol mappings are reviewed and approved. Any later MQL5 change must be
isolated from execution code, reviewed independently, and verified on demo MT5.
Passing quote-export tests does not approve real-money execution.

## Phase 4E implementation status

The active `mql5/FEF_TradingAgentsBridge.mq5` now contains the isolated
quote-only exporter described here. It preserves the legacy telemetry writer,
collects fresh ticks independently for the five canonical symbols, skips
unavailable or ambiguous instruments, and moves a flushed UTF-8 temporary file
over `fef_mt5_quote_snapshot.json` with `FILE_REWRITE`.

Python source tests verify the contract text and separation from trading code,
but they cannot compile or run MQL5. MetaEditor compilation and every item in
the demo-MT5 checklist remain mandatory before deployment. This status does not
approve real-money execution.
