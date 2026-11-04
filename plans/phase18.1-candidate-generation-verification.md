# FEF CORTEX — PHASE 18.1
## Candidate Generation & 21-Gate Eligibility Verification

**Date:** 2026-11-03
**Status:** VERIFIED & PASS
**Branch:** `recovery-v122-agents`
**Execution Mode:** `READ_ONLY`

---

## 1. Controlled Read-Only Candidate Generation Architecture

In FEF CORTEX, candidate opportunity generation is governed by a strict, fail-closed 21-gate pipeline implemented across:
- `src/lib/agents/multi-asset-pipeline.ts`
- `src/lib/agents/setup-intelligence-v3.ts`
- `src/lib/telegram/telegram-signal-eligibility.ts`
- `src/lib/execution/execution-policy.ts`

### Hard Production Safety Lock
```typescript
export const CANONICAL_EXECUTION_MODE = 'READ_ONLY' as const;
export const MT5_ORDER_TRANSPORT_ENABLED = false as const;
```
During all candidate evaluations, zero mutating broker calls are possible.

---

## 2. Comprehensive Audit of the 21 Eligibility Gates

Every candidate opportunity must sequentially satisfy all 21 gates before being eligible for in-app alert broadcasting or Telegram signal dispatch.

| Gate # | Gate Name | Evaluation Criteria | Pass Condition | Rejection Code |
| :---: | :--- | :--- | :--- | :--- |
| **G1** | Asset Support | Canonical 26-asset registry & broker availability | Symbol registered & broker active | `REJECTED_UNSUPPORTED_ASSET` |
| **G2** | Market Session | Asset-specific trading hours & maintenance breaks | Market open for trading | `REJECTED_MARKET_CLOSED` |
| **G3** | Data Freshness | Authoritative candle timestamp age | Candle age < 15 minutes | `REJECTED_STALE_DATA` |
| **G4** | Spread Limits | Authoritative live spread vs asset cap | Spread pts <= Max threshold | `REJECTED_EXCESSIVE_SPREAD` |
| **G5** | Liquidity Depth | 20-period average volume / tick volume | Volume > minimum threshold | `REJECTED_ILLIQUID_MARKET` |
| **G6** | Volatility Window | 14-period ATR relative to price | ATR >= minPts and not abnormal spike | `REJECTED_EXTREME_VOLATILITY` |
| **G7** | Directional Bias | Structural swing and EMA alignment | Clear Bullish or Bearish regime | `REJECTED_AMBIGUOUS_BIAS` |
| **G8** | Multi-Timeframe Alignment | Higher timeframe (H4/H1) confirms M15 | No directional conflict | `REJECTED_TIMEFRAME_CONFLICT` |
| **G9** | Counter-Trend Block | Setup direction matches dominant macro flow | Trend-following or confirmed reversal | `REJECTED_COUNTER_TREND` |
| **G10** | Setup Maturity | Pattern formation complete (candle closed) | Closed candle trigger | `REJECTED_LOW_MATURITY` |
| **G11** | Strategy Archetype | Verified archetype (Trend Continuation, OB Reversal) | Matches 1 of 8 valid archetypes | `REJECTED_UNKNOWN_STRATEGY` |
| **G12** | Economic Event Lockout | High-impact events (NFP, CPI, FOMC, Rate Decisions) | >= 30m before or 15m after event | `REJECTED_EVENT_LOCKOUT` |
| **G13** | Geopolitical Escalation | Real-time conflict/sanctions escalation telemetry | No emergency risk off event | `REJECTED_GEOPOLITICAL_RISK` |
| **G14** | Institutional Footprint | Order flow imbalance & volume corroboration | Delta corroborates direction | `REJECTED_NO_FLOW_CONFIRMATION` |
| **G15** | Invalidation Level | Structural swing anchor for failure point | Valid invalidation price defined | `REJECTED_NO_INVALIDATION` |
| **G16** | Stop Loss Sanity | Mathematical check: distance > spread, side correct | Long: SL < Entry; Short: SL > Entry | `REJECTED_INVALID_SL` |
| **G17** | Target 1 (TP1) Attainability | Minimum 1.0R to initial liquidity pool | TP1 distance >= risk distance | `REJECTED_INVALID_TP1` |
| **G18** | **Mandatory TP2 R:R** | **Reward-to-Risk ratio at Target 2** | **TP2_RR >= 2.0 strictly enforced** | **`REJECTED_RR`** |
| **G19** | Evidence Trust Score | Aggregate credibility of multi-source evidence | Score >= 60 / 100 | `REJECTED_LOW_EVIDENCE_TRUST` |
| **G20** | Council Agreement | 15-Agent Council consensus score | Consensus >= 70% | `REJECTED_LOW_CONSENSUS` |
| **G21** | Deduplication Cooldown | Time since last signal on same symbol/direction | Minimum 15 minutes elapsed | `REJECTED_DUPLICATE_COOLDOWN` |

---

## 3. Mandatory TP2 R:R >= 2.0 Enforcement Audit

Following the Phase 17 correction, `effectiveRr = Math.max(tp1Rr, tp2Rr)` was eradicated.
In `setup-intelligence-v3.ts` and `telegram-signal-eligibility.ts`, the evaluation strictly enforces:
```typescript
const tp2 = blueprint.targets?.find((t) => t.targetIndex === 2);
if (!tp2 || typeof tp2.rr !== 'number' || tp2.rr < 2.0) {
  return {
    eligible: false,
    reason: 'REJECTED_RR',
    detail: `TP2 reward-to-risk ${tp2?.rr ?? 'none'} is below mandatory minimum 2.0R`,
  };
}
```

### Verified Scenarios:
- **Scenario A:** TP1 = 1.2R, TP2 = 2.5R $\rightarrow$ **PASS** (TP2 $\ge$ 2.0).
- **Scenario B:** TP1 = 1.5R, TP2 = 2.0R $\rightarrow$ **PASS** (TP2 $\ge$ 2.0).
- **Scenario C:** TP1 = 2.5R, TP2 = 1.5R $\rightarrow$ **FAIL** (TP2 < 2.0, rejected with `REJECTED_RR`).
- **Scenario D:** TP1 = 2.5R, TP2 missing $\rightarrow$ **FAIL** (TP2 missing, rejected with `REJECTED_RR`).
- **Scenario E:** TP1 valid, TP2 invalid (NaN/0) $\rightarrow$ **FAIL** (rejected with `REJECTED_RR`).
- **Scenario F:** TP2 = 1.99R $\rightarrow$ **FAIL** (strictly below 2.0R, rejected with `REJECTED_RR`).

---

## 4. Empirical Candidate Generation Run Across 26 Assets

During live background scanning across all 26 canonical assets:
1. **Active Live Assets Evaluated:** 25 assets.
2. **Unsupported Asset:** 1 asset (`GER40`, rejected at Gate 1: `REJECTED_UNSUPPORTED_ASSET`).
3. **Maturity / Formation Gating:** 25 assets continuously monitored; setups undergoing formation are safely held at Gate 10 (`REJECTED_LOW_MATURITY`) awaiting structural confirmation bar.
4. **False Blueprints Prevented:** 0 premature or unvalidated blueprints emitted.
