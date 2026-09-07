# Safety Test Gaps

This file records safety requirements that cannot yet be fully enforced by the
automated test suite without an approved production refactor or an isolated MT5
demo environment.

## Feed provenance labels

Every feed and derived value shown to a user must eventually expose exactly one
of these provenance states:

- `LIVE`
- `DELAYED`
- `FALLBACK`
- `SIMULATED`

Automated enforcement is currently blocked because the backend uses values such
as `LIVE_CONNECTED`, `INITIALIZED_FALLBACK`, and `CACHED_OFFLINE`, while several
derived values have no provenance field at all. Some fixed FRED, EIA, crowd
sentiment, technical-analysis, calendar, and performance values can also be
reported with live-sounding labels.

Future tests must cover MT5 quotes, yfinance prices, Frankfurter rates, macro
values, EIA data, sentiment, calendar events, indicators, SMC candles, account
statistics, and performance metrics. They must verify both provenance and
freshness, including transitions after timeout or fetch failure. The frontend
must display the backend-provided state without upgrading or inferring it.

## Exactly-once MT5 execution

The Phase 2A Python baseline assigns a unique command ID and selects exactly one
delivery path: TCP after a recent EA poll, otherwise Common Files. Automated
tests verify that the same logical command is not both queued for TCP and written
to the pending-order file by the Python bridge.

The current MQL5 EA does not parse command IDs or enforce expiry, so Python-only
tests cannot provide broker-side deduplication against manually duplicated,
externally replayed, or stale Common Files commands. An isolated demo-terminal
test must attach the production EA, submit uniquely identified commands through
each selected transport, and verify from MT5 order/deal history that each
logical command creates no more than one order.

## Requested-symbol execution

Automated tests verify that Python includes the canonical `requested_symbol` in
its file and TCP payloads. Static source tests verify that the active EA parses,
validates, resolves, and passes the resolved execution symbol to `trade.Buy` or
`trade.Sell` instead of silently using `_Symbol`. The terminal log result records
both the requested and resolved execution symbols.

Demo-terminal verification is still required because Python does not yet receive
the structured MQL5 result as a broker acknowledgement. Verification must attach
the EA to a chart whose symbol differs from the request, cover exact symbols and
unique broker suffix/prefix variants, confirm safe rejection of unavailable and
ambiguous mappings, and compare the actual broker deal symbol with the terminal
result log.

## Position-management scope

Backend order and management payloads now carry the stable FEF magic number.
Close-all and break-even optionally carry a requested symbol and position ticket,
and the active EA checks position magic, resolved broker symbol, and ticket before
calling `PositionClose` or `PositionModify`. A missing/mismatched magic number or
malformed supplied ticket is rejected. Paper controls support matching symbol and
ticket filters while retaining their existing all-FEF default.

Static tests cannot prove terminal position ownership behavior. A demo account
must contain controlled FEF positions, manual positions with magic zero, and
positions owned by another EA. Tests must exercise magic-only, symbol, ticket,
combined, empty-match, invalid-symbol, invalid-ticket, and partial-failure cases
and confirm that unrelated positions remain untouched.

## Broker acknowledgements

The active EA now writes a command-specific structured acknowledgement carrying
the command ID, requested and execution symbols, action, volume, result price,
order/deal identifiers, MT5 return code, status, and error description. Python
validates the acknowledgement against pending command state and does not convert
dispatch into broker success. Paper execution remains explicitly separate.

Demo-terminal verification is still required for the exact files and encodings
produced by MetaTrader, market fills versus accepted orders, broker-specific
return codes, partial fills, rejection messages, simultaneous acknowledgement
files, terminal restarts, late acknowledgements, and permission failures. The
current frontend does not yet render asynchronous acknowledgement changes, and
that UI work remains outside Phase 2C.

## Safety boundary

All manual bridge verification must use a dedicated demo MT5 account with the
smallest permitted volume and no unrelated live-account credentials. No
real-money or live-account testing is permitted until every safety gate passes
and explicit approval is recorded.
