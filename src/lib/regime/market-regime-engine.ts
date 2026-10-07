/**
 * FEF CORTEX — DETERMINISTIC MARKET REGIME ENGINE
 * Milestone E Clean-Room Implementation
 * 
 * Rules:
 * 1. Zero execution authority: analytical regime classifications only.
 * 2. Multi-dimensional regime classification:
 *    - Trend: TRENDING_BULLISH | TRENDING_BEARISH | RANGING | COMPRESSION | EXPANSION | UNKNOWN
 *    - Volatility: HIGH_VOLATILITY | NORMAL_VOLATILITY | LOW_VOLATILITY | UNKNOWN
 *    - Risk Appetite: RISK_ON | RISK_OFF | MIXED_RISK | UNKNOWN
 *    - Macro Environment: INFLATIONARY | DISINFLATIONARY | RESTRICTIVE | EASING | MIXED_MACRO | UNKNOWN
 *    - Liquidity State: EXPANDING | CONTRACTING | BALANCED | UNKNOWN
 * 3. Never invents unavailable data: missing inputs gracefully drop confidence and report UNKNOWN.
 */

export type TrendRegime =
  | 'TRENDING_BULLISH'
  | 'TRENDING_BEARISH'
  | 'RANGING'
  | 'COMPRESSION'
  | 'EXPANSION'
  | 'UNKNOWN';

export type VolatilityRegime =
  | 'HIGH_VOLATILITY'
  | 'NORMAL_VOLATILITY'
  | 'LOW_VOLATILITY'
  | 'UNKNOWN';

export type RiskRegime =
  | 'RISK_ON'
  | 'RISK_OFF'
  | 'MIXED_RISK'
  | 'UNKNOWN';

export type MacroRegimeType =
  | 'INFLATIONARY'
  | 'DISINFLATIONARY'
  | 'RESTRICTIVE'
  | 'EASING'
  | 'MIXED_MACRO'
  | 'UNKNOWN';

export type LiquidityRegime =
  | 'EXPANDING'
  | 'CONTRACTING'
  | 'BALANCED'
  | 'UNKNOWN';

export interface MarketRegimeInputs {
  instrument: string;
  
  // Technical / Price inputs (e.g. from OHLC / Market Structure)
  adx?: number;
  atr?: number;
  historicalAtrAverage?: number;
  bollingerBandWidth?: number;
  swingTrend?: 'BULLISH' | 'BEARISH' | 'RANGING';
  
  // Macro inputs (e.g. from FRED / Macro Engine)
  tenYearYieldBpChange?: number;
  realYieldBpChange?: number;
  breakevenBpChange?: number;
  fedPolicyState?: 'RESTRICTIVE_CONTEXT' | 'EASING_CONTEXT' | 'STABLE_POLICY';
  
  // Cross-Asset inputs (e.g. Equities / Oil)
  equityReturnPct?: number; // e.g. US500
  oilReturnPct?: number;   // e.g. USOIL
}

export interface MarketRegimeAssessment {
  instrument: string;
  trendRegime: TrendRegime;
  volatilityRegime: VolatilityRegime;
  riskRegime: RiskRegime;
  macroRegime: MacroRegimeType;
  liquidityRegime: LiquidityRegime;
  
  regimeSummary: string;
  confidence: number;      // 0 to 100 based on input availability
  evidenceCount: number;
  missingInputs: string[];
  assessedAt: number;      // Epoch ms
}

export function classifyMarketRegime(inputs: MarketRegimeInputs): MarketRegimeAssessment {
  const missingInputs: string[] = [];
  let availableWeight = 0;

  // 1. Trend Regime Classification
  let trendRegime: TrendRegime = 'UNKNOWN';
  if (inputs.swingTrend) {
    availableWeight += 0.25;
    if (inputs.swingTrend === 'BULLISH') {
      trendRegime = 'TRENDING_BULLISH';
    } else if (inputs.swingTrend === 'BEARISH') {
      trendRegime = 'TRENDING_BEARISH';
    } else {
      trendRegime = 'RANGING';
    }

    if (inputs.adx !== undefined) {
      availableWeight += 0.10;
      if (inputs.adx < 20) {
        trendRegime = 'COMPRESSION';
      } else if (inputs.adx > 35 && trendRegime !== 'RANGING') {
        trendRegime = 'EXPANSION';
      }
    }
  } else {
    missingInputs.push('Swing Trend / Market Structure');
  }

  // 2. Volatility Regime Classification
  let volatilityRegime: VolatilityRegime = 'UNKNOWN';
  if (inputs.atr !== undefined && inputs.historicalAtrAverage !== undefined && inputs.historicalAtrAverage > 0) {
    availableWeight += 0.20;
    const ratio = inputs.atr / inputs.historicalAtrAverage;
    if (ratio > 1.30) {
      volatilityRegime = 'HIGH_VOLATILITY';
    } else if (ratio < 0.75) {
      volatilityRegime = 'LOW_VOLATILITY';
    } else {
      volatilityRegime = 'NORMAL_VOLATILITY';
    }
  } else {
    missingInputs.push('ATR / Historical Volatility Baseline');
  }

  // 3. Macro Regime Classification
  let macroRegime: MacroRegimeType = 'UNKNOWN';
  if (inputs.realYieldBpChange !== undefined || inputs.breakevenBpChange !== undefined || inputs.fedPolicyState) {
    availableWeight += 0.25;
    const beChange = inputs.breakevenBpChange ?? 0;
    const ryChange = inputs.realYieldBpChange ?? 0;

    if (beChange >= 2.0) {
      macroRegime = 'INFLATIONARY';
    } else if (beChange <= -2.0) {
      macroRegime = 'DISINFLATIONARY';
    } else if (inputs.fedPolicyState === 'RESTRICTIVE_CONTEXT' || ryChange > 5.0) {
      macroRegime = 'RESTRICTIVE';
    } else if (inputs.fedPolicyState === 'EASING_CONTEXT' || ryChange < -5.0) {
      macroRegime = 'EASING';
    } else {
      macroRegime = 'MIXED_MACRO';
    }
  } else {
    missingInputs.push('Macro Rates / Breakevens');
  }

  // 4. Risk Appetite Classification
  let riskRegime: RiskRegime = 'UNKNOWN';
  if (inputs.equityReturnPct !== undefined) {
    availableWeight += 0.20;
    if (inputs.equityReturnPct > 0.5) {
      riskRegime = 'RISK_ON';
    } else if (inputs.equityReturnPct < -0.5) {
      riskRegime = 'RISK_OFF';
    } else {
      riskRegime = 'MIXED_RISK';
    }
  } else {
    missingInputs.push('Cross-Asset Equity Beta (US500)');
  }

  // 5. Liquidity Regime Classification (derived from volatility and trend)
  let liquidityRegime: LiquidityRegime = 'BALANCED';
  if (volatilityRegime === 'HIGH_VOLATILITY' && (trendRegime === 'EXPANSION' || trendRegime === 'TRENDING_BULLISH')) {
    liquidityRegime = 'EXPANDING';
  } else if (volatilityRegime === 'LOW_VOLATILITY' && trendRegime === 'COMPRESSION') {
    liquidityRegime = 'CONTRACTING';
  }

  const confidence = Math.min(100, Math.round(availableWeight * 100));

  // Summary
  const regimeSummary = availableWeight > 0
    ? `Regime: ${trendRegime} • Volatility: ${volatilityRegime} • Macro: ${macroRegime} • Risk: ${riskRegime}`
    : 'Insufficient market data to compute deterministic regime.';

  return {
    instrument: inputs.instrument,
    trendRegime,
    volatilityRegime,
    riskRegime,
    macroRegime,
    liquidityRegime,
    regimeSummary,
    confidence,
    evidenceCount: 5 - missingInputs.length,
    missingInputs,
    assessedAt: Date.now(),
  };
}

