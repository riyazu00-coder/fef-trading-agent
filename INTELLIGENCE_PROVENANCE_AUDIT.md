# FEF AI TRADING — PHASE 2D: INTELLIGENCE PROVENANCE AUDIT

**Target:** Truthful Live Intelligence Foundation  
**Workspace:** `/Users/mac/.gemini/antigravity/scratch/fef-trading-solution`  
**Branch:** `phase-2-secure-production-mt5`  
**Audit Timestamp:** 2026-09-15T18:10:00Z  

---

## 1. Executive Summary & Provenance Baseline

In Phase 2C, live telemetry verification proved:
- **Actual Runtime Evidence Trust:** 56%
- **Verified Voting Agents:** 5 / 15
- **Current Actionability State:** `ANALYSIS ONLY`
- **Current Direction:** `WATCH FOR BUY`
- **Execution Candidates:** 0 (Legitimate execution candidate does not exist)

Prior claims of **89% Evidence Trust**, **14/15 Swarm Consensus**, **XAUUSD Rank #1 Active Trade**, and fixed **entry/SL/TP levels** originated from hardcoded static fixtures and synthetic fallbacks.

This audit documents every synthetic, static, heuristic, and unverified data source across the FEF AI Trading codebase, establishes canonical provenance classifications, and defines strict replacement and isolation requirements.

---

## 2. Canonical Provenance Classifications

Every intelligence input in Phase 2D is strictly categorized into one of eight immutable classifications:

| Classification | Meaning & Criteria | Execution Eligible? | Contributes to Verified Agent Count? |
| :--- | :--- | :---: | :---: |
| `VERIFIED_LIVE` | Measured directly from authoritative live broker stream (quote, tick, position, order) < 5s age | **YES** | **YES** |
| `DERIVED_FROM_VERIFIED` | Deterministic mathematical calculation solely from verified live broker data (ATR, EMAs, BOS/CHOCH, structure invalidation, session clock) | **YES** | **YES** |
| `DELAYED_VERIFIED` | Verified live external source with known timestamp delay (> 60s, < 15m) | **CONDITIONAL** | **CONDITIONAL** |
| `CACHED_VERIFIED` | In-memory cache of verified data within valid TTL (< 5m) | **CONDITIONAL** | **CONDITIONAL** |
| `HEURISTIC` | Algorithmic pattern matching, SMC rule template, or structural inference lacking direct broker verification | **NO** | **NO** |
| `STATIC_DEMO` | Hardcoded literal values, mock assets, demo scenarios, or sample strings | **NO** | **NO** |
| `SIMULATED` | Algorithmic simulation, random/pseudo-market data, or testing fixture | **NO** | **NO** |
| `UNAVAILABLE` | Required data source is offline, unconfigured, or feed not connected | **NO** | **NO** |

---

## 3. Questionable Source Audit & Inventory

### Source 1: Opportunity Radar Engine Fallback Object
- **Module:** `src/lib/radar/opportunity-radar-engine.ts`
- **Function/Object:** Lines 373–404 (`topOpportunity = topExecutableOpportunity || opportunities[0] || { ... }`)
- **Current Classification:** `STATIC_DEMO`
- **Identified Artifacts:**
  - Hardcoded price: `4349.70`
  - Hardcoded score: `94`
  - Hardcoded AI confidence: `89`
  - Hardcoded entry zone: `[4344.20, 4348.20]`
  - Hardcoded SL: `4334.70`, TP1: `4367.70`, TP2: `4383.70`, TP3: `4401.70`
  - Hardcoded why-ranked reason: `"14/15 Swarm Agents aligned in directional consensus"`
- **Production Impact:** When no setup was immediately executable, this static object was promoted as the top opportunity, presenting fake 89% AI confidence, fake 14/15 consensus, and hardcoded price levels to the operator.
- **Replacement Requirement:** Remove static fallback entirely. If no trade qualifies as immediately actionable from live market structure, Radar must truthfully report `NO ACTIONABLE OPPORTUNITIES` (state: `WATCH` or `DATA LIMITED`).

---

### Source 2: Dynamic Setup Level Offsets in Asset Pipeline
- **Module:** `src/lib/agents/multi-asset-pipeline.ts`
- **Function/Object:** `getSymbolContextDetail()` (Lines 141–148 for XAUUSD, and corresponding blocks for EURUSD, BTCUSD, US30, etc.)
- **Current Classification:** `STATIC_DEMO` / `HEURISTIC`
- **Identified Artifacts:**
  - Fixed subtraction/addition offsets from current price:
    - `entryLow = p - 5.5`
    - `entryHigh = p - 1.5`
    - `sl = p - 15.0`
    - `tp1 = p + 18.0`
    - `tp2 = p + 34.0`
    - `tp3 = p + 52.0`
- **Production Impact:** Fabricates "structural" levels that drag continuously with spot price. SL and TP are arbitrary fixed numbers rather than genuine swing highs/lows, FVGs, or liquidity pools.
- **Replacement Requirement:** Replace with `market-structure-engine.ts` and `trade-blueprint-engine.ts`. Entry zones, SL, and TPs must originate exclusively from verified OHLC swing points, displacement candles, and liquidity pools. SL/TP must remain frozen to the originating structure and transition to `INVALIDATED` if breached.

---

### Source 3: Synthetic Agent Commentary & Opinions
- **Module:** `src/lib/agents/multi-asset-pipeline.ts` & `src/lib/agents/agent-swarm.ts`
- **Function/Object:** `agentOverrides`, `INITIAL_AGENTS`, `debateMessages`
- **Current Classification:** `STATIC_DEMO`
- **Identified Artifacts:**
  - Fictional news: `"Core PCE Release in 1h 45m"`, `"Reuters: Middle East ceasefire diplomatic talks underway"`
  - Fictional macro metrics: `"US 10-Year real yield declined to 4.214%"`, `"US10Y yield down 6 bps to 4.21%"`
  - Fictional institutional data: `"Fidelity & BlackRock Spot ETF creations totaling +5,200 BTC this week"`
  - Fictional order flow: `"Asian session low swept at 4341.20 followed by bullish CHOCH"`
  - Static confidence figures: `84`, `76`, `81`, `68`, `74`, `65`, `79`, `86`, `82`, `88`, `78`, `85`, `80`, `83`, `81`
- **Production Impact:** Agents appear live and deliberating based on deep intelligence, but 10 of 15 are repeating static hardcoded text.
- **Replacement Requirement:**
  - Unconnected feeds (News, Macro, Geopolitical, Sentiment, Institutional, Order Flow) must state `DATA LIMITED / WAITING FOR PROVIDER` with classification `UNAVAILABLE`.
  - Confidence must be 0 for unavailable feeds and must contribute 0 to the verified agent count.
  - Technical Agent must calculate genuine indicators from broker OHLC candles.

---

### Source 4: Keyword Heuristic Masquerading as Verified Evidence
- **Module:** `src/lib/agents/multi-asset-pipeline.ts`
- **Function/Object:** `buildAssetProfile()` (Lines 1260–1320)
- **Current Classification:** `HEURISTIC`
- **Identified Artifacts:**
  - Code parses strings for keywords (`'choch'`, `'sweep'`, `'fvg'`, `'dxy'`, `'calendar'`) and marks them as `classification = 'DERIVED'`, `verified = true`, `decisionEligible = true`.
- **Production Impact:** Synthetic strings written in source code bypass the integrity gate because the parser erroneously tags them as "verified derived calculations".
- **Replacement Requirement:** Eliminate keyword-based verification. An evidence record is `VERIFIED` ONLY if its data payload references genuine broker telemetry timestamps, verified candle IDs, or mathematical computations from real time series.

---

### Source 5: Free Providers Static Market Feed & Chart Analysis Simulator
- **Module:** `src/lib/agents/free-providers.ts`
- **Function/Object:** `FREE_MARKET_ASSETS`, `FREE_ECONOMIC_CALENDAR`, `analyzeChartImageOffline()`
- **Current Classification:** `STATIC_DEMO`
- **Identified Artifacts:**
  - Fixed prices (`4349.70`, `104.18`, `4.214`, `64.62`, `77366.00`) labeled `isLive: true`.
  - Static offline chart analyzer returning `symbolConfidence: 94`, `visiblePrice: '4349.70'`, `stopLoss: '4343.80'`.
- **Production Impact:** Can leak into production asset tables if MT5 bridge is offline or unmapped.
- **Replacement Requirement:** Isolate into explicit demo/testing fixture namespace. In production mode, assets must come from `symbolDirectory` and live broker quotes. Chart Vision Agent must report `WAITING FOR CHART` / `UNAVAILABLE` when no user chart has been analyzed.

---

### Source 6: Radar Notification Initial Seed & Boot Triggers
- **Module:** `src/lib/radar/radar-notifications.ts`
- **Function/Object:** `getInitialNotifications()`, lines 327–379; `evaluateRadarStateTransitions()` boot alert branch, lines 164–201
- **Current Classification:** `STATIC_DEMO`
- **Identified Artifacts:**
  - Seed notification claiming `"Opportunity Score 94/100. 14/15 Swarm Agents aligned. Optimal entry zone reached at 4,344 - 4,348."`
  - Boot alert creating high-priority notifications immediately upon startup from initial state.
- **Production Impact:** Operators see popups and unread alerts about a non-existent 14/15 consensus trade upon loading the dashboard.
- **Replacement Requirement:** Empty initial notification store. Popups trigger ONLY when a genuine setup transitions from non-actionable to `ACTIONABLE` with verified evidence trust >= 60% and verified blueprint provenance.

---

### Source 7: Execution API Default Fallbacks
- **Module:** `src/app/api/remote-mt5/execute/route.ts`
- **Function/Object:** Line 123 (`evidenceTrust: typeof body.evidenceTrust === 'number' ? body.evidenceTrust : 65`)
- **Current Classification:** `STATIC_DEMO` Fallback
- **Identified Artifacts:**
  - If `body.evidenceTrust` is missing, defaults to `65`, passing the >= 60% gate.
- **Production Impact:** Permits an unverified execution request to bypass the 60% trust threshold if the caller omits the field.
- **Replacement Requirement:** Reject request if `evidenceTrust` is missing, below 60, or if `blueprintProvenanceVerified !== true`.

---

## 4. Isolation Strategy for Test & Demo Mode

Demo fixtures (`FREE_MARKET_ASSETS`, `INITIAL_AGENTS` mock strings, offline vision simulator) will **NOT** be deleted to avoid breaking unit test suites and offline mock demonstrations. Instead:
1. They are isolated under explicit `DEMO_FIXTURE_` flags.
2. The production decision pipeline (`multi-asset-pipeline.ts`, `opportunity-radar-engine.ts`, `route.ts`, and cockpit components) consumes strictly from `CanonicalMarketSnapshot` and live broker telemetry.
3. If broker telemetry or OHLC data is missing, the system truthfully outputs `DATA LIMITED` / `UNAVAILABLE` rather than silently falling back to demo fixtures.
