# FEF CORTEX Phase 18 — Master System Audit Report

**Project**: FEF CORTEX
**Branch**: `recovery-v122-agents`
**Starting Commit**: `bc2df2b`
**Operating Mode**: `CANONICAL_EXECUTION_MODE = 'READ_ONLY'`
**Order Transport**: `MT5_ORDER_TRANSPORT_ENABLED = false`
**Telegram Destination**: `@forexmetalsignals` via `@FEF_CORTEX_Signals_Bot`
**Date**: November 3, 2026
**Status**: STAGE 1 AUDIT COMPLETE — ROOT CAUSES CONFIRMED

---

## 1. Executive Summary

Phase 18 was initiated to resolve a critical system-level issue: despite users manually executing numerous trades across multiple markets, FEF CORTEX has delivered zero actionable trading signals to the configured Telegram channel and zero notifications to the web cockpit.

The objective of Phase 18 is not to artificially loosen risk gates or generate simulated noise. The objective is to determine exactly why genuine opportunities are not being detected, qualified, generated, or delivered, and to correct the underlying software and architecture defects without weakening legitimate risk controls.

The Stage 1 baseline audit has successfully inspected every subsystem in the repository, live local runtime, database files, and active network sockets. It has identified the exact technical and architectural root causes for the zero-signal and zero-notification behavior.

---

## 2. System Inventory

### A. Asset Universe & Categories
- **Canonical Registry**: 26 configured assets defined in `src/lib/registry/market-registry.ts`.
- **Categories Covered**:
  1. **METALS** (2): `XAUUSD`, `XAGUSD`
  2. **FOREX** (10): `EURUSD`, `GBPUSD`, `USDJPY`, `AUDUSD`, `NZDUSD`, `USDCAD`, `USDCHF`, `GBPJPY`, `EURJPY`, `EURGBP`
  3. **INDICES** (6): `US100` (broker: `USTEC`), `US30`, `US500`, `GER40`, `UK100`, `JP225`
  4. **COMMODITIES** (3): `USOIL`, `UKOIL`, `NATGAS` (broker: `XNGUSD`)
  5. **CRYPTO** (5): `BTCUSD`, `ETHUSD`, `SOLUSD`, `XRPUSD`, `BNBUSD`
- **Broker Availability (Exness MT5 Trial)**:
  - 25 of 26 symbols are active with verified live quotes and candles.
  - 1 symbol (`GER40`) is `NOT_SUPPORTED_BY_BROKER` on the Exness trial account and is gracefully flagged.

### B. Timeframes Supported
- **Broker & Bridge Timeframe Hierarchy**: `M1`, `M5`, `M15`, `M30`, `H1`, `H4`, `D1`.
- **Candle Depth Available**: Up to 35 closed bars per timeframe in the local HTTP bridge (total 245 bars per asset).
- **Observed Defect**: The local connector agent (`fef-local-connector-agent.js`) was configured to query only `M15` and `M30` for 7 primary symbols, ignoring `M1` and `M5`, and only rotating the remaining 19 symbols every 6 minutes for higher timeframes.

### C. Technical Analysis & Intelligence Engines
- **Market Structure Engine** (`src/lib/market/market-structure-engine.ts`): Analyzes swing highs, swing lows, BOS, CHOCH, order blocks, and FVGs.
- **Multi-Timeframe Direction Engine** (`src/lib/market/multi-timeframe-direction-engine.ts`): Computes EMA9/21, RSI14, ATR, and momentum across M1 through D1.
- **Trade Blueprint Engine** (`src/lib/trading/trade-blueprint-engine.ts`): Builds structural BUY/SELL setups with entry zone, stop loss, TP1, and TP2.
- **Expanded Institutional Strategies** (`src/lib/trading/expanded-strategies.ts`): 5 archetypes (ATH Price Discovery, Trend Pullback Retest, Momentum Expansion, Range Liquidity Sweep, Session Breakout).
- **Setup Intelligence Engine V3** (`src/lib/setup/setup-intelligence-v3.ts`): Enforces mandatory TP2 qualification ($R:R \ge 2.0$), structure monotonicity, and lifecycle state management.
- **Decision Engine V2** (`src/lib/decision/decision-engine-v2.ts`): 31 upstream evidence-evaluation agents, independent domain clustering, confidence, and maturity progression.

### D. Registered Agents Ecosystem (32 Agents)
- **14 Upstream Council Agents**: `TECHNICAL`, `VISION`, `STRATEGY`, `OPPORTUNITY`, `LIQUIDITY_MAP`, `ORDER_FLOW`, `KILLZONE`, `RISK_GUARDIAN`, `MACRO`, `CORRELATION`, `NEWS`, `GEOPOLITICAL`, `SENTIMENT`, `INSTITUTIONAL`.
- **17 Specialist Agents**: `RATES`, `INFLATION`, `VOLATILITY`, `CROSS_ASSET`, `DATA_SENTINEL`, `QUANT_MOMENTUM`, `MACRO_CORRELATOR`, `CROSS_ASSET_LEAD_LAG`, `VOLATILITY_SQUEEZE`, `CURRENCY_STRENGTH`, `ANCHORED_VWAP`, `MARKET_REGIME_CLASSIFIER`, `ORDER_FLOW_DELTA`, `COT_POSITIONING`, `CENTRAL_BANK_POLICY`, `QUANT_MONTE_CARLO`, `ECONOMIC_NEWS_MOMENTUM`.
- **1 Downstream Synthesizer**: `FINAL_DECISION`.

### E. Gate & Signal Delivery Architecture
- **21 Eligibility Gates** (`src/lib/telegram/telegram-signal-eligibility.ts`): Enforces policy, quote freshness, mandatory TP2 ($R:R \ge 2.0$), confidence ($\ge 70\%$), evidence completeness ($\ge 75\%$), and idempotency.
- **Persistence**: Local SQLite database (`~/.fef/data/fef-cortex.db`) with tables for quotes, candles, lifecycle events, and Telegram delivery queues.
- **Telegram Broadcast Worker** (`src/lib/telegram/telegram-signal-service.ts`): Consumes queued signals, rasterizes 1080x1350 PNG cards via Resvg, and posts photo+caption to `@forexmetalsignals`.

---

## 3. The 4 Root Causes of Zero Signals & Notifications

The audit has conclusively proved why no signals or notifications were produced:

### Root Cause 1: Background Autonomous Worker Was Never Scheduled or Executed
- **Location**: `scripts/fef-background-worker.ts` and `src/app/api/telemetry/ingress/route.ts`.
- **Mechanism**: The candidate-intake coordinator (`candidateIntakeCoordinator.evaluateAndDispatchCandidates`) was integrated only into `scripts/fef-background-worker.ts`. However:
  1. No process supervisor, daemon, launchd plist, or npm script ever started `fef-background-worker.ts`.
  2. In Vercel serverless production, no Cron or scheduled background job exists.
  3. When the local connector agent posted live telemetry to `/api/telemetry/ingress`, the route only persisted the JSON into storage; it never evaluated candidates.
  4. Consequently, candidate evaluation was executed **0 times** in live operation.

### Root Cause 2: Artificial Readiness Lockout Forcing Direction = WAIT & Confidence = 0
- **Location**: `src/lib/agents/multi-asset-pipeline.ts` (lines 2266–2292 and 2528–2536).
- **Mechanism**: In `multi-asset-pipeline.ts`, the profile's `effectiveSetupDirection` is forced to `'WAIT'` if `computedReadiness !== 'HIGH' || coveredFamilies.length < 4`.
  - In a broker-connected environment without paid third-party newswires or sentiment feeds, only price/technical domains are active (`coveredFamilies.length` is 2 or 3: `PRICE_TECHNICAL`, `MARKET_STRUCTURE`, `ORDER_FLOW`).
  - Because `coveredFamilies.length < 4`, `computedReadiness` can never be `HIGH`, and `effectiveSetupDirection` is hard-locked to `'WAIT'`.
  - When `effectiveSetupDirection === 'WAIT'`, line 2535 forces `profileConfidence = 0`.
  - Even if a setup formed with a $3.4\text{R}$ TP2 (as confirmed on live `USOIL`), the setup is forced into `WAIT` and `0%` confidence, causing Gate 12 (`confidence >= 70%`) to fail closed immediately.

### Root Cause 3: Conflation of `tradeExecutable` with User Notification Eligibility
- **Location**: `src/lib/radar/radar-notifications.ts` (lines 148–150) and `src/lib/radar/opportunity-radar-engine.ts` (line 905).
- **Mechanism**:
  - To ensure financial safety, `opportunity-radar-engine.ts` correctly forces `opp.tradeExecutable = false` in `READ_ONLY` mode to prevent automated broker order sending.
  - However, `radar-notifications.ts` defined an actionable trade alert as:
    ```typescript
    const isOpportunityState = opp.tradeExecutable && (opp.state.includes('BUY') || opp.state.includes('SELL'));
    ```
  - Because `tradeExecutable` is always false in `READ_ONLY` mode, `isOpportunityState` was **permanently false**. The cockpit Notification Center Drawer and Popups never alerted the user to valid opportunities.

### Root Cause 4: Local Connector Narrow Symbol and Timeframe Polling
- **Location**: `scripts/fef-local-connector-agent.js` (lines 423–429, 708–765).
- **Mechanism**:
  - `primarySyncSymbols` was hardcoded to only 7 symbols.
  - Fast timeframe sync only queried `M15` and `M30`, completely skipping `M1` and `M5`.
  - The remaining 19 symbols were only synced on slow timeframes via rotating batches of 4 every 6 minutes, causing structural candles to become stale and missing lower-timeframe entry confluence.

---

## 4. Current Test Baseline Verification

Prior to any Phase 18 modifications, the test baseline was executed and verified:
- **Phase 17 TP2 Qualification**: 18/18 PASS
- **Canonical Timestamp Contract**: 11/11 PASS
- **Multi-Timeframe Direction Engine**: 9/9 PASS
- **Historical Replay Suite**: 5/5 PASS
- **Phase 13 Master Suite**: 25/25 PASS
- **Phase 14 Master Suite**: 16/16 PASS
- **Phase 16 Pipeline Monitoring**: 51/51 PASS
- **Decision Engine V2 Suite**: 61/61 PASS
- **TypeScript Compilation (`tsc --noEmit`)**: 0 errors
- **Production Build (`npm run build`)**: 21/21 routes compiled cleanly

---

## 5. Next Steps

With the system inventory complete and all root causes identified, Stage 2 will document the specific gate analysis and asset registry coverage, followed by Stage 3 implementation of core corrections across multi-asset discovery, multi-timeframe scanning, and notification routing.
