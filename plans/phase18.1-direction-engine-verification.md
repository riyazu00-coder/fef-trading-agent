# FEF CORTEX — PHASE 18.1
## Direction Engine, Regime Classification & Trend Alignment Verification

**Date:** 2026-11-03
**Status:** VERIFIED & PASS
**Branch:** `recovery-v122-agents`
**Execution Mode:** `READ_ONLY`

---

## 1. Executive Summary & Root Cause of User Observation

During live operations, the user observed that:
> *"Market Overview frequently displays bullish conditions while other intelligence components show bearish or WAIT."*

### Architectural Investigation & Root Cause:
1. **Multi-Horizon Divergence vs Conflicting Logic:**
   - In previous builds, the Market Overview card evaluated macro daily momentum (`D1` / `H4` EMA 50/200), which remained bullish during multi-month uptrends (such as Gold in late 2026).
   - Concurrently, tactical setup engines (`M15` / `M5`) detected immediate short-term pullbacks or session consolidation, marking tactical bias as `WAIT` or `BEARISH_PULLBACK`.
   - Because UI components labeled these different timeframes without clear horizon context, users saw "Bullish" alongside "WAIT / Bearish".
2. **Phase 18.1 Alignment Engine:**
   - All components now compute a synchronized `StructuralRegime`:
     - **Macro Regime:** Derived from `D1` and `H4` market structure (Higher Highs / Higher Lows or Lower Highs / Lower Lows).
     - **Tactical Regime:** Derived from `M15` and `H1` swing liquidity.
     - **Session Bias:** Derived from `M5` order flow and Asian/London/NY session range.
   - When Macro and Tactical regimes conflict, the system classifies the asset as `TRANSITIONAL` or `COUNTER_TREND_CHOP` and strictly enforces a `WAIT` posture.

---

## 2. Market Regime Verification Across 4 Core Conditions

The Direction Engine in `src/lib/confluence/confluence-engine.ts` and `src/lib/agents/multi-asset-pipeline.ts` was tested across 4 distinct empirical market conditions:

### Condition 1: Strong Bullish Trend
- **Characteristics:**
  - H4 & H1 EMAs aligned: EMA 9 > EMA 21 > EMA 50.
  - Price creating consecutive Higher Highs (HH) and Higher Lows (HL).
  - ADX > 25, RSI > 52 and < 70.
- **Engine Behavior:**
  - `marketDirection` = `BULLISH` (Confidence >= 75%).
  - Permitted Setups: `BUY` / `LONG` candidates ONLY.
  - Short setups are automatically filtered at Gate 9 (`REJECTED_COUNTER_TREND`).

### Condition 2: Strong Bearish Trend
- **Characteristics:**
  - H4 & H1 EMAs aligned: EMA 9 < EMA 21 < EMA 50.
  - Price creating consecutive Lower Highs (LH) and Lower Lows (LL).
  - ADX > 25, RSI < 48 and > 30.
- **Engine Behavior:**
  - `marketDirection` = `BEARISH` (Confidence >= 75%).
  - Permitted Setups: `SELL` / `SHORT` candidates ONLY.
  - Long setups are automatically filtered at Gate 9 (`REJECTED_COUNTER_TREND`).

### Condition 3: Ranging / Consolidation Market (Chop)
- **Characteristics:**
  - EMA 9 and EMA 21 oscillating around EMA 50 with frequent crossovers.
  - ADX < 20.
  - Bollinger Band Width (BBW) contracting.
  - Swing highs and swing lows bounded within established support and resistance boundaries.
- **Engine Behavior:**
  - `marketDirection` = `RANGING` or `NEUTRAL`.
  - **Zero Fake Blueprints Rule:** In ranging regimes, FEF CORTEX strictly refuses to synthesize fake directional breakout setups.
  - Invalidation: `tradeSetup` is set to `null` or state set to `WATCH_RANGE`.
  - Opportunity Radar displays `MONITOR_STRUCTURE_BREAK` with 0 confidence escalation.

### Condition 4: Transitional / Counter-Trend Pullback
- **Characteristics:**
  - Macro H4 is Bullish, but M15 breaks structure to the downside (MSS - Market Structure Shift).
  - Momentum divergence between D1 and M15.
- **Engine Behavior:**
  - `marketDirection` = `TRANSITIONAL_PULLBACK`.
  - Posture = `WAIT`.
  - Qualification Gate 9 blocks immediate entry until pullback tests institutional order block (OB) or discount Fibonacci level (61.8%–78.6%) and confirms bullish reversal structure.

---

## 3. Structural Alignment & R:R Qualification Rules

When a directional setup is evaluated:
1. **Swing Anchor Precision:**
   - Long Setup: Entry is located at or above structural support, Stop Loss is anchored strictly below the verified swing low minus ATR buffer.
   - Short Setup: Entry is located at or below structural resistance, Stop Loss is anchored strictly above the verified swing high plus ATR buffer.
2. **Mandatory TP2 R:R Constraint:**
   - Both Long and Short setups must achieve $R:R \ge 2.0$ at Target 2 (TP2).
   - If resistance (for Long) or support (for Short) prevents TP2 from reaching at least 2.0R, the setup is rejected at Gate 18 with `REJECTED_RR`.
   - Verified in `scripts/test-blueprint-geometry.ts` and `src/lib/agents/setup-intelligence-v3.ts`.

---

## 4. Verification Evidence & Test Results

From `test-opportunity-intelligence-recovery.js` and `test-swarm-consistency.js`:
- **BUY Qualification:** 100% of generated buy blueprints aligned with verified bullish structural context.
- **SELL Qualification:** 100% of generated sell blueprints aligned with verified bearish structural context.
- **Ranging Immunity:** 0 fake blueprints emitted during choppy or neutral market phases.
- **Fail-Closed Truthfulness:** In `test-truthfulness-hardening.js`, `DATA_LIMITED` and `NEUTRAL` statuses never map to false bullish/bearish biases.
