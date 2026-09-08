# Phase 4F: Local Quote Relay Dry Run

## Purpose and safety boundary

This workflow verifies the quote-only path:

```text
examples/mt5_quote_snapshot.multi.json
  -> refreshed temporary fixture
  -> scripts/quote_relay_publisher.py
  -> POST /api/relay/quotes
  -> GET /api/relay/quotes
  -> GET /api/status
```

It does not send orders, invoke trading-state mutation routes, use a trading
authentication token, or connect to a broker account. It uses only the
dedicated `FEF_QUOTE_RELAY_SECRET`. This local dry run is not approval for
real-money execution.

## Prerequisites

- Run commands from the repository root.
- Use two local terminal windows.
- Choose a temporary, non-production development secret and use the same value
  in both terminals. Do not commit it, store it in the fixture, or paste it into
  logs.
- Ensure ports 8000 and 5555 are available. Starting the existing backend also
  starts its existing local MT5 listener; the dry-run helper never sends it a
  command.

## Terminal 1: start the local backend

Replace the placeholder with a temporary local secret:

```bash
FEF_QUOTE_RELAY_SECRET='<temporary-local-secret>' python3 -m backend.server 8000
```

Expected startup includes:

```text
FEF TRADING AGENT Server running at http://localhost:8000
```

## Terminal 2: run the dry run

Use the same temporary secret:

```bash
FEF_QUOTE_RELAY_SECRET='<temporary-local-secret>' python3 scripts/run_quote_relay_dry_run.py
```

The helper defaults to:

- relay: `http://127.0.0.1:8000/api/relay/quotes`;
- fixture: `examples/mt5_quote_snapshot.multi.json`.

It copies the fixture into a temporary directory and replaces `timestamp` and
`age_seconds` with fresh values. The checked-in deterministic fixture is never
modified. The existing Phase 4C publisher then validates and submits all five
quotes. Finally, unauthenticated read-only GET requests verify the relay cache
and `/api/status` provenance.

Expected final output:

```text
Phase 4F quote-only dry run PASSED: 5 quotes submitted; XAUUSD is MT5_RELAY / MT5 LIVE in relay and status
```

Individual `Published quote for ... (HTTP 202)` messages appear before the
summary. The relay secret must never appear.

## Optional local overrides

Only loopback relay URLs are accepted by this Phase 4F helper:

```bash
FEF_QUOTE_RELAY_SECRET='<temporary-local-secret>' \
FEF_QUOTE_RELAY_URL='http://localhost:8000/api/relay/quotes' \
FEF_QUOTE_SOURCE_FILE='examples/mt5_quote_snapshot.multi.json' \
python3 scripts/run_quote_relay_dry_run.py
```

The source may later be changed to the absolute MT5 Common Files path for
`fef_mt5_quote_snapshot.json`, but only during an approved demo-MT5 check.

## Successful verification criteria

At least one supported symbol must appear in both read responses with:

```json
{
  "source": "MT5_RELAY",
  "source_label": "MT5 LIVE",
  "is_broker_quote": true,
  "is_tradeable": true
}
```

All five fixture quotes should normally be accepted. `is_tradeable` is quote
provenance metadata only; it does not authorize or dispatch a trade.

## Common failures

- **Backend not running:** the helper reports `backend unavailable` or an
  incomplete publication and exits nonzero. Start Terminal 1 first.
- **Missing relay secret:** configuration fails closed. Set the same temporary
  `FEF_QUOTE_RELAY_SECRET` for the backend and helper.
- **Wrong relay secret:** submissions receive HTTP 401 and the run fails.
- **Stale timestamp:** use the helper rather than invoking the publisher
  directly on the checked-in fixture; the helper creates a fresh temporary copy.
- **Wrong source path:** verify `FEF_QUOTE_SOURCE_FILE` from the repository root.
- **Port already occupied:** stop the unrelated local service or explicitly
  choose an approved local port consistently in both terminals.
- **Relay/status mismatch:** confirm the backend process is running this branch
  and no second process owns port 8000.

## Limitations

This workflow uses fixture values, not current broker ticks. It does not verify
MetaEditor compilation, the EA's Common Files output, broker symbol mapping,
VPS deployment, shared cloud persistence, or public website delivery. Those
remain separate demo/deployment verification gates. No real-money execution is
approved.
