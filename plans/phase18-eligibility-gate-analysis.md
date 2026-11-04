# FEF CORTEX Phase 18 — 21 Eligibility Gates Audit & Analysis

**Project**: FEF CORTEX
**Branch**: `recovery-v122-agents`
**Operating Mode**: `CANONICAL_EXECUTION_MODE = 'READ_ONLY'`
**Date**: November 3, 2026
**Status**: COMPLETE AUDIT OF GATES 1 THROUGH 21

---

## 1. Executive Summary

FEF CORTEX enforces a sequential, 21-gate institutional verification pipeline (`evaluateSignalEligibility` in `src/lib/telegram/telegram-signal-eligibility.ts`) before any setup can be enqueued or broadcast to `@forexmetalsignals`.

This audit systematically examined every gate's inputs, preconditions, calculation logic, failure codes, and downstream impacts.

---

## 2. Gate-by-Gate Specification & Verification

| Gate # | Name | Verification Condition | Rejection Code | Live Failure Mode Observed | Audit Status |
|:---:|---|---|---|---|:---:|
| **1** | Symbol Validity | Canonical symbol in `MARKET_REGISTRY` | `REJECTED_UNSUPPORTED` | None (symbols match registry) | **VERIFIED HEALTHY** |
| **2** | Direction Validity | Direction mapped to `BUY` or `SELL` | `REJECTED_INVALID_DIRECTION` | Fails when direction is `WAIT` | **VERIFIED HEALTHY** |
| **3** | Setup ID Presence | `setup.setupId` exists and is non-empty | `REJECTED_INCOMPLETE` | None | **VERIFIED HEALTHY** |
| **4** | Lifecycle State | Lifecycle in `['VALIDATED', 'ARMED', 'SETUP_FORMING']` | `REJECTED_INCOMPLETE` | Held at `FORMING` when TP2 missing | **VERIFIED HEALTHY** |
| **5** | Entry Zone Bounds | Entry high/low $> 0$, high $\ge$ low | `REJECTED_GEOMETRY` | None | **VERIFIED HEALTHY** |
| **6** | Price Proximity | Live price within reasonable distance of entry zone | `REJECTED_PRICE_MISMATCH` | None | **VERIFIED HEALTHY** |
| **7** | TP1 Existence | Primary target index 1 exists | `REJECTED_INCOMPLETE` | None | **VERIFIED HEALTHY** |
| **8** | TP1 Direction | TP1 above entry (BUY) or below entry (SELL) | `REJECTED_GEOMETRY` | None | **VERIFIED HEALTHY** |
| **9** | Stop Loss Bounds | Stop loss $> 0$ and risk distance $> 0$ | `REJECTED_INCOMPLETE` | None | **VERIFIED HEALTHY** |
| **10** | Stop Loss Direction | SL below entry (BUY) or above entry (SELL) | `REJECTED_GEOMETRY` | None | **VERIFIED HEALTHY** |
| **11** | Mandatory TP2 Qualification | TP2 exists, valid price/distance, correct side of entry & TP1, $TP2\_RR \ge 2.0$ | `REJECTED_RR` | Correctly rejected `EURUSD` (1.53R) | **VERIFIED HEALTHY** |
| **12** | Decision Confidence | `decision.confidence >= 70%` | `REJECTED_UNCONFIRMED` | **BOTTLENECK**: Artificial 0% confidence caused by `WAIT` override | **DEFECT PINPOINTED** |
| **13** | Evidence Completeness | `decision.evidenceCompleteness >= 75%` | `REJECTED_INCOMPLETE` | Passes when technical domains active | **VERIFIED HEALTHY** |
| **14** | Bias Alignment | `decision.bias` matches setup direction, not `WAIT` | `REJECTED_BIAS_MISMATCH` | **BOTTLENECK**: Artificial `WAIT` posture override | **DEFECT PINPOINTED** |
| **15** | Decision Maturity | Maturity $\ge$ `SETUP_FORMING` | `REJECTED_MATURITY` | None | **VERIFIED HEALTHY** |
| **16** | Active Hard Vetoes | Zero hard vetoes from Risk Guardian / Data Sentinel | `REJECTED_VETO` | None | **VERIFIED HEALTHY** |
| **17** | Quote Freshness | Quote age $\le 30\text{s}$ | `REJECTED_STALE_DATA` | None in local live bridge (< 6s) | **VERIFIED HEALTHY** |
| **18** | Idempotency | No duplicate `symbol_setupId_revision` | `REJECTED_DUPLICATE` | Deduplication active in SQLite | **VERIFIED HEALTHY** |
| **19** | Channel Destination | Strict lock to `@forexmetalsignals` | `REJECTED_DESTINATION` | None | **VERIFIED HEALTHY** |
| **20** | Caption Length | Caption $\le 1024$ characters | `REJECTED_CAPTION_OVERFLOW` | None | **VERIFIED HEALTHY** |
| **21** | System Broadcast State | `TELEGRAM_SIGNAL_ENABLED=true` | `DISABLED` | None (enabled in production) | **VERIFIED HEALTHY** |

---

## 3. Analysis of Gate Bottlenecks

1. **Gate 12 & Gate 14 Failure Cascade**:
   - The gates themselves (`telegram-signal-eligibility.ts`) have clean, correct validation logic.
   - However, their inputs from `multi-asset-pipeline.ts` were systematically corrupted:
     - When external paid feeds (news, sentiment, COT) were unavailable, `multi-asset-pipeline.ts` forced `effectiveSetupDirection = 'WAIT'` because `coveredFamilies.length < 4`.
     - When `effectiveSetupDirection === 'WAIT'`, line 2535 forced `profileConfidence = 0`.
     - Consequently, whenever `evaluateSignalEligibility` was called, Gate 12 immediately rejected with `REJECTED_UNCONFIRMED` (confidence $0\% < 70\%$) or Gate 14 rejected with `REJECTED_BIAS_MISMATCH` (bias `WAIT` vs setup direction).

2. **Integrity of Gate 11 (Mandatory TP2 Qualification)**:
   - Phase 17's strict TP2 qualification rule is working exactly as intended.
   - For example, `EURUSD` generated a structural blueprint with TP1 = 1.11899 and TP2 = 1.11853 ($R:R = 1.53$). Gate 11 correctly rejected this candidate with `REJECTED_RR`, refusing to broadcast a sub-2.0 R:R setup.
   - Gate 11 will remain untouched and strictly enforced.
