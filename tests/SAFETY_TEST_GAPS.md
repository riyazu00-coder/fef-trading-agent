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

The Python characterization test proves that one logical order is currently
written to the Common Files path and retained in the TCP queue. A Python-only
test cannot prove whether a compiled EA processes both deliveries as two broker
orders.

An isolated demo-terminal test must attach the production EA, submit a uniquely
identified command, exercise both delivery paths in one polling interval, and
verify from MT5 order/deal history that no more than one order is created.

## Requested-symbol execution

Automated tests verify that Python preserves the requested symbol in its file
and TCP payloads. A static source characterization also records that the current
EA selects `_Symbol` for `trade.Buy` and `trade.Sell`.

Demo-terminal verification is still required with the EA attached to a chart
whose symbol differs from the requested payload. Tests must cover broker suffix
and prefix variants and must confirm the actual broker deal symbol.

## Position-management scope

No automated MQL5 harness currently verifies close-all or break-even behavior by
symbol and magic number. A demo account must contain controlled FEF positions,
manual positions, and positions owned by another EA. Close and modification
commands must demonstrate that unrelated positions remain untouched.

## Broker acknowledgements

Python currently characterizes dispatch and paper-mirror responses, but there is
no end-to-end acknowledgement contract carrying an MT5 return code, order/deal
identifier, executed symbol, volume, and fill price back to the API and UI.
Timeout, rejection, partial-fill, disconnect, retry, and late-acknowledgement
tests require that contract to be designed and approved first.

## Safety boundary

All manual bridge verification must use a dedicated demo MT5 account with the
smallest permitted volume and no unrelated live-account credentials. No
real-money or live-account testing is permitted until every safety gate passes
and explicit approval is recorded.
