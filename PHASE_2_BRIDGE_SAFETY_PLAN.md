# Phase 2: MT5 Bridge Safety Implementation Plan

## Status and scope

This document defines the proposed Phase 2 work for the FEF TRADING AGENT MT5 bridge. It is an implementation plan only. It does not authorize code changes, MQL5 changes, test changes, deployment, or live-account use.

Phase 2 is limited to transport, routing, position scoping, broker acknowledgement, and bridge configuration safety. Trading strategy, signal generation, lot-sizing policy, stop-loss/take-profit rules, the Risk Guardian, and frontend design are outside this phase except where an existing status must be represented accurately and compatibly.

## Safety objectives

Phase 2 must establish these invariants:

1. One logical command can create at most one broker-side action.
2. An order is executed only on its validated requested symbol.
3. Position-management commands cannot affect unrelated positions.
4. Dispatch is never reported as broker execution.
5. Every broker result is correlated to its originating command.
6. Local bridge transports are not publicly exposed.
7. Paper mode remains usable when MT5 is absent.

## 1. Duplicate delivery risk

### Current risk

Python writes the same command to the Common Files pending-order file and appends it to the TCP in-memory queue. The EA checks both transports. The same logical command may therefore arrive twice and create two broker orders.

### Proposed exactly-once design

Every mutating command should receive a cryptographically random `command_id` before it enters either transport. The canonical command envelope should include:

- `protocol_version`
- `command_id`
- `action`
- `created_at`
- `expires_at`
- `symbol`
- `magic_number`
- action-specific fields such as volume, SL, TP, or ticket
- optional authentication token/signature

Both transports may remain available for resilience, but they must carry the same `command_id`. The EA should maintain a bounded, persistent-enough record of recently processed command IDs and reject a repeated ID before any `CTrade` call. A duplicate should return the original outcome when available, or an explicit `DUPLICATE_IGNORED` acknowledgement.

The Python bridge should also track a command state machine:

`CREATED -> QUEUED -> DELIVERED -> ACKNOWLEDGED_SUCCESS | ACKNOWLEDGED_FAILED | EXPIRED`

Transport retry must resend the same command ID rather than create a new command. Commands must have an expiry time so stale files or delayed queue entries cannot execute later. File replacement should be atomic where supported, and a consumed command must not be silently recreated by routine polling.

### Preferred rollout

The safest initial rollout is to designate one primary command transport and use the other only as a failover after a defined timeout. Exactly-once deduplication is still mandatory because timeouts cannot prove that the first delivery was not processed.

No implementation should rely on deleting a file or popping a queue item as proof that the broker action occurred.

## 2. Requested symbol routing

### Current risk

The Python payload preserves the requested symbol, but the current MQL5 execution path selects `_Symbol`, the chart symbol hosting the EA. A valid order can therefore be routed to the wrong instrument.

### Proposed routing contract

The EA must parse the command's `symbol` field and treat it as the requested canonical symbol. Before execution it should:

1. Require the field for every order command.
2. Map the canonical symbol to a broker symbol using an explicit, configured mapping or a deterministic broker-symbol resolver.
3. Reject unknown or ambiguous mappings.
4. Confirm that the resolved symbol is selected and tradeable.
5. Read digits, point size, volume constraints, stops level, filling mode, bid, and ask from the resolved symbol—not `_Symbol`.
6. Validate SL, TP, and volume against that resolved symbol.
7. Pass the resolved symbol explicitly to `trade.Buy` or `trade.Sell`.
8. Return both `requested_symbol` and `executed_symbol` in the acknowledgement.

Chart-symbol fallback must not occur silently. If compatibility requires chart-only mode, it should be an explicit configuration that rejects a mismatched request rather than substituting `_Symbol`.

Broker prefixes and suffixes, such as `XAUUSDm`, must be handled by explicit mapping or an unambiguous normalization rule. A mapping collision must fail closed.

## 3. Magic number, symbol, and ticket scoping

### Scope rules

Position-management commands must carry an explicit scope. The default safe scope should be:

- the configured FEF magic number; and
- the requested/resolved symbol.

Where a specific broker position ticket is known, operations should additionally require and validate that ticket. The EA must confirm that the selected position's symbol and magic number match the command before modification or closure.

### Close-all

`ORDER_CLOSE_ALL` should no longer mean all positions in the account. Its bridge-safe meaning should be “close all positions matching the authorized scope.” The command should require `symbol` and `magic_number`, with optional explicit ticket IDs for even narrower control.

For every position, the EA should verify:

- position ticket is valid;
- `POSITION_SYMBOL` matches the resolved target symbol;
- `POSITION_MAGIC` matches the configured and commanded FEF magic number; and
- the command has not expired or already been processed.

The acknowledgement should list closed, failed, and skipped ticket IDs. Manual trades and positions owned by other EAs must be reported as skipped and remain unchanged.

### Break-even

`ORDER_BREAK_EVEN` should use the same symbol and magic-number checks. When a ticket is supplied, only that position may be modified after ownership validation.

The approved break-even convention must be defined precisely for BUY and SELL positions, including any pip buffer, symbol digits, tick size, minimum stop distance, and whether the position must first be in profit. This phase must preserve the currently approved trading/risk rule unless a separate risk-rule change is authorized.

## 4. Broker acknowledgement

### Required acknowledgement contract

Python and the UI must distinguish command dispatch from broker execution. An MT5 response should include at least:

- `protocol_version`
- `command_id`
- `status`
- `action`
- `requested_symbol`
- `executed_symbol`
- `magic_number`
- MT5 return code and description
- broker order ID, deal ID, and/or position ticket as applicable
- requested and confirmed volume
- requested and fill price where applicable
- server timestamp
- error details for failure

Suggested terminal statuses are:

- `ACKNOWLEDGED_SUCCESS`
- `ACKNOWLEDGED_FAILED`
- `DUPLICATE_IGNORED`
- `REJECTED_INVALID_COMMAND`
- `REJECTED_SYMBOL_MISMATCH`
- `EXPIRED`

### Reporting rules

- `QUEUED` means Python accepted the command locally.
- `DISPATCHED` means a transport delivered or exposed the command to the EA.
- `EXECUTED` or `FILLED` may be used only after a successful MT5 trade result contains a broker identifier and validated return code.
- A timeout must produce `UNKNOWN` or `TIMED_OUT`, not success.
- Paper execution must remain explicitly labeled `PAPER_EXECUTED` and must not be presented as evidence of an MT5 fill.

Python should correlate acknowledgements by `command_id`, ignore mismatched acknowledgements, and retain enough audit information to diagnose late, duplicate, rejected, and failed results.

## 5. Common Files path configuration

### Current risk

The Python Common Files directory is hardcoded to a machine- and Wine-user-specific macOS path. A path mismatch can silently disable telemetry or order delivery.

### Proposed configuration

Introduce a single documented configuration value such as `MT5_COMMON_FILES_DIR`. Resolution should follow this order:

1. Explicit environment/configuration value.
2. A validated platform-specific discovered path, if discovery can be deterministic and unambiguous.
3. File transport disabled with a prominent diagnostic if no valid directory is available.

The bridge must validate that the directory exists, is the expected MT5 Common Files directory, and has appropriate read/write access. It must not create arbitrary machine-specific parent directory trees after a typo. Startup status should state whether file transport is enabled and which validated directory is in use, without leaking unrelated filesystem information to public clients.

Documentation should provide separate examples for:

- Windows MT5 Common Files;
- native macOS installations if supported; and
- macOS Wine installations, noting that bundle name and Wine username vary.

MQL5 should continue using `FILE_COMMON`; only Python requires the resolved operating-system path.

## 6. TCP listener security

### Local-only default

The TCP bridge should bind to `127.0.0.1` by default. Binding to `0.0.0.0`, a LAN address, a tunnel, or a public interface must be disabled unless a separately reviewed deployment explicitly requires it.

The socket protocol should reject oversized, malformed, unsupported-version, expired, and unauthenticated messages before processing telemetry or returning commands. It should enforce bounded read sizes, timeouts, and one complete framed message per request.

### Optional local shared token

An optional shared local token or HMAC signature can protect against other local processes. If enabled:

- it must be supplied through private configuration, never hardcoded in frontend or repository files;
- comparison must be constant-time where supported;
- the token must cover command identity and payload integrity;
- failures must not reveal the valid credential; and
- rotation and startup diagnostics must be documented.

Loopback binding is still required even when a token is configured. The TCP listener must not be exposed through Vercel, reverse proxies, port forwarding, or public tunnels.

## 7. Backward compatibility

### Paper simulator

Paper mode must remain available with no MT5 terminal. It should continue to accept the existing order-ticket information while returning an explicitly paper-only status. Introducing `command_id` and transport state should not cause paper positions to be duplicated or depend on an MT5 acknowledgement.

The current paper mirror of a live dispatch must be reviewed carefully: it may remain as dashboard telemetry only if it is clearly separated from broker truth and correlated to the same command. It must not cause a failed MT5 order to appear as a live open position.

### Frontend and API compatibility

Existing response fields should be retained during a deprecation window where safe. New fields such as `command_id`, `transport_status`, `broker_status`, and `acknowledgement` can be additive.

The backend may translate the new internal state model into the current response shape temporarily, but it must not translate a queued or dispatched state into `EXECUTED`. If the current frontend cannot represent a truthful intermediate state, the implementation must stop at a reviewed compatibility boundary and request approval for the necessary UI change.

No route names, request payloads, paper-mode workflows, or frontend controls should be removed in Phase 2 without separate approval.

### Protocol versioning

Add an explicit bridge protocol version. During migration, Python and the EA should reject incompatible mutating commands safely rather than guessing payload semantics. The older `TradingAgentsBridge.mq5` must not be treated as compatible merely because it uses the same port.

## 8. Test strategy

Tests must be written before or alongside each implementation change. Automated tests must use mocks, temporary directories, protocol fixtures, or an isolated harness and must not require MT5, internet access, paid APIs, or a real broker account.

### Required automated tests

1. **One command creates one order**
   - A unique command ID produces one call to the broker execution adapter.
   - Retries reuse the command ID.
   - Replayed IDs do not call the broker again.

2. **Duplicate transport cannot double execute**
   - Deliver the same command over file and TCP in both orders.
   - Assert one execution and a deterministic duplicate acknowledgement.
   - Cover restarts, stale files, timeouts, and delayed acknowledgements.

3. **Requested symbol is preserved**
   - Assert the API ticket, Python envelope, transport payload, EA parser fixture, broker call, and acknowledgement contain the same canonical symbol.
   - Cover all five supported instruments and configured broker aliases.

4. **Wrong symbol is rejected**
   - Reject missing, unsupported, ambiguous, unavailable, non-tradeable, and chart-mismatched symbols.
   - Assert no broker call occurs and the acknowledgement identifies the reason.

5. **Close-all is scoped to target symbol and magic number**
   - Mix FEF, manual, and other-EA positions across symbols.
   - Assert only matching FEF positions are closed.
   - Verify per-ticket closed, failed, and skipped results.

6. **Break-even is scoped to target symbol and magic number**
   - Mix BUY/SELL, symbol, magic-number, profitable, losing, and broker-restricted positions.
   - Assert only eligible matching positions are modified to the approved price.

7. **Failed MT5 execution returns failed status**
   - Cover invalid volume/stops, market closed, insufficient margin, rejected filling mode, trade disabled, timeout, and malformed MT5 response.
   - Assert neither API nor compatibility layer reports `EXECUTED` or `FILLED`.

8. **Success requires ticket/order/deal acknowledgement**
   - A success status must contain a successful MT5 return code and at least one applicable broker identifier.
   - Mismatched command ID or symbol, empty identifiers, and dispatch-only responses must not pass.

### Additional protocol and configuration tests

- Command expiry and clock-boundary behavior.
- Atomic Common Files write/read behavior using a temporary directory.
- Invalid or unavailable Common Files path fails safely.
- TCP binds to loopback by default.
- Authentication failure reveals no queued command.
- Oversized, partial, malformed, and unsupported-version messages are rejected.
- Paper mode remains deterministic when MT5 is disconnected.
- Existing frontend-required response keys remain available without false broker-success claims.

### Demo MT5 verification gate

After automated tests pass, a dedicated demo-account procedure must verify actual MQL5 behavior, broker symbol aliases, one-order semantics across both transports, broker acknowledgements, position scoping, reconnects, and failures. Use the smallest permitted volume and ensure the demo account contains no unrelated valuable positions.

No real-money account may be used for Phase 2 verification.

## 9. Files likely to require edits

The following files are expected candidates for a future approved implementation. They must not be edited as part of this planning task:

- `backend/execution/mt5_socket_bridge.py`
- `mql5/FEF_TradingAgentsBridge.mq5`
- `backend/server.py`, only if required to expose truthful bridge/acknowledgement state
- `api/index.py`, only if bridge status or acknowledgement affects cloud forwarding
- `tests/test_safety_characterization.py`, or a new dedicated bridge-safety test file

Additional files may require separate approval if implementation reveals a necessary dependency, including `backend/data/quote_store.py` for Common Files configuration and `backend/config.py` for local bridge settings. MQL5 files other than `FEF_TradingAgentsBridge.mq5`, frontend files, risk agents, strategy agents, and trading rules remain out of scope unless separately reviewed and approved.

## 10. Approval gates

### Gate A: Plan approval

No bridge implementation should begin until this plan is reviewed and explicitly approved.

### Gate B: Test-design approval

Exact automated test cases, expected safe outcomes, protocol fixtures, and demo-account procedures must be reviewed before production bridge code or MQL5 code changes.

### Gate C: Implementation review

Python and MQL5 changes must be reviewed together against the same versioned protocol. No partial deployment is permitted when it could make the two sides incompatible.

### Gate D: Automated safety suite

All existing tests and all new bridge-safety tests must pass. Characterization tests should be updated only when the reviewed safe behavior intentionally replaces the documented unsafe behavior.

### Gate E: Isolated demo MT5 verification

Exactly-once execution, symbol routing, broker acknowledgement, position scoping, file failover, TCP loopback behavior, and failure reporting must pass on a dedicated demo account.

### Gate F: Live-use decision

Completion of Phase 2 does not approve real-money trading. Live-account use remains prohibited until all later safety phases are complete and explicit human approval is recorded.

## Mandatory rule

**No bridge implementation should begin until this plan is reviewed and approved. No real-money or live-account execution is permitted during Phase 2.**
