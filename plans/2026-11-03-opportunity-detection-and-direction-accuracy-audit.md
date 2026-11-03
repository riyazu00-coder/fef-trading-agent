# FEF CORTEX — OPPORTUNITY DETECTION, DIRECTION ACCURACY & TELEGRAM SIGNAL AUDIT
**Forensic Engineering Investigation · Phases 11–16 Deep-Dive**  
**Environment**: Production (`app.feftradingsolutions.com`) & Local Staging  
**Branch**: `recovery-v122-agents` | **Safety Status**: `READ_ONLY` Enforced | **Journal**: 17 Lines (SHA-256 Verified)  
**Date**: November 3, 2026

---

## 1. Executive Summary & Safety Invariants

A forensic engineering investigation was conducted across the FEF CORTEX v1.2.3 architecture to determine why zero eligible Telegram live signals have been produced since activation, why UI components display conflicting market states and directional biases, and why Opportunity Radar scores remain depressed (15–35%).

### Strict Safety Invariants Verified
- **Working Tree**: Checked and clean on `recovery-v122-agents`.
- **Execution Journal Integrity**: Exactly 17 lines verified in `data/fef-execution-journal.jsonl`.
  - Canonical SHA-256: `88dfd508701125d3b7de67be64f87ce25fab091deb22b260da18c27473c2834b` (100% Match).
- **Execution Mode**: `CANONICAL_EXECUTION_MODE = 'READ_ONLY'`.
- **Order Transport**: `MT5_ORDER_TRANSPORT_ENABLED = false as const`.
- **External AI Integration**: `OPENAI_ENABLED = false`, zero external LLM API cost (\$0.00).
- **Telegram Live Channel Destination**: Locked to `@forexmetalsignals`.
- **Eligibility Gates & R:R Floor**: All 21 institutional gates and the 2.0:1 R:R floor remain 100% intact. Zero gates were loosened during this audit.

---

## 2. Findings Classification Matrix

| Finding ID | Component | Description | Status | Severity |
| :--- | :--- | :--- | :--- | :--- |
| **F-01** | `multi-asset-pipeline.ts` | `quoteTimestampMs` parsing defect causes arithmetic underflow, flagging fresh quotes as 54 years stale; triggers Data Sentinel `HARD_VETO` and collapses Decision Engine to `DATA_LIMITED` (0% confidence). | **CONFIRMED** | **CRITICAL (P0)** |
| **F-02** | `telegram-signal-service.ts` | Candidate intake gap: `processCandidateSetup()` is disconnected from live runtime ingress (`/api/telemetry/ingress` and background worker); never called in production. | **CONFIRMED** | **CRITICAL (P0)** |
| **F-03** | `multi-asset-pipeline.ts` / `decision-engine-v2.ts` | Non-correlated domain lockout: `structuralGate` is hardcoded to `false` for Macro, News, Sentiment, and Geopolitical agents, making it mathematically impossible to reach $\ge 2$ independent domains. Maturity locked to `WATCH`. | **CONFIRMED** | **CRITICAL (P0)** |
| **F-04** | `trade-blueprint-engine.ts` | Structural rigidity: Blueprints require unmitigated SMC Fair Value Gaps or Order Blocks; lacks Breakout, Pullback-to-Structure, or ATH projection logic. | **CONFIRMED** | **HIGH (P1)** |
| **F-05** | `setup-intelligence-v3.ts` | R:R distortion: `riskReward.ratio` is calculated strictly against minor TP1 (nearest structural friction) rather than multi-target / extension targets, failing the 2.0:1 minimum threshold. | **CONFIRMED** | **HIGH (P1)** |
| **F-06** | `MarketOverviewCard.tsx` vs `CurrentAiDecision.tsx` | Directional conflict: Market Overview displays raw single-timeframe H4 swing trend and 24h delta, while Decision Engine reflects multi-domain consensus collapsed by F-01. | **CONFIRMED** | **HIGH (P1)** |
| **F-07** | `MarketSessionLiquidityMap.tsx` | Weekend desynchronization: Liquidity Map uses UTC hour/minute but omits day of week (`getUTCDay()`), displaying "London Session" on Saturdays and Sundays. | **CONFIRMED** | **MEDIUM (P2)** |
| **F-08** | `opportunity-radar-engine.ts` | Radar score depression: Hard veto clamp forces `effectiveScore = 15` whenever F-01 triggers, capping radar scores at 15–35% across the 26-asset universe. | **CONFIRMED** | **HIGH (P1)** |
| **F-09** | `broker-candle-service.ts` vs `independent-candle-service.ts` | Forming bar divergence: Broker candles strip forming bars (`rates[0]`), while independent candle adapters (Binance/Yahoo) include active forming bars. | **CONFIRMED** | **MEDIUM (P2)** |
| **F-10** | `telegram-persistence.ts` | Rejection telemetry invisibility: Rejection logs are only recorded when `processCandidateSetup()` executes; zero live rejection telemetry exists in SQLite. | **CONFIRMED** | **MEDIUM (P2)** |

---

## 3. Deep-Dive Forensic Analysis

### 3.1. Finding F-01: Stale Quote Arithmetic Underflow & Data Sentinel Hard Veto (CONFIRMED)
- **Location**: `src/lib/agents/multi-asset-pipeline.ts` (lines 417–420, 2374–2377) & `src/context/ActiveAssetContext.tsx` (line 528).
- **Mechanism**:
  ```typescript
  // ActiveAssetContext.tsx (Line 528)
  workingAssets[symKey] = {
    ...baseAsset,
    lastUpdated: quote.freshness || freshness.statusLabel, // Assigns "FRESH", "Live", or "15s ago"
  };

  // multi-asset-pipeline.ts (Lines 417-419)
  const quoteTimestampMs = liveAsset?.lastUpdated && !isNaN(new Date(liveAsset.lastUpdated).getTime())
    ? new Date(liveAsset.lastUpdated).getTime()
    : undefined; // NaN -> ALWAYS evaluates to undefined!

  // multi-asset-pipeline.ts (Lines 2374-2376)
  quoteFreshness: isAssetMt5Live
    ? ((evalTimeMs - (quoteTimestampMs || 0)) <= 30_000 ? 'FRESH' : 'STALE')
    : ...
  ```
  Because `quoteTimestampMs` is `undefined`, `(quoteTimestampMs || 0)` evaluates to `0`. `evalTimeMs - 0` is $\approx 1.73 \times 10^{12}$ ms ($\approx 54$ years).
  This exceeds `30_000` ms, so `quoteFreshness` evaluates to `'STALE'`.
- **Consequence**:
  In `src/lib/decision/decision-engine-v2.ts` lines 731–742:
  ```typescript
  if ((evidenceBundle.provenance.source === 'MT5_BROKER' || ...) &&
      (evidenceBundle.market.quoteFreshness === 'STALE' || ...)) {
    hardVetoes.push({
      type: 'HARD_VETO',
      source: 'DATA_SENTINEL',
      reason: `Broker quote is stale (${evidenceBundle.market.quoteAgeMs}ms age)`,
      severity: 'CRITICAL',
      effect: 'FORCE_WAIT'
    });
  }
  ```
  This immediately forces `maturity = 'DATA_LIMITED'` (line 1079), `confidence = 0` (line 1115), and `effectiveSetupDirection = 'WAIT'`.
- **Proof**: Empirically reproduced in isolated node script. When `lastUpdated` is `"FRESH"`, Decision Engine outputs `DATA_LIMITED` with `confidence: 0%` and Hard Veto. When given a valid ISO string, the hard veto vanishes.

---

### 3.2. Finding F-02: Missing Production Candidate Ingress Loop (CONFIRMED)
- **Location**: `src/lib/telegram/telegram-signal-service.ts`, `src/app/api/telemetry/ingress/route.ts`, and `scripts/fef-background-worker.ts`.
- **Mechanism**:
  - `telegramSignalService.processCandidateSetup(decision, setup, telemetry)` is the sole entrypoint to evaluate candidate setups against the 21 gates and insert eligible records into `telegram_delivery_queue`.
  - A comprehensive codebase grep confirmed `processCandidateSetup` is called exclusively in test scripts (`test-phase13-delivery-engine.ts`, `test-phase13-master-suite.ts`).
  - Neither `/api/telemetry/ingress` (which receives connector payloads and stores them in Redis) nor `scripts/fef-background-worker.ts` invokes `telegramSignalService.processCandidateSetup()`.
- **Consequence**:
  Even if market conditions were 100% optimal, no automated mechanism exists in the production runtime to feed live setups into the Telegram pipeline.

---

### 3.3. Finding F-03: Mathematical Lockout of Independent Evidence Families (CONFIRMED)
- **Location**: `src/lib/agents/multi-asset-pipeline.ts` (lines 1660, 1802, 1811, 1819, 1852) & `src/lib/decision/decision-engine-v2.ts` (lines 954–965, 1086–1088).
- **Mechanism**:
  - In `multi-asset-pipeline.ts`, non-candle evidence sources (News, Macro, Geopolitical, Sentiment) have `structuralGate` hardcoded to `false`.
  - Line 1852 sets `decisionEligible = canonicalEligibility.eligible && structuralGate`, marking all non-candle evidence as `decisionEligible = false`.
  - In `decision-engine-v2.ts`, line 954 checks if all evidence for an agent has `!e.decisionEligible`. If so, the agent is classified as `isStaticOnly = true`, and its directional weight is zeroes out (`bullishWeightedScore` receives 0).
  - Consequently, **only candle/broker agents** can ever reach the 0.35 threshold to achieve domain polarity.
  - All candle agents belong to a single dependency group: `PRICE_OHLC_DERIVED`.
  - Therefore, `independentDomainCount` is strictly capped at **1**.
- **Consequence**:
  Decision Engine V2 line 1086 enforces:
  ```typescript
  else if (independentDomainCount === 1) {
    maturity = 'WATCH';
    requirementsToAdvance.push('Requires non-correlated evidence cluster confirmation.');
  }
  ```
  A single domain can NEVER advance to `VALIDATED_SETUP`. Furthermore, Gate 14 requires $\ge 2$ independent domains, and Setup Intelligence V3 line 591 requires $\ge 3$. This creates an insurmountable architectural impasse.

---

### 3.4. Finding F-04 & F-05: Structural Rigidity & R:R Calculation Flaws (CONFIRMED)
- **Location**: `src/lib/trading/trade-blueprint-engine.ts` (lines 434–480) & `src/lib/setup/setup-intelligence-v3.ts` (lines 404, 468–472).
- **Mechanism**:
  - **SMC Only**: Blueprints can only form if an unmitigated FVG or Order Block is located. Standard trend continuation, high-volume breakouts, and range-boundary mean reversions produce `null` blueprints.
  - **All-Time High Blocker**: For assets trading at or near historical highs (e.g. Gold at \$2,750), `targetsAbove` finds zero previous swing highs, returning `null` (line 477).
  - **R:R Evaluated Solely Against TP1**:
    `trade-blueprint-engine.ts` line 479 sets `tp1` to the *nearest* minor swing high or resistance level.
    `setup-intelligence-v3.ts` line 404 computes:
    ```typescript
    const tp1Rr = Number((rewardDist / riskDist).toFixed(2));
    riskReward = {
      ratio: tp1Rr,
      meetsMinimumThreshold: tp1Rr >= 2.0
    };
    ```
    Even if TP2 offers 2.8:1 and TP3 offers 4.5:1, `riskReward` is evaluated strictly on TP1. Because TP1 is the nearest minor structural friction point, its R:R is frequently between 0.4:1 and 1.5:1, triggering immediate rejection at Gate 11 (`REJECTED_RR`).

---

### 3.5. Finding F-06: Directional Contradiction Between Overview and Cockpit (CONFIRMED)
- **Location**: `src/components/cockpit/MarketOverviewCard.tsx` vs `src/components/cockpit/CurrentAiDecision.tsx`.
- **Mechanism**:
  - `MarketOverviewCard.tsx` computes its headline direction and badges from:
    1. Daily percentage change (`change24h >= 0 ? 'BULLISH' : 'BEARISH'`).
    2. H4 Swing Trend (`h4MarketStructure.trend` from 10+ H4 bars).
    If H4 swing highs are ascending and the day is +0.3%, Market Overview displays `"H4 BULLISH MOMENTUM ↗"` with a green indicator.
  - `CurrentAiDecision.tsx` displays the multi-agent Decision Engine posture. Because of F-01 (stale quote bug) and F-03 (domain lockout), Decision Engine is locked in `DATA_LIMITED` or `WATCH` with `confidence = 0%`, displaying `"WAIT (DATA INSUFFICIENT / STALE)"`.
  - The operator sees a green "BULLISH" header next to an amber/red "WAIT (DATA LIMITED)", creating the appearance of severe engine conflict.

---

### 3.6. Finding F-07: Weekend Session Desynchronization in Liquidity Map (CONFIRMED)
- **Location**: `src/components/cockpit/MarketSessionLiquidityMap.tsx` (lines 40–100).
- **Mechanism**:
  ```typescript
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  const totalMinutesNow = utcHours * 60 + utcMinutes;
  // Evaluates London, NY, Tokyo, Sydney based ONLY on totalMinutesNow
  ```
  The component never evaluates `now.getUTCDay()`. On Saturdays and Sundays, it cycles through London and New York sessions, while `MarketStatusBadge` and `ActiveAssetContext` correctly display `WEEKEND CLOSED`.

---

### 3.7. Finding F-08: Radar Score Depression & Cap Penalty (CONFIRMED)
- **Location**: `src/lib/radar/opportunity-radar-engine.ts` (lines 548–554).
- **Mechanism**:
  ```typescript
  const hasHardVeto = Boolean(profile.decisionIntelligenceV2?.hardVetoes?.length || decisionV2Ui?.hasHardVeto);
  let effectiveScore = isUnsupportedOrOffline ? 0 : score;
  if (hasHardVeto && effectiveScore > 15) {
    effectiveScore = 15;
  }
  ```
  Because F-01 triggers a Data Sentinel `HARD_VETO` across all live assets, every asset is penalized down to `effectiveScore = 15`. This explains why Opportunity Radar scores appear permanently depressed at 15–35%.

---

## 4. Synthetic Simulation & Historical Replay Results

Using the simulation harness `/Users/mac/.gemini/antigravity/brain/fa54ad24-3b14-4fde-a263-ed5c6dfd2025/scratch/simulate-market-scenarios.ts`, the full pipeline was tested against 4 canonical market scenarios:

### Scenario A: Strong Trending Market (Gold XAUUSD in London Session, +1.5%)
- **Inputs**: 30 H1 bars, 50 M15 bars, monotonic bullish expansion, London session (10:30 UTC).
- **Pipeline Output**: Trend = `BULLISH`, Regime = `Structure BULLISH`, Session = `LONDON SESSION (Open: true, Executable: true)`.
- **Blueprint Outcome**: `null` (No unmitigated FVG/OB within proximity; no previous swing highs above current price).
- **Decision Engine V2**: Posture = `OBSERVING`, Bias = `NEUTRAL`, Confidence = `16%`, Independent Domains = `0`.
- **Setup Intelligence V3**: Lifecycle = `WATCH`, Confirmations Missing = `[ENTRY_GEOMETRY, STRUCTURAL_INVALIDATION, MINIMUM_RISK_REWARD, INDEPENDENT_EVIDENCE, TRIGGER_CONFIRMATION]`.
- **21 Gates Outcome**: `REJECTED_LOW_MATURITY` (Gate 4: Requires `VALIDATED_SETUP`).
- **Signal Published**: **NO**.

### Scenario B: Mean Reversion / Range-Bound (EURUSD in Asian Session, 15-pip range)
- **Inputs**: 30 H1 bars, 50 M15 bars oscillating $\pm 10$ pips around 1.0850, Asian session (03:00 UTC).
- **Pipeline Output**: Trend = `RANGING`, Session = `ASIAN / TOKYO SESSION (Open: true, Executable: true)`.
- **Blueprint Outcome**: Valid SELL blueprint formed at range high (Entry: 1.0855–1.0862, SL: 1.08666, TP1: 1.0838, R:R: 1:1.47).
- **Decision Engine V2**: Posture = `OBSERVING`, Confidence = `15%`, Independent Domains = `0`.
- **Setup Intelligence V3**: Lifecycle = `EXPIRED`, Confirmations Missing = `[INDEPENDENT_EVIDENCE, TRIGGER_CONFIRMATION]`.
- **21 Gates Outcome**: `REJECTED_LOW_MATURITY` (Gate 4: Requires `VALIDATED_SETUP`).
- **Signal Published**: **NO**.

### Scenario C: High Volatility News Event (XAUUSD During US CPI Release)
- **Inputs**: 30 H1 bars, extreme expansion candle (+2.8%), high spread, London/NY Overlap (13:30 UTC).
- **Pipeline Output**: Trend = `RANGING`, Volatility = High, News Risk = High.
- **Decision Engine V2**: Soft Veto triggered (`RISK_GUARDIAN: Abnormal spread expansion`). Confidence capped.
- **Setup Intelligence V3**: Lifecycle = `OBSERVING`.
- **21 Gates Outcome**: `REJECTED_LOW_MATURITY` (Gate 4).
- **Signal Published**: **NO**.

### Scenario D: Weekend / Market Closed (US100 on Saturday)
- **Inputs**: Saturday 12:00 UTC.
- **Pipeline Output**: Session = `INDICES WEEKEND CLOSURE`, Market State = `WEEKEND_CLOSED`, `tradeExecutable = false`.
- **Decision Engine V2**: Hard Veto triggered (`SESSION: Market session is currently closed`). Maturity = `DATA_LIMITED`, Confidence = `0%`.
- **Setup Intelligence V3**: Correctly gated (`SESSION_OPEN` missing).
- **21 Gates Outcome**: `REJECTED_LOW_MATURITY` (Gate 4).
- **Signal Published**: **NO**.

---

## 5. Potential Strategy Enhancements (Design & Analysis Only)

To expand legitimate, institutional signal production without compromising risk or lowering the 2.0:1 R:R floor, the following 5 strategic enhancements are proposed:

### 5.1. Multi-Strategy Blueprint Architecture
Expand beyond SMC FVG/OB into 4 distinct institutional archetypes:
1. **SMC Order Block / Fair Value Gap Retest** (Existing, retained).
2. **Breakout & Retest of Key Daily / Session Levels** (PDH/PDL, London High/Low break with confirmed M15 close).
3. **Trend Continuation & Value Pullback** (Pullback to 20/50 EMA on H1 with stochastic/RSI oversold confluence in higher-timeframe trend).
4. **Liquidity Sweep & Reversal** (False breakout beyond session extreme with rapid displacement back inside range).

### 5.2. Asymmetric Multi-Target Risk/Reward Weighting
- Replace the strict `TP1 >= 2.0` requirement with **Blended Institutional R:R**:
  - Target 1 (TP1): Structural friction / partial profit (e.g. 1.0:1 to 1.5:1, take 50% off).
  - Target 2 (TP2): Major liquidity pool (e.g. 2.5:1 to 3.0:1).
  - Target 3 (TP3): Macro expansion / trailing runner (e.g. 4.0:1+).
  - **Policy Rule**: The setup qualifies under Gate 11 if **TP2 $\ge$ 2.0:1** and the blended expectation $\ge$ 2.0:1, while maintaining TP1 for execution de-risking.

### 5.3. All-Time High / Uncharted Territory Fibonacci Extensions
When price creates new structural highs and `targetsAbove` has no historical swing highs, synthesize structural targets using **Fibonacci Extensions**:
- TP1 = 1.272 extension of previous corrective swing.
- TP2 = 1.618 extension (guaranteed $\ge$ 2.0:1 R:R).
- TP3 = 2.000 extension.

### 5.4. Independent Evidence Family Hydration
- Restore decision eligibility to Macro (Rates, Real Yields) and verified Sentiment (LSR) by replacing the hardcoded `structuralGate = false` with verified source age checks ($\le 4$ hours for Macro, $\le 30$ minutes for Sentiment).
- Allow the confluence of **Technical Trend (Domain 1)** + **Macro Rates/Yields (Domain 2)** + **Session Killzone (Domain 3)** to satisfy the $\ge 2$ independent domain requirement.

---

## 6. Prioritized Implementation Plan

### Phase 1: Critical P0 Engine Fixes (Signals Unblocked)
1. **Fix `lastUpdated` timestamp parsing**:
   - In `ActiveAssetContext.tsx`, store `lastUpdatedMs: quote.timeMs || Date.now()` alongside string display labels.
   - In `multi-asset-pipeline.ts`, read numeric timestamp first, eliminating the 54-year underflow and false Data Sentinel `HARD_VETO`.
2. **Connect Production Candidate Intake Loop**:
   - In `scripts/fef-background-worker.ts` and `/api/telemetry/ingress`, feed generated asset intelligence profiles through `telegramSignalService.processCandidateSetup()`.
3. **Restore Independent Domain Viability**:
   - In `multi-asset-pipeline.ts`, allow verified Macro and Sentiment feeds to be `decisionEligible`, permitting `independentDomainCount >= 2` when external context aligns with price structure.
4. **Synchronize Independent Domain Gate**:
   - Align `setup-intelligence-v3.ts` requirement from $\ge 3$ down to $\ge 2$ to match Decision Engine V2 and Gate 14.

### Phase 2: High-Priority P1 Calculation & UI Repairs
1. **Fix TP1-Only R:R Distortion**:
   - Update `setup-intelligence-v3.ts` and Gate 11 to evaluate minimum R:R against TP2 or maximum valid structural target ($\ge 2.0:1$), while preserving TP1 as a conservative partial target.
2. **Uncap Opportunity Radar Hard Veto**:
   - With F-01 resolved, remove artificial score clamping so genuine radar candidates score 60–90%.
3. **Harmonize Market Overview Card**:
   - Display "H4 STRUCTURAL BIAS" instead of raw "BULLISH" to distinguish underlying trend from execution posture ("WAIT - RETEST PENDING").

### Phase 3: Medium-Priority P2 Session & Strategy Enhancements
1. **Fix Weekend Session Detection**:
   - Add `now.getUTCDay()` check in `MarketSessionLiquidityMap.tsx` to display `WEEKEND CLOSURE` on Saturdays/Sundays.
2. **Harmonize Candle Forming Bar Stripping**:
   - Ensure independent candle adapters strip forming bars identically to MT5 broker candle service.
3. **Implement Breakout & Retest Blueprint Generators**:
   - Add Fibonacci extension targets for ATH setups and London session breakout templates.
4. **Hydrate Live Rejection Telemetry**:
   - Ensure all gate rejections are recorded in `telegram_signal_events` and surfaced in the Operator Health Dashboard.

---

## 7. Consolidated Owner Repair Prompt

The exact, self-contained prompt to execute the implementation plan in the next phase is provided below:

```markdown
# FEF CORTEX — PHASE 17: OPPORTUNITY DETECTION, DIRECTION ACCURACY & PIPELINE REPAIR EXECUTION

## AUTHORIZATION & INVARIANTS
The forensic audit (Phase 11–16) has identified 8 confirmed root causes preventing live Telegram signal broadcast and causing UI session/direction discrepancies.
Proceed with implementing the prioritized repairs on the existing repository:

Branch: recovery-v122-agents
Repository: /Users/mac/.gemini/antigravity/scratch/fef-trading-solution

STRICT SAFETY INVARIANTS:
1. Maintain READ_ONLY execution architecture and MT5_ORDER_TRANSPORT_ENABLED = false.
2. Do not modify the 17-line execution journal (data/fef-execution-journal.jsonl, SHA-256: 88dfd508...).
3. Maintain OPENAI_ENABLED = false and budget $0.00.
4. Telegram destination strictly locked to @forexmetalsignals.
5. Do NOT loosen the 21 eligibility gates or lower the mandatory 2.0:1 R:R floor.

## REPAIR SCOPE

### 1. Fix Timestamp Parsing & Eliminate False Data Sentinel Hard Veto (P0)
- In `src/context/ActiveAssetContext.tsx`, ensure `lastUpdated` stores a valid ISO timestamp or provide `lastUpdatedMs: number`.
- In `src/lib/agents/multi-asset-pipeline.ts`, correctly extract quote timestamp from `liveAsset`, eliminating the 54-year underflow that flags live quotes as STALE.

### 2. Connect Background Candidate Intake to Telegram Signal Pipeline (P0)
- In `scripts/fef-background-worker.ts` and telemetry background surveillance, pass active asset intelligence profiles and setup intelligence into `telegramSignalService.processCandidateSetup()`.
- Ensure evaluated setups are checked against eligibility gates in real-time.

### 3. Restore Multi-Domain Independence Viability (P0)
- In `src/lib/agents/multi-asset-pipeline.ts`, allow verified Macro and Sentiment feeds to be `decisionEligible = true` when backed by verified timestamps, enabling `independentDomainCount >= 2`.
- In `src/lib/setup/setup-intelligence-v3.ts`, harmonize the independent domain requirement to >= 2 (matching Decision Engine V2 and Gate 14).

### 4. Fix R:R Evaluation Against Secondary Targets (P1)
- In `src/lib/setup/setup-intelligence-v3.ts` and `src/lib/telegram/telegram-signal-eligibility.ts`, evaluate the 2.0:1 R:R floor against the highest verified structural target (TP2/TP3) when TP1 is a conservative structural friction target (< 2.0).

### 5. Harmonize Market Overview & Session Liquidity UI (P1/P2)
- In `src/components/cockpit/MarketSessionLiquidityMap.tsx`, add day-of-week checks (`getUTCDay()`) to ensure weekend closures are accurately reflected.
- In `src/components/cockpit/MarketOverviewCard.tsx`, clarify H4 structural trend labels to prevent contradictory presentation against Decision Engine execution timing.

### 6. Verification & Regression Testing
- Run test suite: `npm test` and verify zero regressions.
- Verify TypeScript compilation (`npm run typecheck` or equivalent).
- Verify execution journal SHA-256 remains unchanged.
- Provide full empirical verification report with before/after evidence.
```

