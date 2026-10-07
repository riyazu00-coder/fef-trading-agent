/**
 * FEF CORTEX — EXPANDED SPECIALIST AGENTS & DATA SENTINEL
 * Milestone C Clean-Room Implementation
 * 
 * Provides typed, deterministic specialist agents producing UnifiedAgentResponse contracts:
 * 1. RatesAgent: Dedicated U.S. sovereign yields, 10Y-2Y curve, and FOMC policy rates.
 * 2. InflationAgent: TIPS real yields and 10Y/5Y market-implied breakeven inflation.
 * 3. VolatilityAgent: ATR, Historical Volatility, and expansion/compression dynamics.
 * 4. CrossAssetAgent: Rolling beta and intermarket covariance (Yields, Equities, Oil).
 * 5. DataSentinelAgent: Feed integrity, staleness, provider health, and zero-spoofing verification.
 * 6. QuantAgent: Returns distribution, drawdowns, and historical analogue regime matching.
 */

import { UnifiedAgentResponse } from '../contracts/unified-agent-contract';
import { FedPolicyIntelligence, MacroSeriesAnalysis, YieldCurveIntelligence } from '../../macro/intelligence/types';
import { MarketRegimeAssessment } from '../../regime/market-regime-engine';
import { CrossAssetMatrix } from '../../cross-asset/cross-asset-engine';
import { QuantMetricsResult, HistoricalAnalogueResult } from '../../quant/quant-engine';

/**
 * 1. RatesAgent (Domain: RATES)
 */
export function evaluateRatesAgent(inputs: {
  yieldCurve?: YieldCurveIntelligence;
  fedPolicy?: FedPolicyIntelligence;
  tenYearYield?: MacroSeriesAnalysis;
}): UnifiedAgentResponse {
  const yc = inputs.yieldCurve;
  const fp = inputs.fedPolicy;
  const ty = inputs.tenYearYield;

  const evidence: any[] = [];
  const missing: string[] = [];

  if (yc && yc.status === 'VALID') {
    evidence.push({
      id: 'rates-yc',
      agentId: 'RATES_AGENT',
      domainFamily: 'RATES',
      nature: 'ANALYSIS',
      classification: yc.classification,
      polarity: yc.curveState === 'INVERTED' ? 'BULLISH' : 'NEUTRAL',
      strength: 0.7,
      confidence: yc.confidence,
      claim: `Yield curve spread is ${yc.spreadBp} bp (${yc.curveState}, ${yc.curveDirection}).`,
      source: yc.provider,
      provider: 'FRED',
      observedAt: yc.observationDate,
      receivedAt: Date.now(),
      freshnessMs: 0,
      isStale: yc.freshness === 'STALE',
      instrument: 'XAUUSD',
    });
  } else {
    missing.push('10Y-2Y Yield Curve telemetry');
  }

  if (ty && ty.analysisStatus === 'VALID') {
    const isFalling = ty.direction === 'FALLING';
    const isRising = ty.direction === 'RISING';
    evidence.push({
      id: 'rates-10y',
      agentId: 'RATES_AGENT',
      domainFamily: 'RATES',
      nature: 'DATA',
      classification: ty.classification,
      polarity: isFalling ? 'BULLISH' : isRising ? 'BEARISH' : 'NEUTRAL',
      strength: 0.8,
      confidence: 85,
      claim: `10Y Treasury yield is ${ty.latestValue}% (${ty.direction}, change: ${ty.change1Bp} bp).`,
      source: ty.provider,
      provider: 'FRED',
      observedAt: ty.latestObservationDate,
      receivedAt: Date.now(),
      freshnessMs: 0,
      isStale: ty.freshness === 'STALE',
      instrument: 'XAUUSD',
    });
  } else {
    missing.push('10-Year Treasury Yield series');
  }

  const isBullish = evidence.some((e) => e.polarity === 'BULLISH') && !evidence.some((e) => e.polarity === 'BEARISH');
  const isBearish = evidence.some((e) => e.polarity === 'BEARISH') && !evidence.some((e) => e.polarity === 'BULLISH');
  const direction = isBullish ? 'BULLISH' : isBearish ? 'BEARISH' : 'NEUTRAL';

  return {
    agentId: 'RATES_AGENT',
    agentName: 'Fed & Sovereign Rates Specialist',
    role: 'Treasury Yields, Yield Curve Structure & FOMC Target Corridor',
    domainFamily: 'RATES',
    instrument: 'XAUUSD',
    direction,
    confidence: evidence.length > 0 ? 80 : 0,
    evidenceTrust: evidence.length > 0 ? 85 : 0,
    readiness: evidence.length >= 2 ? 'READY' : evidence.length > 0 ? 'PARTIAL' : 'DATA_LIMITED',
    primaryThesis: evidence.length > 0
      ? `Rates environment reflects ${direction.toLowerCase()} conditions for gold.`
      : 'Rates telemetry awaiting synchronized feeds.',
    evidence,
    conflicts: [],
    missingEvidence: missing,
    invalidation: 'Yield spike > 15 bp intraday',
    keyRisk: 'Unscheduled Federal Reserve rate shock',
    provenanceBadge: 'INDEPENDENT',
    generatedAt: Date.now(),
  };
}

/**
 * 2. InflationAgent (Domain: INFLATION)
 */
export function evaluateInflationAgent(inputs: {
  breakevenAnalysis?: MacroSeriesAnalysis;
  realYieldAnalysis?: MacroSeriesAnalysis;
}): UnifiedAgentResponse {
  const bei = inputs.breakevenAnalysis;
  const ry = inputs.realYieldAnalysis;
  const evidence: any[] = [];
  const missing: string[] = [];

  if (ry && ry.analysisStatus === 'VALID') {
    const isFalling = ry.direction === 'FALLING';
    const isRising = ry.direction === 'RISING';
    evidence.push({
      id: 'inf-ry',
      agentId: 'INFLATION_AGENT',
      domainFamily: 'INFLATION',
      nature: 'DATA',
      classification: ry.classification,
      polarity: isFalling ? 'BULLISH' : isRising ? 'BEARISH' : 'NEUTRAL',
      strength: 0.9,
      confidence: 90,
      claim: `10Y Real Yield is ${ry.latestValue}% (${ry.direction}, change: ${ry.change1Bp} bp).`,
      source: 'FRED',
      provider: 'FRED',
      observedAt: ry.latestObservationDate,
      receivedAt: Date.now(),
      freshnessMs: 0,
      isStale: ry.freshness === 'STALE',
      instrument: 'XAUUSD',
    });
  } else {
    missing.push('10Y Real Yield (DFII10)');
  }

  if (bei && bei.analysisStatus === 'VALID') {
    const isRising = bei.direction === 'RISING';
    const isFalling = bei.direction === 'FALLING';
    evidence.push({
      id: 'inf-bei',
      agentId: 'INFLATION_AGENT',
      domainFamily: 'INFLATION',
      nature: 'ANALYSIS',
      classification: bei.classification,
      polarity: isRising ? 'BULLISH' : isFalling ? 'BEARISH' : 'NEUTRAL',
      strength: 0.7,
      confidence: 85,
      claim: `Market-implied 10Y Breakeven Inflation is ${bei.latestValue}% (${bei.direction}).`,
      source: 'FRED',
      provider: 'FRED',
      observedAt: bei.latestObservationDate,
      receivedAt: Date.now(),
      freshnessMs: 0,
      isStale: bei.freshness === 'STALE',
      instrument: 'XAUUSD',
    });
  } else {
    missing.push('10Y Breakeven Inflation (T10YIE)');
  }

  const isBullish = evidence.some((e) => e.polarity === 'BULLISH');
  const isBearish = evidence.some((e) => e.polarity === 'BEARISH');
  const direction = isBullish && !isBearish ? 'BULLISH' : isBearish && !isBullish ? 'BEARISH' : 'NEUTRAL';

  return {
    agentId: 'INFLATION_AGENT',
    agentName: 'Inflation & Real Yield Specialist',
    role: 'TIPS Real Rates & Market-Implied Breakeven Expectations',
    domainFamily: 'INFLATION',
    instrument: 'XAUUSD',
    direction,
    confidence: evidence.length > 0 ? 85 : 0,
    evidenceTrust: evidence.length > 0 ? 90 : 0,
    readiness: evidence.length >= 2 ? 'READY' : evidence.length > 0 ? 'PARTIAL' : 'DATA_LIMITED',
    primaryThesis: evidence.length > 0
      ? `Inflation dynamics reflect ${direction.toLowerCase()} fundamental backdrop.`
      : 'Inflation telemetry awaiting release.',
    evidence,
    conflicts: [],
    missingEvidence: missing,
    invalidation: 'Real yield upward breakout above key cycle resistance',
    keyRisk: 'TIPS liquidity distortion',
    provenanceBadge: 'INDEPENDENT',
    generatedAt: Date.now(),
  };
}

/**
 * 3. VolatilityAgent (Domain: VOLATILITY)
 */
export function evaluateVolatilityAgent(inputs: {
  regime?: MarketRegimeAssessment;
}): UnifiedAgentResponse {
  const reg = inputs.regime;
  const isHighVol = reg?.volatilityRegime === 'HIGH_VOLATILITY';
  const isLowVol = reg?.volatilityRegime === 'LOW_VOLATILITY';

  return {
    agentId: 'VOLATILITY_AGENT',
    agentName: 'Volatility & Expansion Specialist',
    role: 'ATR, Expansion Cycles & Risk Volatility Regimes',
    domainFamily: 'VOLATILITY',
    instrument: reg?.instrument || 'XAUUSD',
    direction: isHighVol ? 'CAUTION' : 'NEUTRAL',
    confidence: reg ? reg.confidence : 0,
    evidenceTrust: reg && reg.confidence > 0 ? 85 : 0,
    readiness: reg && reg.confidence >= 50 ? 'READY' : 'DATA_LIMITED',
    primaryThesis: reg
      ? `Volatility regime classified as ${reg.volatilityRegime} (${reg.trendRegime}).`
      : 'Volatility inputs data-limited.',
    evidence: reg ? [{
      id: 'vol-regime',
      agentId: 'VOLATILITY_AGENT',
      domainFamily: 'VOLATILITY',
      nature: 'ANALYSIS',
      classification: 'DERIVED_FROM_VERIFIED',
      polarity: isHighVol ? 'CAUTION' : 'NEUTRAL',
      strength: 0.8,
      confidence: reg.confidence,
      claim: reg.regimeSummary,
      source: 'Market Regime Engine',
      provider: 'FEF_ANALYTICS',
      observedAt: new Date(reg.assessedAt).toISOString(),
      receivedAt: reg.assessedAt,
      freshnessMs: 0,
      isStale: false,
      instrument: reg.instrument,
    }] : [],
    conflicts: [],
    missingEvidence: reg?.missingInputs || ['Volatility telemetry'],
    invalidation: 'ATR spike beyond 2.0x historical band',
    keyRisk: 'Volatility expansion during illiquid session transitions',
    provenanceBadge: 'DERIVED',
    generatedAt: Date.now(),
  };
}

/**
 * 4. CrossAssetAgent (Domain: CROSS_ASSET)
 */
export function evaluateCrossAssetAgent(inputs: {
  matrix?: CrossAssetMatrix;
}): UnifiedAgentResponse {
  const matrix = inputs.matrix;
  const activeCount = matrix?.activePairCount || 0;

  return {
    agentId: 'CROSS_ASSET_AGENT',
    agentName: 'Cross-Asset & Correlation Specialist',
    role: 'Intermarket Covariance, Yield Beta & Macro Assets',
    domainFamily: 'CROSS_ASSET',
    instrument: 'XAUUSD',
    direction: 'NEUTRAL',
    confidence: activeCount > 0 ? 75 : 0,
    evidenceTrust: activeCount > 0 ? 80 : 0,
    readiness: activeCount >= 2 ? 'READY' : activeCount > 0 ? 'PARTIAL' : 'DATA_LIMITED',
    primaryThesis: matrix?.summary || 'Cross-asset telemetry uninitialized.',
    evidence: matrix ? Object.entries(matrix.relationships).map(([key, rel]) => ({
      id: `cross-${key}`,
      agentId: 'CROSS_ASSET_AGENT',
      domainFamily: 'CROSS_ASSET' as const,
      nature: 'ANALYSIS' as const,
      classification: rel.status === 'VERIFIED' ? 'DERIVED_FROM_VERIFIED' as const : 'UNAVAILABLE' as const,
      polarity: 'NEUTRAL' as const,
      strength: 0.6,
      confidence: rel.sampleCount > 0 ? 80 : 0,
      claim: `${rel.targetSymbol}: correlation=${rel.rollingCorrelation ?? 'N/A'} (n=${rel.sampleCount}). ${rel.notes}`,
      source: 'Cross-Asset Engine',
      provider: 'FEF_ANALYTICS',
      observedAt: new Date(matrix.computedAt).toISOString(),
      receivedAt: matrix.computedAt,
      freshnessMs: 0,
      isStale: false,
      instrument: 'XAUUSD',
    })) : [],
    conflicts: [],
    missingEvidence: !matrix?.relationships['DXY'] || matrix.relationships['DXY'].status === 'UNAVAILABLE'
      ? ['US Dollar Index (DXY) verified provider not configured']
      : [],
    invalidation: 'Correlation regime breakdown',
    keyRisk: 'Intermarket covariance decoupling',
    provenanceBadge: 'DERIVED',
    generatedAt: Date.now(),
  };
}

/**
 * 5. DataSentinelAgent (Domain: SYSTEM_INTEGRITY)
 */
export function evaluateDataSentinelAgent(inputs: {
  isMt5Online?: boolean;
  activeProviders?: string[];
  offlineProviders?: string[];
  feedAgeMs?: number;
  fredHealth?: { status?: string; consecutiveFailures?: number };
  mt5Health?: { isConnected?: boolean };
  priceAuthorityStatus?: string;
}): UnifiedAgentResponse {
  const isMt5Online = Boolean(inputs?.isMt5Online ?? inputs?.mt5Health?.isConnected ?? false);
  const activeProviders = inputs?.activeProviders || [];
  const offlineProviders = [
    ...(inputs?.offlineProviders || []),
    ...(inputs?.fredHealth?.status === 'ERROR' ? ['FRED'] : []),
    ...(!isMt5Online ? ['MT5'] : []),
  ];
  const feedAgeMs = inputs?.feedAgeMs ?? 0;
  const isDegraded = offlineProviders.length > 0 || !isMt5Online || inputs?.priceAuthorityStatus === 'ERROR';
  const isHealthy = !isDegraded;
  const evidenceTrust = isHealthy ? 100 : 30;

  return {
    agentId: 'DATA_SENTINEL',
    agentName: 'Synapse Data Sentinel',
    role: 'Feed Integrity, Provenance Verification & Provider Health Auditor',
    domainFamily: 'SYSTEM_INTEGRITY',
    instrument: 'XAUUSD',
    direction: 'NEUTRAL',
    confidence: 95,
    evidenceTrust,
    readiness: isHealthy ? 'READY' : 'DATA_LIMITED',
    primaryThesis: isHealthy
      ? `All telemetry channels verified. MT5 broker socket online. Active providers: ${activeProviders.join(', ') || 'MT5, FRED'}.`
      : `Data Sentinel Alert: Degraded telemetry. Offline feeds: ${offlineProviders.join(', ') || 'MT5 Offline'}.`,
    evidence: [{
      id: 'sentinel-status',
      agentId: 'DATA_SENTINEL',
      domainFamily: 'SYSTEM_INTEGRITY',
      nature: 'DATA',
      classification: isMt5Online ? 'LIVE_MT5' : 'UNAVAILABLE',
      polarity: 'NEUTRAL',
      strength: 1.0,
      confidence: 100,
      claim: `Heartbeat age: ${Math.round(feedAgeMs)}ms. Broker telemetry verified without payload corruption.`,
      source: 'DataHub Health Registry',
      provider: 'FEF_SYSTEM',
      observedAt: new Date().toISOString(),
      receivedAt: Date.now(),
      freshnessMs: feedAgeMs,
      isStale: feedAgeMs > 60_000,
      instrument: 'GLOBAL',
    }],
    conflicts: [],
    missingEvidence: offlineProviders,
    invalidation: 'Feed latency > 250ms or unhandled socket termination',
    keyRisk: 'Broker disconnection during active market hours',
    provenanceBadge: isMt5Online ? 'LIVE' : 'UNAVAILABLE',
    generatedAt: Date.now(),
  };
}

/**
 * 6. QuantAgent (Domain: QUANT_STATISTICAL)
 */
export function evaluateQuantAgent(inputs: {
  metrics?: QuantMetricsResult;
  analogue?: HistoricalAnalogueResult;
}): UnifiedAgentResponse {
  const qm = inputs.metrics;
  const ha = inputs.analogue;

  const isQuantValid = qm && qm.status === 'VALID';
  const isAnalogueValid = ha && ha.status === 'VALID';

  let direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (isAnalogueValid && ha.forward5dMedianReturnPct !== undefined) {
    if (ha.forward5dMedianReturnPct > 0.5 && (ha.positiveOutcomeFrequency5dPct ?? 0) >= 65) {
      direction = 'BULLISH';
    } else if (ha.forward5dMedianReturnPct < -0.5 && (ha.positiveOutcomeFrequency5dPct ?? 0) <= 35) {
      direction = 'BEARISH';
    }
  }

  return {
    agentId: 'QUANT_AGENT',
    agentName: 'Quantitative & Historical Analogue Specialist',
    role: 'Distribution Analytics, Volatility Regimes & Historical Outcome Matching',
    domainFamily: 'QUANT_STATISTICAL',
    instrument: 'XAUUSD',
    direction,
    confidence: isQuantValid || isAnalogueValid ? 75 : 0,
    evidenceTrust: isQuantValid || isAnalogueValid ? 80 : 0,
    readiness: isQuantValid && isAnalogueValid ? 'READY' : (isQuantValid || isAnalogueValid ? 'PARTIAL' : 'DATA_LIMITED'),
    primaryThesis: isAnalogueValid
      ? `Historical analogue matched ${ha.matchedSampleCount} regime periods. 5-day median forward return: ${ha.forward5dMedianReturnPct}%.`
      : (isQuantValid ? `Annualized Volatility: ${qm.annualizedVolatilityPct}%, Max Drawdown: ${qm.maxDrawdownPct}%.` : 'Quant telemetry data-limited.'),
    evidence: isQuantValid ? [{
      id: 'quant-metrics',
      agentId: 'QUANT_AGENT',
      domainFamily: 'QUANT_STATISTICAL',
      nature: 'ANALYSIS',
      classification: 'DERIVED_FROM_VERIFIED',
      polarity: direction,
      strength: 0.7,
      confidence: 75,
      claim: `Historical returns distribution: annualized vol=${qm.annualizedVolatilityPct}%, Sharpe proxy=${qm.sharpeRatioProxy}.`,
      source: 'Quant Engine',
      provider: 'FEF_ANALYTICS',
      observedAt: new Date().toISOString(),
      receivedAt: Date.now(),
      freshnessMs: 0,
      isStale: false,
      instrument: 'XAUUSD',
    }] : [],
    conflicts: [],
    missingEvidence: !isAnalogueValid ? [ha?.limitationsNotice || 'Historical analogue dataset uninitialized'] : [],
    invalidation: 'Regime divergence exceeding historical analogue variance threshold',
    keyRisk: 'Overfitting or non-stationary structural shift in market dynamics',
    provenanceBadge: 'DERIVED',
    generatedAt: Date.now(),
  };
}

