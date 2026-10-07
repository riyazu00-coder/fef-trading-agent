/**
 * FEF CORTEX — XAUUSD MACRO EVIDENCE ASSEMBLER
 * Sprint 1C Clean-Room Implementation
 * 
 * Invariants:
 * 1. Assembles multi-factor macroeconomic evidence for XAUUSD (Gold).
 * 2. ZERO TRADE SIGNALS: outputs macroBias (BULLISH/BEARISH/MIXED/NEUTRAL/DATA_LIMITED).
 *    NEVER outputs BUY, SELL, WATCH FOR BUY, or order instructions.
 * 3. Conflict preservation: when indicators disagree (e.g. falling real yields vs rising nominal yields),
 *    both are retained in bullishEvidence and bearishEvidence, conflictingEvidence is logged,
 *    and confidence is appropriately dampened.
 * 4. Explicit weights:
 *    - Real Yield (DFII10): 40% (primary fundamental opportunity cost)
 *    - 10Y Nominal Yield (DGS10): 25% (benchmark discount rate)
 *    - Breakeven Inflation (T10YIE): 15% (inflation hedge proxy)
 *    - Yield Curve Spread (10Y-2Y): 10% (regime / recession signal)
 *    - Fed Policy Rate (DFEDTARU): 10% (opportunity cost context)
 * 5. DXY is strictly represented as missingEvidence when absent, lowering coverage
 *    without erasing valid rate evidence.
 * 6. Deterministic confidence & trust scoring: 0 confidence on zero evidence.
 */

import { FedPolicyIntelligence, MacroEvidenceItem, MacroSeriesAnalysis, XauusdMacroEvidence, YieldCurveIntelligence } from './types';

export interface XauusdAssemblerInputs {
  realYieldAnalysis?: MacroSeriesAnalysis;      // DFII10
  nominal10YAnalysis?: MacroSeriesAnalysis;    // DGS10
  nominal2YAnalysis?: MacroSeriesAnalysis;     // DGS2
  breakevenAnalysis?: MacroSeriesAnalysis;     // T10YIE
  yieldCurve?: YieldCurveIntelligence;
  fedPolicy?: FedPolicyIntelligence;
  hasDxyProvider?: boolean;
}

export const MACRO_WEIGHTS = {
  REAL_YIELD: 0.40,
  NOMINAL_10Y: 0.25,
  BREAKEVEN: 0.15,
  YIELD_CURVE: 0.10,
  FED_POLICY: 0.10,
} as const;

export function assembleXauusdMacroEvidence(inputs: XauusdAssemblerInputs): XauusdMacroEvidence {
  const bullishEvidence: MacroEvidenceItem[] = [];
  const bearishEvidence: MacroEvidenceItem[] = [];
  const neutralEvidence: MacroEvidenceItem[] = [];
  const conflictingEvidence: string[] = [];
  const missingEvidence: string[] = [];
  const seriesCoverage: string[] = [];

  let totalActiveWeight = 0;
  let bullishWeight = 0;
  let bearishWeight = 0;

  // 1. Real Yield (DFII10) — Primary Weight (40%)
  if (inputs.realYieldAnalysis && inputs.realYieldAnalysis.analysisStatus === 'VALID') {
    const rya = inputs.realYieldAnalysis;
    seriesCoverage.push(rya.seriesId);

    // If sufficiently stale (> maxAgeHoursAging), exclude from current directional inference
    if (rya.freshness === 'STALE') {
      missingEvidence.push(`${rya.seriesId} is STALE (${rya.freshnessReason}); excluded from current directional bias.`);
    } else {
      totalActiveWeight += MACRO_WEIGHTS.REAL_YIELD;
      const bpChange = rya.change1Bp ?? 0;

      if (rya.direction === 'FALLING') {
        bullishWeight += MACRO_WEIGHTS.REAL_YIELD;
        bullishEvidence.push({
          id: `macro-xau-ry-${rya.seriesId}`,
          factor: 'REAL_YIELD',
          seriesId: rya.seriesId,
          polarity: 'BULLISH',
          claim: `Falling 10Y Real Yield (${rya.latestValue}%, ${bpChange > 0 ? '+' : ''}${bpChange} bp) reduces opportunity cost of holding non-yielding gold.`,
          value: rya.latestValue,
          unit: '%',
          changeBp: bpChange,
          weight: MACRO_WEIGHTS.REAL_YIELD,
          relevance: 'Primary macroeconomic valuation anchor for gold.',
          observationDate: rya.latestObservationDate,
          provider: rya.provider,
          classification: rya.classification,
          freshness: rya.freshness,
        });
      } else if (rya.direction === 'RISING') {
        bearishWeight += MACRO_WEIGHTS.REAL_YIELD;
        bearishEvidence.push({
          id: `macro-xau-ry-${rya.seriesId}`,
          factor: 'REAL_YIELD',
          seriesId: rya.seriesId,
          polarity: 'BEARISH',
          claim: `Rising 10Y Real Yield (${rya.latestValue}%, +${bpChange} bp) increases opportunity cost of holding non-yielding gold.`,
          value: rya.latestValue,
          unit: '%',
          changeBp: bpChange,
          weight: MACRO_WEIGHTS.REAL_YIELD,
          relevance: 'Primary macroeconomic valuation anchor for gold.',
          observationDate: rya.latestObservationDate,
          provider: rya.provider,
          classification: rya.classification,
          freshness: rya.freshness,
        });
      } else {
        neutralEvidence.push({
          id: `macro-xau-ry-${rya.seriesId}`,
          factor: 'REAL_YIELD',
          seriesId: rya.seriesId,
          polarity: 'NEUTRAL',
          claim: `10Y Real Yield is flat at ${rya.latestValue}% (${bpChange >= 0 ? '+' : ''}${bpChange} bp). Neutral fundamental pressure.`,
          value: rya.latestValue,
          unit: '%',
          changeBp: bpChange,
          weight: MACRO_WEIGHTS.REAL_YIELD,
          relevance: 'Primary macroeconomic valuation anchor for gold.',
          observationDate: rya.latestObservationDate,
          provider: rya.provider,
          classification: rya.classification,
          freshness: rya.freshness,
        });
      }
    }
  } else {
    missingEvidence.push('10-Year Real Yield (DFII10) is unavailable or has insufficient data.');
  }

  // 2. Nominal 10Y Yield (DGS10) — Weight (25%)
  if (inputs.nominal10YAnalysis && inputs.nominal10YAnalysis.analysisStatus === 'VALID') {
    const nya = inputs.nominal10YAnalysis;
    seriesCoverage.push(nya.seriesId);

    if (nya.freshness === 'STALE') {
      missingEvidence.push(`${nya.seriesId} is STALE; excluded from directional bias.`);
    } else {
      totalActiveWeight += MACRO_WEIGHTS.NOMINAL_10Y;
      const bpChange = nya.change1Bp ?? 0;

      if (nya.direction === 'FALLING') {
        bullishWeight += MACRO_WEIGHTS.NOMINAL_10Y;
        bullishEvidence.push({
          id: `macro-xau-nom-${nya.seriesId}`,
          factor: 'NOMINAL_YIELD',
          seriesId: nya.seriesId,
          polarity: 'BULLISH',
          claim: `Falling 10Y Treasury Yield (${nya.latestValue}%, ${bpChange > 0 ? '+' : ''}${bpChange} bp) provides macro tailwind.`,
          value: nya.latestValue,
          unit: '%',
          changeBp: bpChange,
          weight: MACRO_WEIGHTS.NOMINAL_10Y,
          relevance: 'Benchmark sovereign interest rate and USD financing cost.',
          observationDate: nya.latestObservationDate,
          provider: nya.provider,
          classification: nya.classification,
          freshness: nya.freshness,
        });
      } else if (nya.direction === 'RISING') {
        bearishWeight += MACRO_WEIGHTS.NOMINAL_10Y;
        bearishEvidence.push({
          id: `macro-xau-nom-${nya.seriesId}`,
          factor: 'NOMINAL_YIELD',
          seriesId: nya.seriesId,
          polarity: 'BEARISH',
          claim: `Rising 10Y Treasury Yield (${nya.latestValue}%, +${bpChange} bp) exerts macro pressure on gold.`,
          value: nya.latestValue,
          unit: '%',
          changeBp: bpChange,
          weight: MACRO_WEIGHTS.NOMINAL_10Y,
          relevance: 'Benchmark sovereign interest rate and USD financing cost.',
          observationDate: nya.latestObservationDate,
          provider: nya.provider,
          classification: nya.classification,
          freshness: nya.freshness,
        });
      } else {
        neutralEvidence.push({
          id: `macro-xau-nom-${nya.seriesId}`,
          factor: 'NOMINAL_YIELD',
          seriesId: nya.seriesId,
          polarity: 'NEUTRAL',
          claim: `10Y Treasury Yield flat at ${nya.latestValue}%. Neutral rate backdrop.`,
          value: nya.latestValue,
          unit: '%',
          changeBp: bpChange,
          weight: MACRO_WEIGHTS.NOMINAL_10Y,
          relevance: 'Benchmark sovereign interest rate and USD financing cost.',
          observationDate: nya.latestObservationDate,
          provider: nya.provider,
          classification: nya.classification,
          freshness: nya.freshness,
        });
      }
    }
  } else {
    missingEvidence.push('10-Year Treasury Yield (DGS10) is unavailable or has insufficient data.');
  }

  // 3. Breakeven Inflation (T10YIE) — Weight (15%)
  if (inputs.breakevenAnalysis && inputs.breakevenAnalysis.analysisStatus === 'VALID') {
    const bia = inputs.breakevenAnalysis;
    seriesCoverage.push(bia.seriesId);

    if (bia.freshness === 'STALE') {
      missingEvidence.push(`${bia.seriesId} is STALE; excluded from directional bias.`);
    } else {
      totalActiveWeight += MACRO_WEIGHTS.BREAKEVEN;
      const bpChange = bia.change1Bp ?? 0;

      if (bia.direction === 'RISING') {
        bullishWeight += MACRO_WEIGHTS.BREAKEVEN;
        bullishEvidence.push({
          id: `macro-xau-bei-${bia.seriesId}`,
          factor: 'BREAKEVEN_INFLATION',
          seriesId: bia.seriesId,
          polarity: 'BULLISH',
          claim: `Rising market-implied 10Y breakeven inflation (${bia.latestValue}%, +${bpChange} bp) supports gold inflation hedge demand.`,
          value: bia.latestValue,
          unit: '%',
          changeBp: bpChange,
          weight: MACRO_WEIGHTS.BREAKEVEN,
          relevance: 'Market-implied 10-year inflation expectations from TIPS breakeven (not realized CPI).',
          observationDate: bia.latestObservationDate,
          provider: bia.provider,
          classification: bia.classification,
          freshness: bia.freshness,
        });
      } else if (bia.direction === 'FALLING') {
        bearishWeight += MACRO_WEIGHTS.BREAKEVEN;
        bearishEvidence.push({
          id: `macro-xau-bei-${bia.seriesId}`,
          factor: 'BREAKEVEN_INFLATION',
          seriesId: bia.seriesId,
          polarity: 'BEARISH',
          claim: `Falling market-implied 10Y breakeven inflation (${bia.latestValue}%, ${bpChange} bp) moderates inflation hedge premium.`,
          value: bia.latestValue,
          unit: '%',
          changeBp: bpChange,
          weight: MACRO_WEIGHTS.BREAKEVEN,
          relevance: 'Market-implied 10-year inflation expectations from TIPS breakeven (not realized CPI).',
          observationDate: bia.latestObservationDate,
          provider: bia.provider,
          classification: bia.classification,
          freshness: bia.freshness,
        });
      } else {
        neutralEvidence.push({
          id: `macro-xau-bei-${bia.seriesId}`,
          factor: 'BREAKEVEN_INFLATION',
          seriesId: bia.seriesId,
          polarity: 'NEUTRAL',
          claim: `10Y breakeven inflation flat at ${bia.latestValue}%. Stable expectations.`,
          value: bia.latestValue,
          unit: '%',
          changeBp: bpChange,
          weight: MACRO_WEIGHTS.BREAKEVEN,
          relevance: 'Market-implied 10-year inflation expectations from TIPS breakeven.',
          observationDate: bia.latestObservationDate,
          provider: bia.provider,
          classification: bia.classification,
          freshness: bia.freshness,
        });
      }
    }
  } else {
    missingEvidence.push('10-Year Breakeven Inflation (T10YIE) is unavailable or has insufficient data.');
  }

  // 4. Yield Curve Spread (10Y-2Y) — Weight (10%)
  if (inputs.yieldCurve && inputs.yieldCurve.status === 'VALID') {
    const yc = inputs.yieldCurve;
    seriesCoverage.push('10Y-2Y-SPREAD');
    totalActiveWeight += MACRO_WEIGHTS.YIELD_CURVE;

    if (yc.curveState === 'INVERTED') {
      // Inverted curve historically signals macro recession risk; gold often functions as counter-cyclical safe haven
      bullishWeight += MACRO_WEIGHTS.YIELD_CURVE * 0.5;
      bullishEvidence.push({
        id: 'macro-xau-yc-inverted',
        factor: 'YIELD_CURVE',
        seriesId: '10Y-2Y',
        polarity: 'BULLISH',
        claim: `Yield curve remains inverted (${yc.spreadBp} bp), indicating ongoing macro cycle distortion and safe-haven context.`,
        value: yc.spreadBp,
        unit: 'bp',
        weight: MACRO_WEIGHTS.YIELD_CURVE,
        relevance: 'Macroeconomic regime context (not a direct timing trigger).',
        observationDate: yc.observationDate,
        provider: yc.provider,
        classification: yc.classification,
        freshness: yc.freshness,
      });
    } else {
      neutralEvidence.push({
        id: 'macro-xau-yc-normal',
        factor: 'YIELD_CURVE',
        seriesId: '10Y-2Y',
        polarity: 'NEUTRAL',
        claim: `Yield curve is ${yc.curveState.toLowerCase()} (${yc.spreadBp} bp, ${yc.curveDirection.toLowerCase()}).`,
        value: yc.spreadBp,
        unit: 'bp',
        weight: MACRO_WEIGHTS.YIELD_CURVE,
        relevance: 'Macroeconomic regime context.',
        observationDate: yc.observationDate,
        provider: yc.provider,
        classification: yc.classification,
        freshness: yc.freshness,
      });
    }
  } else {
    missingEvidence.push('Yield Curve (10Y-2Y Spread) is unavailable or unverified.');
  }

  // 5. Fed Policy Corridor — Weight (10%)
  if (inputs.fedPolicy && inputs.fedPolicy.status === 'VALID') {
    const fp = inputs.fedPolicy;
    seriesCoverage.push('FED_CORRIDOR');
    totalActiveWeight += MACRO_WEIGHTS.FED_POLICY;

    neutralEvidence.push({
      id: 'macro-xau-fed-corridor',
      factor: 'FED_POLICY',
      seriesId: 'DFEDTARU/L',
      polarity: 'NEUTRAL',
      claim: `Fed policy target corridor is ${fp.targetLower}% - ${fp.targetUpper}% (${fp.policyState}). Contextual policy backdrop.`,
      value: fp.targetMidpoint,
      unit: '%',
      weight: MACRO_WEIGHTS.FED_POLICY,
      relevance: 'Monetary policy target range (descriptive context, no prediction made).',
      observationDate: fp.observationDate,
      provider: fp.provider,
      classification: fp.classification,
      freshness: fp.freshness,
    });
  } else {
    missingEvidence.push('Fed Policy Target Corridor is unavailable.');
  }

  // 6. Explicit DXY Check (Must be marked UNAVAILABLE when no verified DXY provider exists)
  if (!inputs.hasDxyProvider) {
    missingEvidence.push('US Dollar Index (DXY) is UNAVAILABLE (no verified official DXY provider connected; zero synthetic data).');
  }

  // Check for Conflicting Evidence
  if (bullishEvidence.length > 0 && bearishEvidence.length > 0) {
    conflictingEvidence.push(
      `Macro conflict detected: ${bullishEvidence.length} factor(s) supportive vs ${bearishEvidence.length} headwind factor(s). Real yield vs nominal rates divergence.`
    );
  }

  // Determine Data Readiness
  const providerCoverage = Math.round(totalActiveWeight * 100) / 100;
  let dataReadiness: 'READY' | 'PARTIAL' | 'DATA_LIMITED' | 'UNAVAILABLE' = 'DATA_LIMITED';

  if (totalActiveWeight >= 0.70) {
    dataReadiness = 'READY';
  } else if (totalActiveWeight >= 0.35) {
    dataReadiness = 'PARTIAL';
  } else if (totalActiveWeight > 0) {
    dataReadiness = 'DATA_LIMITED';
  } else {
    dataReadiness = 'UNAVAILABLE';
  }

  // Determine Macro Bias
  let macroBias: 'BULLISH' | 'BEARISH' | 'MIXED' | 'NEUTRAL' | 'DATA_LIMITED' = 'DATA_LIMITED';

  if (totalActiveWeight === 0) {
    macroBias = 'DATA_LIMITED';
  } else if (bullishWeight > 0.20 && bearishWeight > 0.20) {
    macroBias = 'MIXED';
  } else if (bullishWeight >= 0.25 && bullishWeight > bearishWeight * 1.5) {
    macroBias = 'BULLISH';
  } else if (bearishWeight >= 0.25 && bearishWeight > bullishWeight * 1.5) {
    macroBias = 'BEARISH';
  } else if (bullishWeight > 0 || bearishWeight > 0) {
    macroBias = 'MIXED';
  } else {
    macroBias = 'NEUTRAL';
  }

  // Deterministic Confidence Calculation (0 - 100)
  // Confidence combines coverage, evidence agreement, and conflict penalty
  let confidence = 0;
  if (totalActiveWeight > 0) {
    // Base confidence scales with active weight coverage (max 70)
    confidence = totalActiveWeight * 70;

    // Agreement bonus: if unambiguous directional alignment (+20)
    if (macroBias === 'BULLISH' && bearishEvidence.length === 0) {
      confidence += 20;
    } else if (macroBias === 'BEARISH' && bullishEvidence.length === 0) {
      confidence += 20;
    }

    // Conflict penalty: if mixed/conflicting (-25)
    if (conflictingEvidence.length > 0 || macroBias === 'MIXED') {
      confidence = Math.max(10, confidence - 25);
    }

    // Clamp between 0 and 95 (macro is probabilistic evidence, never 100)
    confidence = Math.min(95, Math.max(0, Math.round(confidence)));
  }

  // Deterministic Evidence Trust (0 - 100)
  // Trust measures provenance purity and freshness
  let evidenceTrust = 0;
  if (totalActiveWeight > 0) {
    evidenceTrust = 85; // All active series are INDEPENDENT_VERIFIED from FRED
    // Penalty if any active factor is AGING
    const anyAging = [...bullishEvidence, ...bearishEvidence, ...neutralEvidence].some(
      (e) => e.freshness === 'AGING'
    );
    if (anyAging) {
      evidenceTrust -= 15;
    }
  }

  // Worst-case overall freshness
  const allEv = [...bullishEvidence, ...bearishEvidence, ...neutralEvidence];
  const isAnyStale = allEv.some((e) => e.freshness === 'STALE');
  const isAnyAging = allEv.some((e) => e.freshness === 'AGING');
  const freshness = allEv.length === 0 ? 'UNAVAILABLE' : isAnyStale ? 'STALE' : isAnyAging ? 'AGING' : 'CURRENT';

  // Summary Reasoning
  let reasoningSummary = '';
  if (macroBias === 'DATA_LIMITED' || totalActiveWeight === 0) {
    reasoningSummary = 'Insufficient macroeconomic telemetry available to formulate directional gold posture.';
  } else if (macroBias === 'BULLISH') {
    reasoningSummary = `Macro factors present supportive posture for XAUUSD (coverage ${(providerCoverage * 100).toFixed(0)}%). Key driver: ${bullishEvidence[0]?.claim || 'Falling yields'}.`;
  } else if (macroBias === 'BEARISH') {
    reasoningSummary = `Macro factors present headwind posture for XAUUSD (coverage ${(providerCoverage * 100).toFixed(0)}%). Key driver: ${bearishEvidence[0]?.claim || 'Rising yields'}.`;
  } else if (macroBias === 'MIXED') {
    reasoningSummary = `Macro factors present mixed/conflicting posture for XAUUSD (supportive vs headwind components). Disagreement preserved.`;
  } else {
    reasoningSummary = 'Macro factors show flat or balanced conditions across Treasury yields and inflation expectations.';
  }

  return {
    instrument: 'XAUUSD',
    macroBias,
    dataReadiness,
    confidence,
    evidenceTrust,
    bullishEvidence,
    bearishEvidence,
    neutralEvidence,
    conflictingEvidence,
    missingEvidence,
    freshness,
    providerCoverage,
    seriesCoverage,
    reasoningSummary,
    assembledAt: Date.now(),
  };
}

