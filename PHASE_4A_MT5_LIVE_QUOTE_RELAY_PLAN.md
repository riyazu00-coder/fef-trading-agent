# Phase 4A: MT5 Live Quote Relay Plan

## Status and safety boundary

FEF Trading Agent remains a prototype and is not approved for real-money or
live-account execution. Phase 4A defines a quote-only relay architecture and a
tests-first validation contract. It does not add a relay endpoint, publish any
service, alter the MT5 bridge, or dispatch trade commands.

A fresh quote produced by the user's MT5 broker terminal is the only source
that may be identified as `MT5 LIVE`, `is_broker_quote=true`, and
`is_tradeable=true`. Yahoo and static reference prices remain display-only,
non-broker, and non-tradeable.

## Intended architecture

```text
Broker -> MT5 terminal -> FEF Bridge EA -> local QuoteStore/relay
                                             |
                                             | authenticated quote-only channel
                                             v
                              cloud quote cache/read-only API
                                             |
                                             v
                                  public FEF dashboard
```

Execution and quote publication must remain separate capabilities. The future
relay process must be unable to create, modify, or close orders, and its secret
must not authorize any trading endpoint.

## Local-only development mode

1. MT5 and the FEF Bridge EA run on the developer machine or its Wine prefix.
2. The EA writes quotes to the existing Common Files location or sends them to
   the local Python listener.
3. Python normalizes the broker symbol to an approved canonical symbol.
4. The dashboard reads the local `/api/status` response.
5. All listeners bind to `127.0.0.1`; no router forwarding, tunnel, or public
   listener is enabled for quote ingestion.
6. The same schema, timestamp, and authentication validation planned for the
   production relay is exercised locally.

Local development may use a dedicated test secret, but authentication must not
be disabled. Tests use injected environment values rather than embedded secrets.

## Windows VPS production-style mode

The recommended host is an always-on Windows VPS or equivalent machine with:

- the broker's MT5 terminal running continuously;
- the approved FEF Bridge EA attached to the required symbols;
- a local Python quote publisher reading only MT5 quote data;
- accurate system time synchronized with NTP;
- outbound HTTPS access to the selected cloud ingest endpoint;
- inbound firewall rules denying public access to local MT5/file/TCP services;
- separate credentials for quote relay and any future execution bridge.

The Python publisher should normalize, validate, and batch the most recent quote
for each configured instrument. It should send snapshots outbound over HTTPS and
retain no authority to dispatch trades.

## Why Vercel cannot read local MT5 directly

Vercel functions run on remote, ephemeral infrastructure. They cannot see a
user's Windows/Wine filesystem, MT5 Common Files directory, or `localhost` TCP
listener. Their in-memory state is not a durable cross-instance quote cache, and
they cannot depend on a permanent connection to a user's private network.

Therefore the public deployment needs either an authenticated outbound push to
a shared cloud cache or a separately hosted HTTPS service reachable from the
dashboard backend. Local file paths and TCP ports must never be assumed to exist
inside Vercel.

## Relay quote contract

Every submitted snapshot must contain:

- `symbol`: approved FEF canonical symbol, such as `XAUUSD`;
- `broker_symbol`: exact MT5 symbol, including any broker suffix or prefix;
- `bid` and `ask`: positive broker prices with `ask >= bid`;
- `mid`: `(bid + ask) / 2` within numeric rounding tolerance;
- `spread`: `ask - bid`, expressed in price units;
- `timestamp`: UTC Unix timestamp assigned at the quote source;
- `age_seconds`: source-observed age for diagnostics; the receiver recomputes it;
- `source`: exactly `MT5_RELAY` for broker relay submissions;
- `source_label`: exactly `MT5 LIVE`;
- `is_broker_quote`: exactly `true`;
- `is_tradeable`: exactly `true`.

The receiver must reject missing fields, unsupported canonical symbols, missing
broker symbols, invalid numbers, crossed quotes, inconsistent mid/spread values,
future timestamps beyond permitted clock skew, and stale snapshots.

## Freshness rules

- The initial maximum accepted source age is 10 seconds.
- The receiver calculates age from its own clock and the source timestamp; it
  does not trust submitted `age_seconds` for acceptance.
- A timestamp more than 2 seconds in the future is rejected.
- Accepted snapshots expire from the cloud cache; expired entries cannot retain
  `LIVE` or broker/tradeable status.
- When no fresh MT5 snapshot exists, the display may use Yahoo as
  `EXTERNAL REFERENCE · DELAYED · NON-BROKER`, then static data as
  `FALLBACK · NON-BROKER`, or show `PRICE UNAVAILABLE`.
- Production hosts must use NTP and monitor clock drift.

The exact cache expiry should be load-tested before deployment. It must never be
longer than the freshness window used to assign broker/live status.

## Authentication model

Use a dedicated high-entropy `FEF_QUOTE_RELAY_SECRET`, supplied through the VPS
and cloud secret managers. Do not reuse `FEF_BRIDGE_SECRET`, browser credentials,
or execution tokens.

The initial contract requires an HTTPS `Authorization: Bearer ...` header and
constant-time comparison. Missing, malformed, empty, or incorrect credentials
are rejected before payload parsing or storage. The public read-only dashboard
must never receive the ingest secret.

Before production, add:

- secret rotation and revocation;
- rate limiting and payload-size limits;
- request IDs and security audit logs without secrets or full headers;
- replay protection using a signed snapshot ID or monotonic sequence number;
- restricted ingress where the hosting platform supports it;
- alerting for repeated authentication and freshness failures.

TLS certificate verification must remain enabled. No endpoint may accept quote
updates over plain HTTP on a public network.

## Relay direction options

### A. Dashboard pulls from the VPS backend

The VPS exposes a read-only HTTPS quote endpoint and the dashboard backend polls
it. This is simple, but it requires a public VPS service, certificate management,
firewall hardening, availability monitoring, and careful separation from all
execution routes. Browser clients should not call the VPS directly.

### B. VPS pushes snapshots to a cloud endpoint — recommended baseline

The VPS makes outbound authenticated HTTPS submissions to a quote-only cloud
ingest endpoint. The endpoint validates and writes the latest snapshot to a
shared expiring cache; the dashboard reads it through a public read-only API.

This avoids exposing the VPS or MT5 listener inbound and works through typical
NAT/firewall configurations. It requires a suitable shared cache because Vercel
function memory is not durable or consistent across instances.

### C. WebSocket relay later

A persistent service could accept an authenticated outbound WebSocket from the
VPS and fan out updates. This can reduce latency but adds connection lifecycle,
reconnect, ordering, replay, backpressure, and hosting complexity. It should be
considered only after the HTTPS snapshot path is tested and monitored.

Vercel serverless functions should not be assumed to host a permanent socket.

## Risks and mitigations

| Risk | Required mitigation |
| --- | --- |
| Quote injection | Dedicated secret, constant-time validation, TLS, rate limits |
| Stale quote shown as live | Receiver-computed age and expiring cloud record |
| Replay of an old valid snapshot | Timestamp rejection, then signed sequence IDs before production |
| Broker-symbol ambiguity | Explicit canonical-to-broker mapping and exact `broker_symbol` metadata |
| Yahoo/static data promoted to live | Source allowlist plus mandatory broker/tradeable invariants |
| VPS compromise | Least privilege; quote publisher has no execution capability |
| Credential leakage | Secret managers, rotation, redacted logs, no browser exposure |
| Vercel instance inconsistency | Shared TTL-backed store rather than process memory |
| Clock drift | NTP monitoring and future-timestamp rejection |
| Relay outage | Honest downgrade to external/fallback/unavailable labels |

## Tests-first foundation

`backend/data/quote_relay.py` currently provides validation only. It has no HTTP
handler or side effects. Automated tests establish:

- the exact relay schema;
- rejection of stale snapshots;
- rejection of missing and incorrect Bearer credentials;
- acceptance of a valid dedicated relay credential;
- rejection when a non-MT5 source claims live broker status;
- continued non-broker/non-tradeable status for external references.

Future endpoint tests must prove authentication occurs before mutation, expired
records disappear, replayed sequence IDs are rejected, concurrent symbol updates
remain isolated, and the public read endpoint cannot modify relay state.

## Deployment checklist

- [ ] Use a dedicated demo MT5 account and isolated VPS.
- [ ] Install the approved MT5 terminal and exact reviewed EA build.
- [ ] Configure explicit canonical/broker symbol mappings.
- [ ] Synchronize VPS and cloud clocks with monitored NTP.
- [ ] Generate distinct high-entropy quote-relay and execution secrets.
- [ ] Store secrets only in platform/VPS secret storage.
- [ ] Bind local MT5/Python listeners to loopback.
- [ ] Deny public inbound access to MT5, Common Files, and local TCP ports.
- [ ] Deploy an HTTPS quote-only ingest endpoint with payload and rate limits.
- [ ] Use a shared expiring cloud cache; do not rely on Vercel memory.
- [ ] Deploy a public read-only snapshot endpoint.
- [ ] Verify stale data downgrades immediately and cannot remain `LIVE`.
- [ ] Verify logs contain no tokens, account credentials, or sensitive headers.
- [ ] Configure monitoring for relay age, failures, authentication errors, and gaps.
- [ ] Complete a security review before any public deployment.

## Manual MT5 verification checklist

All checks must use a dedicated demo account:

- [ ] Confirm the EA reports the exact broker symbol, bid, ask, and source time.
- [ ] Compare relay bid/ask with the visible MT5 Market Watch values.
- [ ] Verify symbol suffixes/prefixes for every configured instrument.
- [ ] Stop the EA and confirm the quote loses `MT5 LIVE` status within 10 seconds.
- [ ] Pause networking and confirm honest external/fallback/unavailable downgrade.
- [ ] Submit missing, malformed, and wrong credentials and confirm no state change.
- [ ] Replay an expired snapshot and confirm rejection.
- [ ] Send a future-dated snapshot and confirm rejection.
- [ ] Attempt to label Yahoo/static data as live and confirm rejection.
- [ ] Restart MT5, the publisher, and the cloud service and verify safe recovery.
- [ ] Confirm the relay cannot call or authorize any trading mutation endpoint.
- [ ] Confirm no order is created during any quote-relay test.

## Phase 4B local foundation status

Phase 4B adds a process-local, thread-safe quote cache and two local backend
routes:

- authenticated `POST /api/relay/quotes` validates and stores one quote;
- public read-only `GET /api/relay/quotes` returns only fresh snapshots.

Expired snapshots are removed and reported as stale. `MarketFeed` prefers a
fresh authenticated relay snapshot, then preserves the existing local
QuoteStore, Yahoo, and static-fallback priority. The quote-relay secret remains
separate from the execution secret and cannot authorize trading routes.

This cache is a local foundation only. It is not suitable as a shared Vercel
cache because serverless instances do not share reliable process memory.

## Explicitly deferred work

Phase 4B does not implement a shared cloud cache, Vercel ingest route, VPS
publisher, WebSocket, MQL5 quote publisher changes, frontend redesign, execution
integration, or deployment. Those changes require separate review and approval.

No real-money/live-account execution is approved. Phase 4A is a quote-relay
plan and validation foundation only.
