# FEF CORTEX Phase 18 — Zero-Signal Root Cause Analysis Report

**Project**: FEF CORTEX
**Branch**: `recovery-v122-agents`
**Operating Mode**: `CANONICAL_EXECUTION_MODE = 'READ_ONLY'`
**Date**: November 3, 2026
**Status**: 12 AUDIT QUESTIONS DEFINITIVELY ANSWERED WITH REPRODUCIBLE PROOFS

---

## 1. Executive Summary

The project owner manually executed numerous trades while receiving zero actionable, reliable signals from FEF CORTEX in either the web cockpit or the authorized Telegram channel (`@forexmetalsignals`).

This comprehensive investigation traced every step of the signal lifecycle, from broker tick ingestion to Telegram queueing and delivery. The zero-signal failure was not caused by a single bug, but by a **four-stage pipeline disconnect**:

1. **The background surveillance worker was never started or scheduled** in production or the local supervisor.
2. **Multi-asset pipeline logic artificially forced setup direction to `WAIT` and confidence to `0%`** unless 4+ independent data families (including paid newswires and paid sentiment feeds) were simultaneously active.
3. **Application notifications were silenced** because the notification rule conflated `tradeExecutable` (which is forced to `false` in `READ_ONLY` mode) with whether a setup is actionable for human viewing.
4. **Symbol and timeframe polling was artificially restricted** to only 7–8 symbols and 2 timeframes, leaving 18 active broker assets completely unmonitored.

---

## 2. Answers to the 12 Mandatory Signal Audit Questions

### 1. Is the system scanning all configured assets?
**NO.**
- The system defines 26 canonical assets in `MARKET_REGISTRY`, of which 25 have verified live feeds from Exness MT5.
- However, `scripts/fef-background-worker.ts` hardcoded `MONITORED_SYMBOLS` to only 8 symbols (`['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USOIL', 'BTCUSD', 'US100', 'US500']`).
- `scripts/fef-local-connector-agent.js` only synced fast candles for 7 primary symbols.
- 18 active symbols (`XAGUSD`, `US30`, `UK100`, `JP225`, `UKOIL`, `NATGAS`, `AUDUSD`, `NZDUSD`, `USDCAD`, `USDCHF`, `GBPJPY`, `EURJPY`, `EURGBP`, `ETHUSD`, `SOLUSD`, `XRPUSD`, `BNBUSD`) were completely ignored.

### 2. Is it scanning all supported timeframes?
**NO.**
- The local MT5 bridge supports and possesses live candle bundles across 7 timeframes (`M1`, `M5`, `M15`, `M30`, `H1`, `H4`, `D1`).
- However, the local connector agent only queried `M15` and `M30` on fast ticks, skipping `M1` and `M5`.
- Higher timeframes (`H1`, `H4`, `D1`) were only polled in rotating batches of 4 every 6 minutes, leading to stale higher-timeframe trends.

### 3. Is it generating candidates?
**PARTIALLY, but with severe runtime suppression.**
- Strategy engines (`TradeBlueprintEngine` and `ExpandedStrategies`) successfully identify setups when given candles (e.g. `USOIL` generated a BUY setup with 3.42 R:R; `EURUSD` generated a SELL setup with 1.53 R:R).
- However, because the background worker was not running, these candidate blueprints were only calculated ephemerally when an audit test script ran or when a user specifically navigated to that asset in the browser.

### 4. If not, why?
- Candidate generation requires verified closed candles. For any asset not currently viewed in the cockpit UI, the client-side cache had zero candles, preventing the opportunity radar from computing structure or blueprints.

### 5. Are candidates being rejected by the eligibility gates?
**YES, 100% of candidates that reached evaluation were rejected.**

### 6. If yes, which gates are responsible?
- **Gate 11 (Mandatory TP2 Qualification)**: Rejects setups with sub-2.0 R:R or missing TP2 (e.g., `EURUSD` TP2 was 1.53R, correctly failing closed).
- **Gate 12 (Decision Confidence $\ge 70\%$)**: Rejects setups when confidence is below 70%. In `multi-asset-pipeline.ts`, lines 2528–2536 artificially forced `profileConfidence = 0` whenever `effectiveSetupDirection === 'WAIT'`.
- **Gate 14 (Decision Bias Alignment)**: Rejects when decision bias is WAIT or conflicts with setup direction. Line 2266 forced `effectiveSetupDirection = 'WAIT'` because `coveredFamilies.length < 4`.

### 7. Are qualified signals being persisted?
**NO.**
- In the local SQLite database (`~/.fef/data/fef-cortex.db`), table `telegram_signal_events` has only 4 rows, all generated during historical acceptance testing (`SIG-EXPIRED-...`).
- Zero live signals were ever persisted because no candidate passed the artificial `WAIT` / `0%` confidence lockout.

### 8. Are application notifications being generated?
**NO.**
- In `src/lib/radar/radar-notifications.ts`, line 148 defines actionable alerts as:
  ```typescript
  const isOpportunityState = opp.tradeExecutable && (opp.state.includes('BUY') || opp.state.includes('SELL'));
  ```
- Because `CANONICAL_EXECUTION_MODE = 'READ_ONLY'`, `opportunity-radar-engine.ts` correctly set `opp.tradeExecutable = false` to prevent auto-trading.
- This caused `isOpportunityState` to be permanently `false`, silencing all popups and Notification Center entries for open-market setups.

### 9. Are Telegram events being queued?
**NO.**
- Zero live candidates were enqueued in `telegram_delivery_queue` because `candidateIntakeCoordinator` was never run by a live process, and any candidate evaluated in tests failed Gate 12/14 due to artificial confidence suppression.

### 10. Are Telegram events being delivered or blocked?
**BLOCKED at the ingestion stage.**
- The delivery engine (`telegramSignalService.processQueue()`) is technically healthy and verified, but its queue was perpetually starved (empty).

### 11. Is the notification pipeline technically operational?
**YES, but structurally disconnected.**
- Resvg image rasterization, SVG template rendering, idempotency hashing, SQLite queue claiming, and Telegram Bot API connectivity (`@FEF_CORTEX_Signals_Bot` targeting `@forexmetalsignals`) are all 100% functional (verified in Phase 13/14/16 tests).
- However, the bridge between market data analysis and the queue was disconnected.

### 12. What specifically prevented the user from receiving signals?
1. The background worker that drives the candidate intake coordinator was never run as a service.
2. In `multi-asset-pipeline.ts`, requiring 4+ external non-price data families forced setup direction to `WAIT` and confidence to `0%`, guaranteeing rejection by Gate 12 and Gate 14.
3. In `radar-notifications.ts`, requiring `tradeExecutable === true` silenced application UI alerts in `READ_ONLY` mode.
4. Only 7–8 symbols were scanned, completely ignoring 18 other available markets.

---

## 3. Required Architectural Fixes

1. **Autonomous Worker Lifecycle**:
   - Register `fef-background-worker.ts` with the supervisor (`fef-bridge-supervisor.js`) or launchd service so that continuous market surveillance runs autonomously in the background.
   - Hook candidate intake processing into `/api/telemetry/ingress` when live quote/candle snapshots are received.

2. **Decouple Technical Confluence from Paid Data Families**:
   - When external newswires, sentiment, or macro feeds are `DATA_LIMITED` (zero-cost mode), allow strong technical + market structure + order flow alignment (3 independent price-derived domains) to produce actionable directional setups with genuine confidence ($\ge 70\%$) rather than forcing `WAIT` and `0%` confidence.

3. **Decouple Application Notifications from Auto-Execution (`tradeExecutable`)**:
   - In `radar-notifications.ts`, evaluate whether a setup is actionable based on market status and setup state (`opp.state.includes('BUY') || opp.state.includes('SELL')`), without requiring `opp.tradeExecutable === true`.

4. **Expand Asset Scanner to Full Universe**:
   - Expand `MONITORED_SYMBOLS` and connector polling from 7–8 symbols to all 25 live canonical assets in `MARKET_REGISTRY`.
   - Ensure `M1`, `M5`, `M15`, `M30`, `H1`, `H4`, `D1` are continuously scanned.
