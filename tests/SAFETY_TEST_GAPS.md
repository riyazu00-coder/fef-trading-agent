# Safety Test Gaps

This file records safety requirements that cannot yet be fully enforced by the
automated test suite without an approved production refactor or an isolated MT5
demo environment.

## Feed provenance labels

Every feed and derived value shown to a user must eventually expose exactly one
of these provenance states:

- `LIVE`
- `EXTERNAL REFERENCE`
- `DELAYED`
- `FALLBACK`
- `SIMULATED`
- `TRADINGVIEW EXTERNAL`
- `PRICE UNAVAILABLE`

Phase 3A adds deterministic provenance for market quotes and derived price
fields. Phase 3C queries Yahoo's keyless chart JSON endpoint with a bounded
timeout and labels successful results `EXTERNAL REFERENCE · DELAYED · NON-BROKER`;
static references are `FALLBACK · NON-BROKER`, and manufactured spreads,
high/low, change figures, indicators, levels, and AI candles are `SIMULATED`.
The TradingView iframe is explicitly separate and labeled `TRADINGVIEW EXTERNAL`.

Vercel cannot access a user's local MT5 terminal directly. A public hosted
deployment still needs either a licensed quote provider or a secured local quote
relay. Yahoo `GC=F` and `CL=F` are futures proxies and do not equal broker
XAUUSD/USOIL spot or CFD quotes. The iframe cannot supply prices to the backend,
and broker execution prices must continue to come only from MT5 acknowledgement.
Deployment verification must also confirm Yahoo endpoint availability, response
shape, rate limits, and acceptable data age from each Vercel region. Provider
failure must continue to expose the static value as `FALLBACK · NON-BROKER`.

Future tests must still cover Frankfurter rates, macro values, EIA data,
sentiment, calendar events, account statistics, and performance metrics. They
must verify provenance and freshness transitions after timeout or fetch failure.

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

## Authentication and deployment

The local backend and Vercel handler now use the same fail-closed Bearer-token
verification for every trading-state mutation. Automated tests cover missing,
malformed, incorrect, and valid credentials without connecting to MT5 or the
internet. No built-in secret remains, and the frontend neither embeds nor reads
an execution token from local storage.

Deployment verification must confirm that a unique, high-entropy
`FEF_BRIDGE_SECRET` is configured independently in each authorized environment,
is absent from built frontend assets and logs, and is rotated after any suspected
exposure. The browser currently requires a trusted wrapper to inject an
ephemeral `window.FEF_BRIDGE_TOKEN`; without one, mutating actions fail closed.
Before public deployment, replace that temporary delivery mechanism with a
server-managed authenticated session and verify HTTPS, CORS policy, proxy/header
forwarding, rate limits, audit logging, token rotation/revocation, and that Vercel
and the local tunnel reject credentials from each other's unintended environments.

## Safety boundary

All manual bridge verification must use a dedicated demo MT5 account with the
smallest permitted volume and no unrelated live-account credentials. No
real-money or live-account testing is permitted until every safety gate passes
and explicit approval is recorded.

## Quote relay deployment

Phase 4B provides only an authenticated local submission endpoint and an
in-memory read cache. Automated tests cover authentication, freshness, source
validation, expiry, market-feed priority, read-only behavior, and separation
from execution calls.

Production work still requires a quote-only VPS publisher, HTTPS deployment, a
shared TTL-backed cloud cache, replay/sequence protection, rate limits, secret
rotation, monitoring, and a Vercel-compatible read path. Demo-MT5 verification
must compare relayed values with Market Watch and prove stale/offline transitions
without creating or modifying any order.
