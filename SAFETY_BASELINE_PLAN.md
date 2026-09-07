# FEF TRADING AGENT Safety Baseline Plan

## Purpose and current status

FEF TRADING AGENT is currently a prototype. It is not approved for live trading or for use with a real-money account.

This document defines the safety tests and review gates that must exist before execution behavior is changed. It is a planning document only: it does not authorize changes to trading logic, risk rules, API behavior, frontend controls, or the MT5 bridge.

## Current execution risks

1. **Possible duplicate live orders through the file and TCP bridge.** A command may be written to the MT5 Common Files bridge and also placed in the TCP queue, allowing the EA to receive the same logical command through both paths.
2. **The EA executes the chart symbol instead of the requested payload symbol.** An order intended for one instrument may be submitted against the symbol of the chart hosting the EA.
3. **Close-all and break-even can affect unrelated account positions.** These operations are not currently scoped to the requested symbol, the FEF magic number, or positions owned by this system.
4. **Quick execution bypasses the Risk Guardian.** Direct BUY/SELL execution does not pass through the complete news, spread, risk/reward, exposure, and position-limit evaluation path.
5. **The default secret is exposed in the frontend and local storage.** A known fallback secret is available to browser code and therefore must not be treated as a confidential authentication credential.
6. **Public Vercel mutating routes are not properly protected.** A public caller may be able to invoke a mutating cloud endpoint that forwards an authenticated request to the local bridge.
7. **“Executed” does not mean broker fill confirmed.** Current responses and UI messages can report execution after dispatch or paper mirroring without a confirmed MT5 broker acknowledgement and fill result.
8. **Simulated or fixed data is displayed as live or institutional.** Some macro, EIA, sentiment, technical, calendar, performance, and price-derived values are constants, synthetic values, or fallbacks but are presented with stronger provenance labels.

## Phase 1 safety test plan

The following tests must be written and reviewed before any execution fix is implemented. Tests should initially characterize the current behavior and clearly identify unsafe failures. They must not require a real-money account.

### 1. One command creates one order

- Assign a unique command/order ID to the test command.
- Exercise both file and TCP delivery paths in the same polling cycle.
- Assert that MT5 receives and processes the logical command no more than once.
- Test retries, delayed polling, reconnects, stale files, and duplicated payloads.
- Require an auditable result connecting the command ID to a single broker order or a single rejection.

### 2. Requested symbol matches executed symbol

- Submit each supported symbol from an EA attached to both matching and non-matching charts.
- Assert that the requested normalized symbol equals the symbol passed to the broker.
- Reject missing, unknown, ambiguous, or mismatched symbols safely.
- Include broker symbol suffix/prefix cases such as `XAUUSDm` without silently routing to another instrument.

### 3. Close-all is scoped by symbol and magic number

- Create FEF and non-FEF positions with different magic numbers and symbols.
- Assert that a scoped close operation closes only its intended FEF positions.
- Assert that manual trades and positions belonging to other EAs remain unchanged.
- Test empty scope, unknown scope, partial broker failure, and repeated commands.

### 4. Break-even is scoped by symbol and magic number

- Create FEF and non-FEF BUY and SELL positions across multiple symbols.
- Assert that only eligible positions in the requested scope are modified.
- Verify the exact break-even price convention, including any approved buffer, tick size, digits, and broker stop-distance restrictions.
- Assert that losing or otherwise ineligible positions are not made less safe.

### 5. MT5 acknowledgement is required before the UI says executed

- Distinguish queued, dispatched, accepted, filled, rejected, timed-out, and unknown states.
- Assert that dispatch, file creation, TCP delivery, and paper mirroring do not produce a broker-filled status.
- Require a broker result containing the requested symbol, volume, order/deal identifier, return code, and fill price before showing an executed/filled message.
- Test rejection, timeout, malformed acknowledgement, disconnect, and late acknowledgement cases.

### 6. Quick execution respects risk guardrails

- Exercise quick execution during news blackout, excessive spread, maximum-position, poor risk/reward, and risk-size violations.
- Assert that failed guardrails prevent dispatch to both file and TCP delivery paths.
- Verify lot limits and account-risk calculations for every supported instrument.
- Confirm that manual lot input cannot silently bypass mandatory safety rules.

### 7. Every mutating endpoint requires authentication

- Cover `/api/execute`, `/api/quick_execute`, `/api/close_position`, `/api/close_all`, `/api/break_even`, and any future state-changing endpoint.
- Test local and Vercel handlers with missing, malformed, invalid, expired, and valid credentials.
- Assert that authentication occurs before tunnel forwarding, paper mutation, queue mutation, or file writes.
- Verify that no default credential embedded in public frontend code grants execution authority.

### 8. Every data feed has an explicit provenance label

- Require one of `LIVE`, `DELAYED`, `FALLBACK`, or `SIMULATED` on every feed and derived dashboard value.
- Verify labels for MT5 quotes, yfinance prices, Frankfurter rates, macro values, EIA data, sentiment, calendar events, technical indicators, SMC candles, account statistics, and performance metrics.
- Assert that stale or failed feeds cannot retain a misleading `LIVE` label.
- Verify that frontend labels match backend provenance and freshness metadata.

## Approval-required files

The following files and areas must not be edited without explicit approval because they control execution, broker routing, risk enforcement, authentication, or execution-facing UI behavior:

- `backend/server.py`
- `backend/config.py`
- `backend/graph/trading_graph.py`
- `backend/graph/state.py`
- `backend/agents/risk_guardian.py`
- `backend/agents/trader_agent.py`
- `backend/agents/technical_analyst.py`
- `backend/execution/mt5_socket_bridge.py`
- `backend/execution/paper_simulator.py`
- `backend/data/quote_store.py`
- `backend/data/market_feed.py`
- `backend/data/macro_feed.py`
- `backend/data/economic_calendar.py`
- `backend/data/public_apis.py`
- `api/index.py`
- `mql5/FEF_TradingAgentsBridge.mq5`
- `mql5/TradingAgentsBridge.mq5`
- Execution, authentication, status, warning, and data-provenance sections of `frontend/index.html`
- `vercel.json`
- Deployment environment variables, tunnel configuration, credentials, and secrets

Existing tests may be extended during an approved tests-only phase. Any test that connects to or mutates a real broker account requires separate explicit approval and must not be part of the default test suite.

## Recommended order of future work

### Phase 1: Tests only

Add isolated unit, integration, protocol, and characterization tests for every safety condition above. Use mocks, fixtures, paper accounts, and recorded acknowledgements. Do not alter production execution behavior during this phase.

### Phase 2: Bridge safety fixes

After the Phase 1 tests expose and reproduce the unsafe cases, implement reviewed fixes for exactly-once delivery, symbol routing, command identity, broker acknowledgement, and position scoping.

### Phase 3: API and authentication fixes

Protect every mutating local and cloud route, remove reliance on public/default credentials, authenticate before forwarding or mutation, and test failure behavior.

### Phase 4: UI labels and warnings

Make execution state, broker acknowledgement, account mode, data provenance, staleness, and risk rejection visible and unambiguous. UI work must reflect backend truth rather than infer success from request completion.

### Phase 5: Documentation update

Update the README, supervision brief, endpoint reference, bridge setup, test counts, data-source descriptions, and operational runbooks to match verified behavior.

### Phase 6: Demo MT5 testing only

Only after all prior phases pass review may the system be evaluated against a dedicated demo MT5 account. Start with the smallest permitted volume, isolated symbols, no unrelated positions, and a documented rollback/stop procedure.

## Mandatory live-trading gate

**No real-money or live-account execution is permitted until all safety tests pass and the complete execution path has been explicitly reviewed and approved.**

Passing unit tests alone is not sufficient. The gate also requires successful integration testing on an isolated demo MT5 account, confirmed broker acknowledgements, verified position scoping, verified authentication, and explicit human approval for live-account use.
