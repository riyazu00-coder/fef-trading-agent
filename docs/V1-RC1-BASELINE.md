# FEF AI Trading — V1 RC1 Baseline Architecture

> **Release Status**: `V1 RC1 FROZEN` (Tag: `v1.0.0-rc1`)  
> **Production Domain**: `https://app.feftradingsolutions.com`  
> **Production Project**: `fef-trading-dashboard` (Vercel)  
> **Base Commit**: `48c25f5` (`fix: enforce chart blueprint direction consistency`)  
> **Date**: September 2026  

---

## 1. Executive Summary

This document freezes the factual production baseline of the **FEF AI Trading Solution** at Release Candidate 1 (`v1.0.0-rc1`). All functional modules, voting models, risk controls, live provider pipelines, and MT5 bridge boundaries are validated and frozen.

> [!IMPORTANT]
> **FINAL ACCEPTANCE PENDING**:  
> One naturally ACTIONABLE setup must complete the end-to-end flow before V1 is declared COMPLETE:  
> **Market Data → 15 Agents → Evidence Trust ≥ 60% → Valid Blueprint → Risk Guardian → 0.01 Lot → Human Approval → DEMO MT5 → Broker Acknowledgement → Position Telemetry → Journal**.  
> This release candidate is **NOT** marked V1 Complete until this controlled execution acceptance passes.

---

## 2. Infrastructure & Deployment Environment

* **Production URL**: `https://app.feftradingsolutions.com`
* **Hosting Platform**: Vercel Serverless Runtime (`fef-trading-dashboard`)
* **Local Development Workspace**: `/Users/mac/.gemini/antigravity/scratch/fef-trading-solution`
* **Canonical Public Website**: `https://www.feftradingsolutions.com` (`/Users/mac/Documents/FEF-Projects/fef-trading-solutions`) — **STRICTLY LOCKED & UNTOUCHED**
* **Local / Production Bridge Architecture**:
  * **Local Environment**: Connects via HTTP WebRequest / REST to local Node Bridge daemon (`http://127.0.0.1:5556`) interfacing directly with MetaTrader 5 terminal (`FEF_HTTP_Bridge.mq5`).
  * **Production Environment (Vercel)**: `/api/bridge/mt5?action=TELEMETRY` truthfully returns `BRIDGE_OFFLINE`. Cloud serverless instances cannot route to client local loopback interfaces without an external secure relay tunnel.

---

## 3. Market Universe & Data Provider Engine

### 3.1 Universe Coverage (26 Registered Assets)
* **Precious Metals**: `XAUUSD` (Spot Gold), `XAGUSD` (Spot Silver)
* **Forex Majors & Crosses**: `EURUSD`, `GBPUSD`, `USDJPY`, `AUDUSD`, `USDCHF`, `USDCAD`, `NZDUSD`, `EURGBP`, `EURJPY`, `GBPJPY`
* **Global Indices**: `US30` (Dow Jones Industrial), `NAS100` (Nasdaq 100), `SPX500` (S&P 500), `GER40` (DAX), `UK100` (FTSE)
* **Energy / Commodities**: `USOIL` (WTI Crude), `UKOIL` (Brent Crude)
* **Cryptocurrencies (24/7)**: `BTCUSD`, `ETHUSD`, `SOLUSD`, `XRPUSD`, `BNBUSD`, `ADAUSD`, `DOGEUSD`

### 3.2 Crypto Resilient Provider Fallback Chain
To resolve Vercel US-datacenter geolocation restrictions (HTTP 451 from Binance international endpoints), the crypto ingestion pipeline follows a strict, truthful fallback sequence:
1. **Primary**: Binance Spot API (`api.binance.com`) → Returns `LIVE` price (`LAST`).
2. **Secondary Fallback**: Kraken Public REST API (`api.kraken.com`) → Returns `LIVE FALLBACK` price (`LAST`).
3. **Tertiary Fallback**: Coinbase Public Spot API (`api.coinbase.com`) → Returns `LIVE FALLBACK` price (`SPOT`).
4. **Degraded Terminal State**: `DATA LIMITED` → Returns `price: 0`, flags execution as disabled, and retains static base price strictly under `referencePrice` metadata. No stale price is ever falsely reported as live.

---

## 4. Multi-Agent Intelligence Architecture

### 4.1 15 Voting Council Agents
The collective voting core consists of 15 specialized intelligence agents:
1. **Technical Agent**: SMC, ICT, Market Structure, Order Blocks & FVG detection.
2. **Macro Agent**: Central bank rate expectations, sovereign bond yields, inflation metrics.
3. **Correlation Agent**: Cross-market divergences, DXY inverse tracking, inter-commodity ratios.
4. **News Agent**: Live financial wire feeds, headline sentiment, scheduled calendar event buffers.
5. **Geopolitical Agent**: Conflict escalation, sanctions analysis, supply shock modeling.
6. **Sentiment Agent**: Retail crowd positioning skew, Fear & Greed index, contrarian signals.
7. **Institutional Agent**: Commitments of Traders (COT), ETF fund flows, institutional volume blocks.
8. **Risk Agent**: Volatility-adjusted parameters, ATR range expansion, max risk allocation.
9. **Vision / Chart Agent**: Computer vision pattern verification, candle wick rejection geometry.
10. **Opportunity Sniper**: Dynamic bracket calibration, multi-tier TP targets (TP1/TP2/TP3).
11. **Devil's Advocate**: Adversarial counter-thesis modeling, fakeout/liquidity trap detection.
12. **Order Flow Delta Agent**: Cumulative volume delta (CVD) divergence, passive limit absorption.
13. **Session Killzone Agent**: Algorithmic IPDA time-of-day windows (London/NY Open/Close).
14. **MTF Fractal Matrix Agent**: Hierarchical timeframe alignment (Daily → H4 → M15 → M5).
15. **Liquidity Heatmap Agent**: Resting Buy-Side / Sell-Side Liquidity (BSL/SSL) pool clustering.

### 4.2 5 Non-Voting Specialist Observers
Five dedicated observer nodes provide contextual telemetry and boundary auditing without voting rights:
1. **Synapse Data Sentinel**: Feed latency auditor, packet continuity, MT5 bridge heartbeat verification.
2. **Dark Pool & Whale Radar**: Off-exchange ATS dark pool reporting and stealth block print tracking.
3. **Black Swan Event Monitor**: Tail-risk modeling, sovereign CDS spreads, systemic volatility scanning.
4. **Retail Sentiment & Fade Engine**: Aggregated broker retail book contrarian positioning metrics.
5. **Cross-Asset Beta Engine**: Multi-asset intermarket divergence and beta sensitivity modeling.

---

## 5. Evidence Trust & Actionability Gate

* **Evidence Trust Formulation**: Consensus trust is mathematically calculated from verifiable telemetry and multi-feed confirmation across the agent council.
* **Separation of Concerns**: **AI Confidence** (predictive conviction) is strictly separated from **Evidence Trust** (underlying data provenance and data integrity).
* **Deterministic Actionability States**:
  * `ACTIONABLE`: **Strictly requires `Evidence Trust ≥ 60.0%` AND `Verified Agents ≥ 4/15` AND `Market Session = OPEN`**.
  * `ANALYSIS ONLY`: Triggered when `Evidence Trust < 60.0%` or market requires monitoring. Trade execution is strictly disabled.
  * `DATA LIMITED`: Triggered when `Evidence Trust < 40.0%` or verified agent count is deficient.
  * `MONITOR`: Triggered when market sessions are closed or in weekend break.

---

## 6. Risk Guardian & Safety Architecture

* **Authoritative Veto**: The Risk Guardian possesses absolute veto power over all trade generation and dispatch routines.
* **Maximum Risk Cap**: Hard ceiling of **0.50% account balance risk** per trade (with zero overshoot floor guarantee).
* **Session Engine Intelligence**: Real-time evaluation of London, New York, Tokyo, Sydney sessions, weekend closure cutoffs, and holiday schedules.
* **Hard Execution Locks**:
  * **LIVE Execution**: Hard-locked at protocol level. Detection of a Real broker account immediately switches bridge to `READ_ONLY` mode.
  * **DEMO Execution**: Exclusively permitted mode (`DEMO_EXECUTION`), requiring verified Demo/Trial broker account credentials.
  * **Human Approval Requirement**: No order can be submitted without explicit operator authorization (`Human-in-the-Loop`).

---

## 7. Opportunity Radar & Notifications

* **Opportunity Radar Engine**: Continuous real-time scanning of the 26-asset universe with adaptive scoring, direction determination, and state-change tracking.
* **Notification Delivery**:
  * High-priority interactive floating popup toast with direct action links to Cockpit and Chart Analyzer.
  * Dedicated Notification Center slide-out drawer with event history, timestamping, and read/unread state management.
  * Intelligent cooldown and deduplication engine preventing alert spam during rapid market oscillations.

---

## 8. Chart Analyzer & Trade Blueprint Validation

* **Directional Geometry Consistency**:
  * **BUY Setups**: Stop Loss strictly below entry zone; Take Profit targets (TP1 < TP2 < TP3) strictly above entry zone.
  * **SELL Setups**: Stop Loss strictly above entry zone; Take Profit targets (TP1 > TP2 > TP3) strictly below entry zone.
* **Blueprint Validator**: Formal validator (`validateTradeBlueprint`) rejects any setup with conflicting direction, inverted targets, or negative risk-to-reward ratio before rendering or dispatch.
* **Full Smart Position Calculator**: Dynamically derives position volume based on broker account balance, asset tick size, currency conversion, and Risk Guardian risk budget.

---

## 9. Baseline Commits Log

| Commit | Description |
| :--- | :--- |
| `81fd224` | `fix: repair opportunity notification popup delivery` |
| `b38326a` | `fix: add production crypto live-feed fallback` |
| `48c25f5` | `fix: enforce chart blueprint direction consistency` |
