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

import { UnifiedAgentResponse, AgentReadinessState } from '../contracts/unified-agent-contract';
import { EvidenceClassification, ProvenanceBadgeType } from '../../evidence/agent-evidence';
import {
  FedPolicyIntelligence,
  InflationRegimeIntelligence,
  LaborMarketIntelligence,
  MacroSeriesAnalysis,
  YieldCurveIntelligence,
} from '../../macro/intelligence/types';
import { MarketRegimeAssessment, VolatilityRegime } from '../../regime/market-regime-engine';
import { CrossAssetMatrix } from '../../cross-asset/cross-asset-engine';
import { QuantMetricsResult, HistoricalAnalogueResult, calculateQuantMetrics, PriceBar } from '../../quant/quant-engine';
import { OHLCCandle } from '../../market/canonical-market-snapshot';
import { LiveMarketAsset } from '../../providers/real-market-api';
import { isEnvelopeActionable, VerifiedEvidenceEnvelope } from '../../providers/canonical-envelope';
import { CotReportRecord } from '../../cot/cftc-cot-provider';
import { CentralBankPolicyData } from '../../central-banks/central-bank-provider';
import { LeadLagObservation } from '../../cross-asset/lead-lag-engine';

/**
 * 1. RatesAgent (Domain: RATES)
 */
export function evaluateRatesAgent(inputs: {
  yieldCurve?: YieldCurveIntelligence;
  fedPolicy?: FedPolicyIntelligence;
  tenYearYield?: MacroSeriesAnalysis;
  instrument?: string;
}): UnifiedAgentResponse {
  const instrument = (inputs.instrument || 'XAUUSD').toUpperCase();
  const yc = inputs.yieldCurve;
  const fp = inputs.fedPolicy;
  const ty = inputs.tenYearYield;

  const evidence: any[] = [];
  const missing: string[] = [];

  if (yc && yc.status === 'VALID') {
    // Curve state alone without dynamic steepening is neutral baseline
    const curvePolarity = yc.curveDirection === 'STEEPENING' && yc.spreadBp > 25 ? 'BULLISH' : 'NEUTRAL';
    evidence.push({
      id: 'rates-yc',
      agentId: 'RATES_AGENT',
      domainFamily: 'RATES',
      nature: 'ANALYSIS',
      classification: yc.classification,
      polarity: curvePolarity,
      strength: 0.6,
      confidence: yc.confidence,
      claim: `Yield curve spread is ${yc.spreadBp} bp (${yc.curveState || 'NORMAL'}, ${yc.curveDirection || 'STABLE'}). Baseline curve structure is ${(yc.curveState || 'NORMAL').toLowerCase()}.`,
      source: yc.provider,
      provider: 'FRED',
      observedAt: yc.observationDate,
      receivedAt: Date.now(),
      freshnessMs: 0,
      isStale: yc.freshness === 'STALE',
      instrument,
    });
  } else {
    missing.push('10Y-2Y Yield Curve telemetry');
  }

  if (ty && ty.analysisStatus === 'VALID') {
    // Require verified yield momentum (change >= 2 bp or definitive trend)
    const changeBp = typeof ty.change1Bp === 'number' ? Math.abs(ty.change1Bp) : 0;
    const hasMomentum = changeBp >= 2 || ty.direction !== 'FLAT';
    const isFalling = ty.direction === 'FALLING' && hasMomentum;
    const isRising = ty.direction === 'RISING' && hasMomentum;

    // Instrument-specific rates transmission
    let polarity: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (isFalling) {
      if (instrument === 'USDJPY') {
        polarity = 'BEARISH'; // Falling US yields narrow carry advantage, weakening USD/JPY
      } else if (instrument === 'USOIL') {
        polarity = 'NEUTRAL'; // Oil sensitivity to nominal yields is ambiguous without growth context
      } else {
        polarity = 'BULLISH'; // Gold, Silver, EUR, GBP, Tech, Crypto benefit from falling discount rates / weaker USD
      }
    } else if (isRising) {
      if (instrument === 'USDJPY') {
        polarity = 'BULLISH'; // Rising US yields widen carry advantage, strengthening USD/JPY
      } else if (instrument === 'USOIL') {
        polarity = 'NEUTRAL';
      } else {
        polarity = 'BEARISH'; // Non-yielding / dollar assets face headwinds
      }
    } else {
      polarity = 'NEUTRAL'; // Flat yield level is a static background baseline, NOT a directional impulse
    }

    const tyConfidence = hasMomentum ? 65 : 40;
    evidence.push({
      id: 'rates-10y',
      agentId: 'RATES_AGENT',
      domainFamily: 'RATES',
      nature: 'DATA',
      classification: ty.classification,
      polarity,
      strength: hasMomentum ? 0.75 : 0.4,
      confidence: tyConfidence,
      claim: `10Y Treasury yield is ${ty.latestValue}% (${ty.direction}, change: ${ty.change1Bp} bp). ${hasMomentum ? 'Yield momentum active.' : 'Yield momentum flat (static baseline level).' }`,
      source: ty.provider,
      provider: 'FRED',
      observedAt: ty.latestObservationDate,
      receivedAt: Date.now(),
      freshnessMs: 0,
      isStale: ty.freshness === 'STALE',
      instrument,
    });
  } else {
    missing.push('10-Year Treasury Yield series');
  }

  const isBullish = evidence.some((e) => e.polarity === 'BULLISH') && !evidence.some((e) => e.polarity === 'BEARISH');
  const isBearish = evidence.some((e) => e.polarity === 'BEARISH') && !evidence.some((e) => e.polarity === 'BULLISH');
  const direction = isBullish ? 'BULLISH' : isBearish ? 'BEARISH' : 'NEUTRAL';

  // Calibrated rates confidence: direction with momentum gets 60%, neutral/static gets 40%, no data gets 0%
  const hasData = evidence.length > 0;
  const baseConfidence = hasData ? (direction !== 'NEUTRAL' ? 60 : 40) : 0;
  const isAging = ty?.freshness === 'AGING' || yc?.freshness === 'AGING';
  const confidence = isAging ? Math.round(baseConfidence * 0.65) : baseConfidence;
  const evidenceTrust = hasData ? (isAging ? 60 : 85) : 0;

  return {
    agentId: 'RATES_AGENT',
    agentName: 'Fed & Sovereign Rates Specialist',
    role: 'Treasury Yields, Yield Curve Structure & FOMC Target Corridor',
    domainFamily: 'RATES',
    instrument,
    direction,
    confidence,
    evidenceTrust,
    readiness: evidence.length >= 2 ? 'READY' : evidence.length > 0 ? 'PARTIAL' : 'DATA_LIMITED',
    primaryThesis: hasData
      ? `Rates environment reflects ${direction.toLowerCase()} conditions for ${instrument === 'XAUUSD' ? 'gold' : instrument} (10Y yield: ${ty?.latestValue ?? 'N/A'}%, ${ty?.direction ?? 'FLAT'}).`
      : 'Rates telemetry awaiting synchronized feeds.',
    evidence,
    conflicts: [],
    missingEvidence: missing,
    invalidation: 'Yield spike > 15 bp intraday',
    keyRisk: 'Unscheduled Federal Reserve rate shock',
    provenanceBadge: hasData ? 'INDEPENDENT' : 'DATA LIMITED',
    generatedAt: Date.now(),
  };
}

/**
 * 2. InflationAgent (Domain: INFLATION)
 */
export function evaluateInflationAgent(inputs: {
  breakevenAnalysis?: MacroSeriesAnalysis;
  realYieldAnalysis?: MacroSeriesAnalysis;
  cpiAnalysis?: MacroSeriesAnalysis;
  inflationRegime?: InflationRegimeIntelligence;
  instrument?: string;
}): UnifiedAgentResponse {
  const instrument = (inputs.instrument || 'XAUUSD').toUpperCase();
  const bei = inputs.breakevenAnalysis;
  const ry = inputs.realYieldAnalysis;
  const inf = inputs.inflationRegime;
  const evidence: any[] = [];
  const missing: string[] = [];

  if (inf && inf.status === 'VALID') {
    const isHigh = inf.regime === 'INFLATIONARY_EXPANSION';
    const isLow = inf.regime === 'DISINFLATION';

    // Transmission: US inflation expansion implies hawkish Fed (dollar strength), but gold/commodities act as hedge
    let polarity: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (isHigh) {
      if (instrument === 'XAUUSD' || instrument === 'XAGUSD' || instrument === 'USOIL') {
        polarity = 'BULLISH'; // Inflation hedge / commodity demand
      } else if (instrument === 'USDJPY') {
        polarity = 'BULLISH'; // Higher US inflation -> higher Fed terminal expectation -> USD/JPY carry support
      } else if (instrument === 'EURUSD' || instrument === 'GBPUSD' || instrument === 'US100') {
        polarity = 'BEARISH'; // Hawkish Fed pressure on foreign currencies and growth equities
      } else {
        polarity = 'NEUTRAL';
      }
    } else if (isLow) {
      if (instrument === 'XAUUSD' || instrument === 'XAGUSD' || instrument === 'USOIL') {
        polarity = 'BEARISH';
      } else if (instrument === 'USDJPY') {
        polarity = 'BEARISH';
      } else if (instrument === 'EURUSD' || instrument === 'GBPUSD' || instrument === 'US100') {
        polarity = 'BULLISH';
      } else {
        polarity = 'NEUTRAL';
      }
    }

    evidence.push({
      id: 'inf-regime',
      agentId: 'INFLATION_AGENT',
      domainFamily: 'INFLATION',
      nature: 'ANALYSIS',
      classification: inf.classification,
      polarity,
      strength: 0.8,
      confidence: 70,
      claim: `${inf.name}: Regime=${inf.regime} (Headline CPI YoY: ${inf.headlineCpiYoY ?? 'N/A'}%, Core CPI YoY: ${inf.coreCpiYoY ?? 'N/A'}%, Core PCE YoY: ${inf.corePceYoY ?? 'N/A'}%). Transmission aligns ${polarity.toLowerCase()} for ${instrument}.`,
      source: inf.provider,
      provider: 'FRED',
      observedAt: inf.observationDate,
      receivedAt: Date.now(),
      freshnessMs: 0,
      isStale: inf.freshness === 'STALE',
      instrument,
    });
  }

  if (ry && ry.analysisStatus === 'VALID') {
    const isFalling = ry.direction === 'FALLING';
    const isRising = ry.direction === 'RISING';

    let ryPolarity: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (isFalling) {
      if (instrument === 'USDJPY') {
        ryPolarity = 'BEARISH';
      } else {
        ryPolarity = 'BULLISH'; // Gold, EUR, GBP, Tech benefit from falling real sovereign hurdle rates
      }
    } else if (isRising) {
      if (instrument === 'USDJPY') {
        ryPolarity = 'BULLISH';
      } else {
        ryPolarity = 'BEARISH'; // Rising real rates increase sovereign opportunity cost
      }
    }

    evidence.push({
      id: 'inf-ry',
      agentId: 'INFLATION_AGENT',
      domainFamily: 'INFLATION',
      nature: 'DATA',
      classification: ry.classification,
      polarity: ryPolarity,
      strength: 0.85,
      confidence: 75,
      claim: `10Y Real Yield is ${ry.latestValue}% (${ry.direction}, change: ${ry.change1Bp} bp). Sovereign real discount transmission aligns ${ryPolarity.toLowerCase()} for ${instrument}.`,
      source: 'FRED',
      provider: 'FRED',
      observedAt: ry.latestObservationDate,
      receivedAt: Date.now(),
      freshnessMs: 0,
      isStale: ry.freshness === 'STALE',
      instrument,
    });
  } else {
    missing.push('10Y Real Yield (DFII10)');
  }

  if (bei && bei.analysisStatus === 'VALID') {
    const isRising = bei.direction === 'RISING';
    const isFalling = bei.direction === 'FALLING';

    let beiPolarity: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (isRising) {
      beiPolarity = (instrument === 'XAUUSD' || instrument === 'XAGUSD' || instrument === 'USOIL') ? 'BULLISH' : 'NEUTRAL';
    } else if (isFalling) {
      beiPolarity = (instrument === 'XAUUSD' || instrument === 'XAGUSD' || instrument === 'USOIL') ? 'BEARISH' : 'NEUTRAL';
    }

    evidence.push({
      id: 'inf-bei',
      agentId: 'INFLATION_AGENT',
      domainFamily: 'INFLATION',
      nature: 'ANALYSIS',
      classification: bei.classification,
      polarity: beiPolarity,
      strength: 0.7,
      confidence: 65,
      claim: `Market-implied 10Y Breakeven Inflation is ${bei.latestValue}% (${bei.direction}).`,
      source: 'FRED',
      provider: 'FRED',
      observedAt: bei.latestObservationDate,
      receivedAt: Date.now(),
      freshnessMs: 0,
      isStale: bei.freshness === 'STALE',
      instrument,
    });
  } else {
    missing.push('10Y Breakeven Inflation (T10YIE)');
  }

  const isBullish = evidence.some((e) => e.polarity === 'BULLISH');
  const isBearish = evidence.some((e) => e.polarity === 'BEARISH');
  const direction = isBullish && !isBearish ? 'BULLISH' : isBearish && !isBullish ? 'BEARISH' : 'NEUTRAL';

  // Calibrated inflation confidence: balanced/conflicting gets 45%, directional alignment gets 65-70%
  const hasData = evidence.length > 0;
  let baseConfidence = 0;
  if (hasData) {
    if (isBullish && isBearish) {
      baseConfidence = 45; // Mixed signals (e.g. inflation expansion vs restrictive real yields)
    } else if (direction !== 'NEUTRAL') {
      baseConfidence = 65;
    } else {
      baseConfidence = 45;
    }
  }

  const isAging = inf?.freshness === 'AGING' || ry?.freshness === 'AGING';
  const confidence = isAging ? Math.round(baseConfidence * 0.65) : baseConfidence;
  const evidenceTrust = hasData ? (isAging ? 60 : 85) : 0;

  return {
    agentId: 'INFLATION_AGENT',
    agentName: 'Inflation & Real Yield Specialist',
    role: 'TIPS Real Rates & Market-Implied Breakeven Expectations',
    domainFamily: 'INFLATION',
    instrument,
    direction,
    confidence,
    evidenceTrust,
    readiness: evidence.length >= 2 ? 'READY' : evidence.length > 0 ? 'PARTIAL' : 'DATA_LIMITED',
    primaryThesis: hasData
      ? `Inflation dynamics reflect ${direction.toLowerCase()} fundamental backdrop for ${instrument === 'XAUUSD' ? 'precious metals' : instrument} (regime: ${inf?.regime ?? 'N/A'}, 10Y real yield: ${ry?.latestValue ?? 'N/A'}%).`
      : 'Inflation telemetry awaiting release.',
    evidence,
    conflicts: (isBullish && isBearish) ? ['Divergence between market inflation expectations and restrictive sovereign real yields'] : [],
    missingEvidence: missing,
    invalidation: 'Real yield upward breakout above key cycle resistance',
    keyRisk: 'TIPS liquidity distortion',
    provenanceBadge: hasData ? 'INDEPENDENT' : 'DATA LIMITED',
    generatedAt: Date.now(),
  };
}

/**
 * 3. VolatilityAgent (Domain: VOLATILITY)
 */
export function evaluateVolatilityAgent(inputs: {
  regime?: MarketRegimeAssessment;
  candles?: OHLCCandle[];
  instrument?: string;
}): UnifiedAgentResponse {
  const instrument = (inputs.instrument || inputs.regime?.instrument || 'XAUUSD').toUpperCase();
  const candles = inputs.candles;
  let reg = inputs.regime;

  const validClosedCandles = (Array.isArray(candles) ? candles : []).filter(
    (c) =>
      c &&
      typeof c.open === 'number' &&
      typeof c.close === 'number' &&
      typeof c.high === 'number' &&
      typeof c.low === 'number' &&
      c.open > 0 &&
      c.close > 0 &&
      c.high >= c.low &&
      Number.isFinite(c.timestamp)
  );

  // Derive ATR and regime from verified closed candles if candle history is available
  if ((!reg || reg.volatilityRegime === 'UNKNOWN') && validClosedCandles.length >= 15) {
    let trSum14 = 0;
    let trTotalSum = 0;
    for (let i = 1; i < validClosedCandles.length; i++) {
      const cur = validClosedCandles[i];
      const prev = validClosedCandles[i - 1];
      const tr = Math.max(
        cur.high - cur.low,
        Math.abs(cur.high - prev.close),
        Math.abs(cur.low - prev.close)
      );
      trTotalSum += tr;
      if (i >= validClosedCandles.length - 14) {
        trSum14 += tr;
      }
    }
    const currentAtr = trSum14 / 14;
    const historicalAtrAverage = trTotalSum / (validClosedCandles.length - 1);
    const ratio = historicalAtrAverage > 0 ? currentAtr / historicalAtrAverage : 1.0;
    const volRegime: VolatilityRegime = ratio > 1.3 ? 'HIGH_VOLATILITY' : ratio < 0.75 ? 'LOW_VOLATILITY' : 'NORMAL_VOLATILITY';

    reg = {
      instrument,
      trendRegime: 'UNKNOWN',
      volatilityRegime: volRegime,
      riskRegime: 'UNKNOWN',
      macroRegime: 'UNKNOWN',
      liquidityRegime: 'BALANCED',
      regimeSummary: `Derived ATR=${currentAtr.toFixed(4)} (Historical Avg=${historicalAtrAverage.toFixed(4)}, Ratio=${ratio.toFixed(2)}). Volatility classified as ${volRegime}.`,
      confidence: 80,
      evidenceCount: 1,
      missingInputs: [],
      assessedAt: Date.now(),
    };
  }

  const hasValidRegime = Boolean(reg && reg.volatilityRegime !== 'UNKNOWN' && reg.confidence > 0);
  const isHighVol = reg?.volatilityRegime === 'HIGH_VOLATILITY';
  const confidence = hasValidRegime ? reg!.confidence : 0;
  const evidenceTrust = hasValidRegime ? 85 : 0;
  const readiness: AgentReadinessState = hasValidRegime && reg!.confidence >= 50 ? 'READY' : 'DATA_LIMITED';
  const direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CAUTION' = hasValidRegime && isHighVol ? 'CAUTION' : 'NEUTRAL';
  const provenanceBadge: ProvenanceBadgeType = hasValidRegime ? 'DERIVED' : 'DATA LIMITED';

  return {
    agentId: 'VOLATILITY_AGENT',
    agentName: 'Volatility & Expansion Specialist',
    role: 'ATR, Expansion Cycles & Risk Volatility Regimes',
    domainFamily: 'VOLATILITY',
    instrument,
    direction: direction as any,
    confidence,
    evidenceTrust,
    readiness,
    primaryThesis: hasValidRegime
      ? `Volatility regime classified as ${reg!.volatilityRegime} (${reg!.trendRegime}).`
      : 'Insufficient verified candle history for ATR calculation (DATA_LIMITED).',
    evidence: hasValidRegime && reg ? [{
      id: 'vol-regime',
      agentId: 'VOLATILITY_AGENT',
      domainFamily: 'VOLATILITY',
      nature: 'ANALYSIS',
      classification: 'DERIVED_FROM_VERIFIED',
      polarity: isHighVol ? 'CAUTION' : 'NEUTRAL',
      strength: 0.8,
      confidence,
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
    missingEvidence: hasValidRegime ? [] : ['Verified candle history for ATR derivation'],
    invalidation: 'ATR spike beyond 2.0x historical band',
    keyRisk: 'Volatility expansion during illiquid session transitions',
    provenanceBadge,
    generatedAt: Date.now(),
  };
}

/**
 * 4. CrossAssetAgent (Domain: CROSS_ASSET)
 */
export function evaluateCrossAssetAgent(inputs: {
  matrix?: CrossAssetMatrix;
  instrument?: string;
}): UnifiedAgentResponse {
  const instrument = (inputs.instrument || 'XAUUSD').toUpperCase();
  const matrix = inputs.matrix;
  const activeCount = matrix?.activePairCount || 0;
  const hasValidMatrix = activeCount >= 2 && Boolean(matrix?.relationships && typeof matrix.relationships === 'object');

  const confidence = hasValidMatrix ? 75 : 0;
  const evidenceTrust = hasValidMatrix ? 80 : 0;
  const readiness: AgentReadinessState = hasValidMatrix ? 'READY' : (activeCount > 0 ? 'PARTIAL' : 'DATA_LIMITED');
  const provenanceBadge: ProvenanceBadgeType = hasValidMatrix ? 'DERIVED' : 'DATA LIMITED';

  return {
    agentId: 'CROSS_ASSET_AGENT',
    agentName: 'Cross-Asset & Correlation Specialist',
    role: 'Intermarket Covariance, Yield Beta & Macro Assets',
    domainFamily: 'CROSS_ASSET',
    instrument,
    direction: 'NEUTRAL',
    confidence,
    evidenceTrust,
    readiness,
    primaryThesis: hasValidMatrix && matrix
      ? matrix.summary
      : 'Synchronized live cross-asset series unavailable (DATA_LIMITED). Zero directional bias.',
    evidence: hasValidMatrix && matrix && matrix.relationships ? Object.entries(matrix.relationships).map(([key, rel]) => ({
      id: `cross-${key}`,
      agentId: 'CROSS_ASSET_AGENT',
      domainFamily: 'CROSS_ASSET' as const,
      nature: 'ANALYSIS' as const,
      classification: rel.status === 'VERIFIED' ? 'DERIVED_FROM_VERIFIED' as const : 'STATIC_REFERENCE' as const,
      polarity: 'NEUTRAL' as const,
      strength: 0.6,
      confidence: rel.sampleCount >= 5 ? 80 : 0,
      claim: `${rel.targetSymbol}: correlation=${rel.rollingCorrelation ?? 'N/A'} (n=${rel.sampleCount}). ${rel.notes}`,
      source: 'Cross-Asset Engine',
      provider: 'FEF_ANALYTICS',
      observedAt: new Date(matrix.computedAt).toISOString(),
      receivedAt: matrix.computedAt,
      freshnessMs: 0,
      isStale: false,
      instrument,
    })) : [],
    conflicts: [],
    missingEvidence: hasValidMatrix ? [] : ['Synchronized multi-asset benchmark feeds'],
    invalidation: 'Correlation regime breakdown',
    keyRisk: 'Intermarket covariance decoupling',
    provenanceBadge,
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
  isReferenceLive?: boolean;
  priceAuthority?: 'MT5_BROKER' | 'REFERENCE_MARKET' | 'UNAVAILABLE';
}): UnifiedAgentResponse {
  const isMt5Online = Boolean(inputs?.isMt5Online ?? inputs?.mt5Health?.isConnected ?? false);
  const isReferenceLive = Boolean(inputs?.isReferenceLive ?? (inputs?.priceAuthority === 'REFERENCE_MARKET' || inputs?.priceAuthorityStatus === 'LIVE'));
  const activeProviders = inputs?.activeProviders || [];
  const offlineProviders = [
    ...(inputs?.offlineProviders || []),
    ...(inputs?.fredHealth?.status === 'ERROR' ? ['FRED'] : []),
    ...(!isMt5Online ? ['MT5'] : []),
  ];
  const feedAgeMs = inputs?.feedAgeMs ?? 0;
  // A broker being offline during reference market mode is NOT a sentinel error!
  const hasValidPriceFeed = isMt5Online || isReferenceLive;
  const isCorrupted = inputs?.priceAuthorityStatus === 'ERROR' || inputs?.fredHealth?.status === 'ERROR';
  const isDegraded = !hasValidPriceFeed || isCorrupted;
  const isHealthy = !isDegraded;
  const evidenceTrust = isHealthy ? (isMt5Online ? 100 : 85) : 30;

  return {
    agentId: 'DATA_SENTINEL',
    agentName: 'Synapse Data Sentinel',
    role: 'Feed Integrity, Provenance Verification & Provider Health Auditor',
    domainFamily: 'SYSTEM_INTEGRITY',
    instrument: 'XAUUSD',
    direction: 'NEUTRAL',
    confidence: isHealthy ? 95 : 50,
    evidenceTrust,
    readiness: isHealthy ? 'READY' : 'DATA_LIMITED',
    primaryThesis: isHealthy
      ? (isMt5Online
          ? `All telemetry channels verified. MT5 broker socket online. Active providers: ${activeProviders.join(', ') || 'MT5, FRED'}.`
          : `Reference market integrity verified. Zero payload corruption across feeds. MT5 broker standby.`)
      : `Data Sentinel Alert: Degraded telemetry. Offline feeds: ${offlineProviders.join(', ') || 'No valid price feed'}.`,
    evidence: [{
      id: 'sentinel-status',
      agentId: 'DATA_SENTINEL',
      domainFamily: 'SYSTEM_INTEGRITY',
      nature: 'DATA',
      classification: isMt5Online ? 'LIVE_MT5' : isReferenceLive ? 'INDEPENDENT_VERIFIED' : 'UNAVAILABLE',
      polarity: 'NEUTRAL',
      strength: 1.0,
      confidence: 100,
      claim: isMt5Online
        ? `Heartbeat age: ${Math.round(feedAgeMs)}ms. Broker telemetry verified without payload corruption.`
        : `Reference market feeds verified. Broker execution feed in standby.`,
      source: isMt5Online ? 'DataHub Health Registry' : 'Reference Continuity Registry',
      provider: isMt5Online ? 'FEF_SYSTEM' : 'FEF_REFERENCE_SENTINEL',
      observedAt: new Date().toISOString(),
      receivedAt: Date.now(),
      freshnessMs: feedAgeMs,
      isStale: feedAgeMs > 60_000 && isMt5Online,
      instrument: 'GLOBAL',
    }],
    conflicts: [],
    missingEvidence: isMt5Online ? offlineProviders.filter(p => p !== 'MT5') : offlineProviders,
    invalidation: 'Feed latency > 250ms or unhandled socket termination',
    keyRisk: isMt5Online ? 'Broker disconnection during active market hours' : 'Reference market mode: broker execution unavailable',
    provenanceBadge: isMt5Online ? 'LIVE' : isReferenceLive ? 'INDEPENDENT' : 'UNAVAILABLE',
    generatedAt: Date.now(),
  };
}

/**
 * 6. QuantAgent (Domain: QUANT_STATISTICAL)
 */
export function evaluateQuantAgent(inputs: {
  metrics?: QuantMetricsResult;
  analogue?: HistoricalAnalogueResult;
  candles?: OHLCCandle[];
  instrument?: string;
}): UnifiedAgentResponse {
  const instrument = (inputs.instrument || 'XAUUSD').toUpperCase();
  let qm = inputs.metrics;
  const ha = inputs.analogue;

  const validClosedCandles = (Array.isArray(inputs.candles) ? inputs.candles : []).filter(
    (c) =>
      c &&
      typeof c.open === 'number' &&
      typeof c.close === 'number' &&
      typeof c.high === 'number' &&
      typeof c.low === 'number' &&
      c.open > 0 &&
      c.close > 0 &&
      c.high >= c.low &&
      Number.isFinite(c.timestamp)
  );

  // Derive quant metrics from verified closed candles if metrics are absent
  if ((!qm || qm.status !== 'VALID') && validClosedCandles.length >= 10) {
    const bars: PriceBar[] = validClosedCandles.map((c) => ({
      date: new Date(c.timestamp).toISOString().split('T')[0],
      timestamp: c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    qm = calculateQuantMetrics(bars, 4.0);
  }

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

  const hasValidData = isQuantValid || isAnalogueValid;
  const confidence = hasValidData ? 75 : 0;
  const evidenceTrust = hasValidData ? 80 : 0;
  const readiness: AgentReadinessState = (isQuantValid && isAnalogueValid) ? 'READY' : (hasValidData ? 'PARTIAL' : 'DATA_LIMITED');
  const provenanceBadge: ProvenanceBadgeType = hasValidData ? 'DERIVED' : 'DATA LIMITED';

  return {
    agentId: 'QUANT_AGENT',
    agentName: 'Quantitative & Historical Analogue Specialist',
    role: 'Distribution Analytics, Volatility Regimes & Historical Outcome Matching',
    domainFamily: 'QUANT_STATISTICAL',
    instrument,
    direction: hasValidData ? direction : 'NEUTRAL',
    confidence,
    evidenceTrust,
    readiness,
    primaryThesis: isAnalogueValid
      ? `Historical analogue matched ${ha.matchedSampleCount} regime periods. 5-day median forward return: ${ha.forward5dMedianReturnPct}%.`
      : (isQuantValid && qm ? `Annualized Volatility: ${qm.annualizedVolatilityPct}%, Max Drawdown: ${qm.maxDrawdownPct}%.` : 'Quant telemetry data-limited (awaiting verified candle history).'),
    evidence: (isQuantValid && qm) ? [{
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
      instrument,
    }] : [],
    conflicts: [],
    missingEvidence: hasValidData ? [] : ['Verified candle dataset for quant distribution calculation'],
    invalidation: 'Regime divergence exceeding historical analogue variance threshold',
    keyRisk: 'Overfitting or non-stationary structural shift in market dynamics',
    provenanceBadge,
    generatedAt: Date.now(),
  };
}

/**
 * 7. MacroCorrelatorAgent (Domain: CROSS_ASSET)
 * Intermarket Macro Divergence, DXY & Yield Cross-Asset Correlation
 */
export function evaluateMacroCorrelatorAgent(inputs: {
  instrument?: string;
  dxyAnalysis?: { direction?: string; value?: number; status?: string };
  tenYearYield?: MacroSeriesAnalysis;
  crossAssetMatrix?: CrossAssetMatrix;
}): UnifiedAgentResponse {
  const instrument = (inputs.instrument || 'XAUUSD').toUpperCase();
  const ty = inputs.tenYearYield;
  const dxy = inputs.dxyAnalysis;

  const evidence: any[] = [];
  const missing: string[] = [];

  const isTyValid = ty && ty.analysisStatus === 'VALID';
  const isDxyValid = dxy && dxy.status === 'VALID';

  if (isTyValid) {
    const isFallingYield = ty.direction === 'FALLING';
    const isRisingYield = ty.direction === 'RISING';

    // Transmission: falling US yields weaken USD (bullish for non-USD assets/gold, bearish for USDJPY)
    let isYieldBullishForAsset = false;
    let isYieldAmbiguous = false;
    if (instrument === 'USDJPY') {
      isYieldBullishForAsset = false; // Falling US yields weaken USD/JPY -> BEARISH
    } else if (instrument === 'USOIL') {
      isYieldAmbiguous = true; // Oil yield correlation is ambiguous without global growth demand context
    } else {
      isYieldBullishForAsset = true; // Gold, Silver, EUR, GBP, US100, BTCUSD
    }

    let polarity: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (!isYieldAmbiguous) {
      if (isFallingYield) {
        polarity = isYieldBullishForAsset ? 'BULLISH' : 'BEARISH';
      } else if (isRisingYield) {
        polarity = isYieldBullishForAsset ? 'BEARISH' : 'BULLISH';
      }
    }

    evidence.push({
      id: 'macro-corr-10y',
      agentId: 'MACRO_CORRELATOR_AGENT',
      domainFamily: isDxyValid ? 'CROSS_ASSET' : 'RATES',
      nature: 'ANALYSIS',
      classification: ty.classification,
      polarity,
      strength: 0.6,
      confidence: 50,
      claim: `10Y Yield is ${ty.latestValue}% (${ty.direction}). Intermarket correlation implies ${polarity.toLowerCase()} macro backdrop for ${instrument}.`,
      source: ty.provider,
      provider: 'FRED',
      observedAt: ty.latestObservationDate,
      receivedAt: Date.now(),
      freshnessMs: 0,
      isStale: ty.freshness === 'STALE',
      instrument,
    });
  } else {
    missing.push('10-Year Treasury Yield series');
  }

  if (isDxyValid) {
    const isDxyDown = dxy.direction === 'FALLING';
    const isDxyUp = dxy.direction === 'RISING';
    const polarity = isDxyDown ? 'BULLISH' : isDxyUp ? 'BEARISH' : 'NEUTRAL';
    evidence.push({
      id: 'macro-corr-dxy',
      agentId: 'MACRO_CORRELATOR_AGENT',
      domainFamily: 'CROSS_ASSET',
      nature: 'DATA',
      classification: 'INDEPENDENT_VERIFIED',
      polarity,
      strength: 0.85,
      confidence: 75,
      claim: `Dollar Index (DXY) at ${dxy.value} (${dxy.direction}). Intermarket correlation implies ${polarity.toLowerCase()} pressure.`,
      source: 'Macro Engine',
      provider: 'FRED',
      observedAt: new Date().toISOString(),
      receivedAt: Date.now(),
      freshnessMs: 0,
      isStale: false,
      instrument,
    });
  } else {
    missing.push('Direct DXY index feed (isolated yield without dollar benchmark)');
  }

  const isBullish = evidence.some((e) => e.polarity === 'BULLISH') && !evidence.some((e) => e.polarity === 'BEARISH');
  const isBearish = evidence.some((e) => e.polarity === 'BEARISH') && !evidence.some((e) => e.polarity === 'BULLISH');
  const direction = isBullish ? 'BULLISH' : isBearish ? 'BEARISH' : 'NEUTRAL';
  const hasFullDivergencePair = isTyValid && isDxyValid;
  const hasPartialYield = isTyValid && !isDxyValid;

  // Calibrated confidence: isolated yield alone without DXY or cross-matrix gets 40% max; full pair gets 75%
  let confidence = 0;
  let readiness: AgentReadinessState = 'DATA_LIMITED';
  if (hasFullDivergencePair) {
    confidence = direction !== 'NEUTRAL' ? 75 : 50;
    readiness = 'READY';
  } else if (hasPartialYield) {
    confidence = direction !== 'NEUTRAL' ? 40 : 30; // Calibrated down from false 80%
    readiness = 'PARTIAL';
  }

  return {
    agentId: 'MACRO_CORRELATOR_AGENT',
    agentName: 'Macro Correlator Specialist',
    role: 'Intermarket Macro Divergence, DXY & Yield Cross-Asset Correlation',
    domainFamily: hasFullDivergencePair ? 'CROSS_ASSET' : 'RATES',
    instrument,
    direction,
    confidence,
    evidenceTrust: confidence > 0 ? 75 : 0,
    readiness,
    primaryThesis: hasFullDivergencePair
      ? `Full macro intermarket correlation (Yield + DXY) confirms ${direction.toLowerCase()} alignment for ${instrument}.`
      : hasPartialYield
      ? `Macro correlation partially informed by isolated 10Y yield (${direction.toLowerCase()}, calibrated confidence: ${confidence}%); awaiting direct DXY or synchronized cross-matrix.`
      : `Macro correlation feeds currently data-limited for ${instrument} (fail-closed).`,
    evidence,
    conflicts: [],
    missingEvidence: missing,
    invalidation: 'Yield/DXY intermarket regime reversal',
    keyRisk: 'Uncorrelated structural decoupling during geopolitical shocks',
    provenanceBadge: confidence > 0 ? 'INDEPENDENT' : 'UNAVAILABLE',
    generatedAt: Date.now(),
  };
}

/**
 * 8. CrossAssetLeadLagAgent (Domain: CROSS_ASSET)
 * Cross-Market Momentum Leads & Intermarket Beta Synchronization
 */
export function evaluateCrossAssetLeadLagAgent(inputs: {
  instrument?: string;
  liveAssets?: Record<string, LiveMarketAsset>;
  crossAssetMatrix?: CrossAssetMatrix;
  leadLagObservation?: LeadLagObservation;
}): UnifiedAgentResponse {
  const instrument = (inputs.instrument || 'XAUUSD').toUpperCase();
  const liveAssets = inputs.liveAssets;
  const evidence: any[] = [];
  const missing: string[] = [];

  // 1. Primary: Use mathematically verified LeadLagObservation if available
  if (inputs.leadLagObservation) {
    const obs = inputs.leadLagObservation;
    if (obs.isVerified && obs.relationshipStrength >= 0.3) {
      const polarity = obs.correlation > 0 ? 'BULLISH' : 'BEARISH';
      evidence.push({
        id: `lead-lag-${obs.leader.toLowerCase()}`,
        agentId: 'CROSS_ASSET_LEAD_LAG_AGENT',
        domainFamily: 'CROSS_ASSET',
        nature: 'ANALYSIS',
        classification: 'DERIVED_FROM_VERIFIED',
        polarity,
        strength: obs.relationshipStrength,
        confidence: Math.round(obs.relationshipStrength * 100),
        claim: `${obs.leader} leads ${obs.follower} by ${obs.lagBars} bar(s) with correlation ${obs.correlation} over ${obs.sampleSize} verified closed bars.`,
        source: 'MT5 Broker Telemetry',
        provider: 'FEF_LEAD_LAG_ENGINE',
        observedAt: new Date().toISOString(),
        receivedAt: Date.now(),
        freshnessMs: 0,
        isStale: false,
        instrument,
      });

      return {
        agentId: 'CROSS_ASSET_LEAD_LAG_AGENT',
        agentName: 'Cross-Asset Lead-Lag Specialist',
        role: 'Cross-Market Momentum Leads & Intermarket Beta Synchronization',
        domainFamily: 'CROSS_ASSET',
        instrument,
        direction: polarity,
        confidence: Math.round(obs.relationshipStrength * 100),
        evidenceTrust: Math.round(obs.relationshipStrength * 100),
        readiness: 'READY',
        primaryThesis: obs.notes,
        evidence,
        conflicts: [],
        missingEvidence: [],
        invalidation: 'Lead-lag breakdown or divergence in lagged returns',
        keyRisk: 'Asynchronous regime drift',
        provenanceBadge: 'DERIVED',
        generatedAt: Date.now(),
      };
    } else {
      missing.push(obs.notes || 'Lead-lag relationship below significance threshold');
      return {
        agentId: 'CROSS_ASSET_LEAD_LAG_AGENT',
        agentName: 'Cross-Asset Lead-Lag Specialist',
        role: 'Cross-Market Momentum Leads & Intermarket Beta Synchronization',
        domainFamily: 'CROSS_ASSET',
        instrument,
        direction: 'NEUTRAL',
        confidence: 0,
        evidenceTrust: 0,
        readiness: 'DATA_LIMITED',
        primaryThesis: obs.notes || `Lead-lag relationship data-limited for ${instrument}.`,
        evidence: [],
        conflicts: [],
        missingEvidence: missing,
        invalidation: 'Data threshold requirement unmet',
        keyRisk: 'Insufficient samples or weak correlation',
        provenanceBadge: 'DATA LIMITED',
        generatedAt: Date.now(),
      };
    }
  }

  // Determine key lead asset based on instrument sector
  let leadSymbol = 'BTCUSD';
  let leadSector = 'CRYPTO';

  if (['ETHUSD', 'SOLUSD', 'BNBUSD', 'XRPUSD'].includes(instrument)) {
    leadSymbol = 'BTCUSD';
    leadSector = 'CRYPTO';
  } else if (['US100', 'US30', 'GER40', 'UK100', 'JP225'].includes(instrument)) {
    leadSymbol = 'US500';
    leadSector = 'INDICES';
  } else if (['NATGAS', 'UKOIL'].includes(instrument)) {
    leadSymbol = 'USOIL';
    leadSector = 'COMMODITIES';
  } else if (['GBPUSD', 'AUDUSD', 'NZDUSD', 'EURJPY', 'GBPJPY'].includes(instrument)) {
    leadSymbol = 'EURUSD';
    leadSector = 'FOREX';
  } else if (['XAGUSD'].includes(instrument)) {
    leadSymbol = 'XAUUSD';
    leadSector = 'METALS';
  }

  const leadAsset = liveAssets ? liveAssets[leadSymbol] : undefined;

  if (leadAsset && leadAsset.price > 0) {
    const change = leadAsset.change24h || 0;
    const polarity = change > 0.3 ? 'BULLISH' : change < -0.3 ? 'BEARISH' : 'NEUTRAL';

    evidence.push({
      id: `lead-lag-${leadSymbol.toLowerCase()}`,
      agentId: 'CROSS_ASSET_LEAD_LAG_AGENT',
      domainFamily: 'CROSS_ASSET',
      nature: 'ANALYSIS',
      classification: 'DERIVED_FROM_VERIFIED',
      polarity,
      strength: 0.75,
      confidence: 75,
      claim: `${leadSector} benchmark ${leadSymbol} moving at ${change >= 0 ? '+' : ''}${change.toFixed(2)}% (24h). Projects ${polarity.toLowerCase()} lead-lag momentum for ${instrument}.`,
      source: 'Market Registry',
      provider: leadAsset.provider || 'MT5',
      observedAt: leadAsset.lastUpdated || new Date().toISOString(),
      receivedAt: Date.now(),
      freshnessMs: 0,
      isStale: false,
      instrument,
    });
  } else {
    missing.push(`Lead benchmark asset ${leadSymbol} telemetry`);
  }

  const hasData = evidence.length > 0;
  const direction = hasData ? (evidence[0].polarity as 'BULLISH' | 'BEARISH' | 'NEUTRAL') : 'NEUTRAL';

  return {
    agentId: 'CROSS_ASSET_LEAD_LAG_AGENT',
    agentName: 'Cross-Asset Lead-Lag Specialist',
    role: 'Cross-Market Momentum Leads & Intermarket Beta Synchronization',
    domainFamily: 'CROSS_ASSET',
    instrument,
    direction,
    confidence: hasData ? 75 : 0,
    evidenceTrust: hasData ? 75 : 0,
    readiness: hasData ? 'READY' : 'DATA_LIMITED',
    primaryThesis: hasData
      ? `Intermarket lead ${leadSymbol} exhibits ${direction.toLowerCase()} momentum leading ${instrument}.`
      : `Benchmark lead telemetry unavailable for ${instrument} sector.`,
    evidence,
    conflicts: [],
    missingEvidence: missing,
    invalidation: 'Divergence in sector beta or independent idiosyncratic catalyst',
    keyRisk: 'Lead-lag breakdown during isolated regulatory or company earnings events',
    provenanceBadge: hasData ? 'LIVE' : 'UNAVAILABLE',
    generatedAt: Date.now(),
  };
}

/**
 * 9. VolatilitySqueezeAgent (Domain: VOLATILITY)
 * Bollinger-Keltner Volatility Compression & Energy Buildup Specialist
 */
export function evaluateVolatilitySqueezeAgent(inputs: {
  instrument?: string;
  candles?: OHLCCandle[];
  regimeAssessment?: MarketRegimeAssessment;
}): UnifiedAgentResponse {
  const instrument = (inputs.instrument || 'XAUUSD').toUpperCase();
  const candles = inputs.candles;

  const evidence: any[] = [];
  const missing: string[] = [];

  if (!candles || !Array.isArray(candles) || candles.length < 20) {
    missing.push('Insufficient verified candles (< 20 bars) for Bollinger/Keltner calculation');
    return {
      agentId: 'VOLATILITY_SQUEEZE_AGENT',
      agentName: 'Volatility Squeeze Specialist',
      role: 'Bollinger-Keltner Volatility Compression & Energy Buildup Specialist',
      domainFamily: 'VOLATILITY',
      instrument,
      direction: 'NEUTRAL',
      confidence: 0,
      evidenceTrust: 0,
      readiness: 'DATA_LIMITED',
      primaryThesis: `Insufficient candles (< 20) to compute Bollinger-Keltner squeeze bands for ${instrument}.`,
      evidence: [],
      conflicts: [],
      missingEvidence: missing,
      invalidation: 'Data threshold requirement unmet',
      keyRisk: 'Insufficient bar samples',
      provenanceBadge: 'UNAVAILABLE',
      generatedAt: Date.now(),
    };
  }

  // Compute 20-period SMA, Bollinger Bands (2 std), Keltner Channels (1.5 ATR)
  const window20 = candles.slice(-20);
  const closes = window20.map((c) => c.close);
  const sma20 = closes.reduce((acc, c) => acc + c, 0) / 20;

  const variance = closes.reduce((acc, c) => acc + Math.pow(c - sma20, 2), 0) / 20;
  const stdDev = Math.sqrt(variance);

  const bbUpper = sma20 + 2 * stdDev;
  const bbLower = sma20 - 2 * stdDev;

  // ATR 20
  let trSum = 0;
  for (let i = 1; i < window20.length; i++) {
    const cur = window20[i];
    const prev = window20[i - 1];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    trSum += tr;
  }
  const atr20 = trSum / 19 || stdDev;
  const keltnerUpper = sma20 + 1.5 * atr20;
  const keltnerLower = sma20 - 1.5 * atr20;

  // Squeeze is ON if Bollinger Bands are inside Keltner Channels
  const isSqueezeOn = bbUpper < keltnerUpper && bbLower > keltnerLower;
  const lastClose = closes[closes.length - 1];
  const momentum = lastClose - sma20;
  const direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = isSqueezeOn
    ? 'NEUTRAL'
    : momentum > 0
    ? 'BULLISH'
    : 'BEARISH';

  evidence.push({
    id: 'vol-squeeze-bands',
    agentId: 'VOLATILITY_SQUEEZE_AGENT',
    domainFamily: 'VOLATILITY',
    nature: 'ANALYSIS',
    classification: 'DERIVED_FROM_VERIFIED',
    polarity: direction,
    strength: isSqueezeOn ? 0.9 : 0.7,
    confidence: 85,
    claim: isSqueezeOn
      ? `Bollinger Bands compressed inside Keltner Channels (Squeeze ON: BB width ${(bbUpper - bbLower).toFixed(4)} < KC width ${(keltnerUpper - keltnerLower).toFixed(4)}). Energy accumulating for directional expansion.`
      : `Bollinger Bands expanding outside Keltner Channels (Squeeze FIRING ${direction}). Momentum=${momentum.toFixed(4)}.`,
    source: 'Squeeze Engine',
    provider: 'FEF_SYSTEM',
    observedAt: new Date((candles[candles.length - 1] as any).timestamp || (candles[candles.length - 1] as any).time || Date.now()).toISOString(),
    receivedAt: Date.now(),
    freshnessMs: 0,
    isStale: false,
    instrument,
  });

  return {
    agentId: 'VOLATILITY_SQUEEZE_AGENT',
    agentName: 'Volatility Squeeze Specialist',
    role: 'Bollinger-Keltner Volatility Compression & Energy Buildup Specialist',
    domainFamily: 'VOLATILITY',
    instrument,
    direction,
    confidence: 85,
    evidenceTrust: 85,
    readiness: 'READY',
    primaryThesis: isSqueezeOn
      ? `Volatility compression active on ${instrument}. Squeeze energy accumulating prior to expansion.`
      : `Volatility expansion active on ${instrument} with ${direction.toLowerCase()} directional thrust.`,
    evidence,
    conflicts: [],
    missingEvidence: [],
    invalidation: 'Volatility band expansion without directional volume participation',
    keyRisk: 'False expansion breakout (head-fake) during low-volume sessions',
    provenanceBadge: 'DERIVED',
    generatedAt: Date.now(),
  };
}

/**
 * 10. CurrencyStrengthMatrixAgent (Domain: CURRENCY_STRENGTH)
 * 7-Currency Relative Strength Divergence & Cross Momentum Engine
 */
export function evaluateCurrencyStrengthAgent(inputs: {
  instrument?: string;
  currencyMatrix?: Record<string, number>;
  forexQuotes?: Record<string, { change24h: number }>;
}): UnifiedAgentResponse {
  const instrument = (inputs.instrument || 'EURUSD').toUpperCase();
  const fq = inputs.forexQuotes;
  const cm = inputs.currencyMatrix;

  const evidence: any[] = [];
  const missing: string[] = [];

  const majors = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'NZD'];
  const strengthScores: Record<string, number> = {};

  if (cm && Object.keys(cm).length >= 4) {
    Object.assign(strengthScores, cm);
  } else if (fq && Object.keys(fq).length >= 4) {
    for (const m of majors) {
      if (fq[m]?.change24h !== undefined) {
        strengthScores[m] = fq[m].change24h;
      }
    }
  }

  const hasData = Object.keys(strengthScores).length >= 4;

  if (!hasData) {
    missing.push('Insufficient currency quotes (< 4 majors) for relative strength matrix');
    return {
      agentId: 'CURRENCY_STRENGTH_AGENT',
      agentName: 'Currency Strength Matrix Specialist',
      role: '7-Currency Relative Return & Momentum Divergence Specialist',
      domainFamily: 'CURRENCY_STRENGTH',
      instrument,
      direction: 'NEUTRAL',
      confidence: 0,
      evidenceTrust: 0,
      readiness: 'DATA_LIMITED',
      primaryThesis: `Relative currency strength matrix data-limited for ${instrument} (fail-closed).`,
      evidence: [],
      conflicts: [],
      missingEvidence: missing,
      invalidation: 'Uninitialized multi-currency quote matrix',
      keyRisk: 'Synthetic pricing or absent cross pairs',
      provenanceBadge: 'UNAVAILABLE',
      generatedAt: Date.now(),
    };
  }

  // Determine base and quote currency
  let base = instrument.substring(0, 3);
  let quote = instrument.substring(3, 6);
  if (!majors.includes(base) || !majors.includes(quote)) {
    // Non-forex instruments (e.g. XAUUSD, BTCUSD) evaluate USD relative dominance
    base = majors.includes(base) ? base : 'BASE';
    quote = 'USD';
  }

  const baseScore = strengthScores[base] ?? 0;
  const quoteScore = strengthScores[quote] ?? 0;
  const divergence = baseScore - quoteScore;

  const direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
    divergence > 0.5 ? 'BULLISH' : divergence < -0.5 ? 'BEARISH' : 'NEUTRAL';

  evidence.push({
    id: `curr-strength-${instrument}`,
    agentId: 'CURRENCY_STRENGTH_AGENT',
    domainFamily: 'CURRENCY_STRENGTH',
    nature: 'ANALYSIS',
    classification: 'INDEPENDENT_VERIFIED',
    polarity: direction,
    strength: Math.min(1.0, Math.abs(divergence) / 2.0),
    confidence: 80,
    claim: `Currency relative strength delta is ${(divergence).toFixed(2)}% (${base}: ${baseScore.toFixed(2)}% vs ${quote}: ${quoteScore.toFixed(2)}%). Intermarket momentum implies ${direction.toLowerCase()} alignment.`,
    source: 'Currency Matrix Engine',
    provider: 'FEF_SYSTEM',
    observedAt: new Date().toISOString(),
    receivedAt: Date.now(),
    freshnessMs: 0,
    isStale: false,
    instrument,
  });

  return {
    agentId: 'CURRENCY_STRENGTH_AGENT',
    agentName: 'Currency Strength Matrix Specialist',
    role: '7-Currency Relative Return & Momentum Divergence Specialist',
    domainFamily: 'CURRENCY_STRENGTH',
    instrument,
    direction,
    confidence: 80,
    evidenceTrust: 80,
    readiness: 'READY',
    primaryThesis: `Currency divergence score ${(divergence).toFixed(2)}% reflects ${direction.toLowerCase()} structural bias for ${instrument}.`,
    evidence,
    conflicts: [],
    missingEvidence: [],
    invalidation: 'Reversal in relative currency performance delta',
    keyRisk: 'Idiosyncratic central bank speech shock altering currency beta',
    provenanceBadge: 'INDEPENDENT',
    generatedAt: Date.now(),
  };
}

/**
 * 11. AnchoredVWAPAgent (Domain: PRICE_TECHNICAL)
 * Session-Anchored VWAP and Multi-Timeframe Standard Deviation Bands
 */
export function evaluateAnchoredVWAPAgent(inputs: {
  instrument?: string;
  candles?: OHLCCandle[];
  currentPrice?: number;
}): UnifiedAgentResponse {
  const instrument = (inputs.instrument || 'EURUSD').toUpperCase();
  const candles = inputs.candles;
  const currentPrice = inputs.currentPrice;

  if (!candles || !Array.isArray(candles) || candles.length < 15) {
    return {
      agentId: 'ANCHORED_VWAP_AGENT',
      agentName: 'Anchored VWAP Specialist',
      role: 'Session-Anchored VWAP & Standard Deviation Bands Specialist',
      domainFamily: 'PRICE_TECHNICAL',
      instrument,
      direction: 'NEUTRAL',
      confidence: 0,
      evidenceTrust: 0,
      readiness: 'DATA_LIMITED',
      primaryThesis: `Insufficient candles (< 15) to calculate Anchored VWAP for ${instrument}.`,
      evidence: [],
      conflicts: [],
      missingEvidence: ['Minimum 15 closed candles with volume required for VWAP calculation'],
      invalidation: 'Insufficient bar samples',
      keyRisk: 'Sample size distortion',
      provenanceBadge: 'UNAVAILABLE',
      generatedAt: Date.now(),
    };
  }

  // Compute Volume Weighted Average Price
  let sumPv = 0;
  let sumV = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    const volRaw = (c.tickVolume !== undefined && c.tickVolume > 0) ? c.tickVolume : ((c as any).volume || 100);
    const vol = volRaw > 0 ? volRaw : 100; // proxy tick weight if 0
    sumPv += typical * vol;
    sumV += vol;
  }

  const vwap = sumV > 0 ? sumPv / sumV : candles[candles.length - 1].close;

  // Compute Volume Weighted Standard Deviation
  let sumVDiff2 = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    const volRaw = (c.tickVolume !== undefined && c.tickVolume > 0) ? c.tickVolume : ((c as any).volume || 100);
    const vol = volRaw > 0 ? volRaw : 100;
    sumVDiff2 += vol * Math.pow(typical - vwap, 2);
  }

  const stdDev = sumV > 0 ? Math.sqrt(sumVDiff2 / sumV) : (vwap * 0.002);
  const p = currentPrice || candles[candles.length - 1].close;
  const zScore = (p - vwap) / (stdDev || 1);

  // Mean-reversion valuation zones:
  // z < -1.2 -> Institutional Discount (Bullish mean-reversion)
  // z > +1.2 -> Institutional Premium (Bearish mean-reversion)
  // |z| <= 0.6 -> Fair Value POC / Equilibrium (Neutral)
  const direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
    zScore < -1.2 ? 'BULLISH' : zScore > 1.2 ? 'BEARISH' : 'NEUTRAL';

  const zoneLabel =
    zScore < -1.5 ? 'Institutional Discount (-2σ)' :
    zScore > 1.5 ? 'Institutional Premium (+2σ)' :
    'Fair Value Equilibrium (POC)';

  const evidence = [{
    id: `vwap-${instrument}`,
    agentId: 'ANCHORED_VWAP_AGENT',
    domainFamily: 'PRICE_TECHNICAL' as const,
    nature: 'ANALYSIS' as const,
    classification: 'DERIVED_FROM_VERIFIED' as const,
    polarity: direction,
    strength: Math.min(1.0, Math.abs(zScore) / 2.0),
    confidence: 85,
    claim: `Session Anchored VWAP=${vwap.toFixed(4)}, σ=${stdDev.toFixed(4)}. Current price=${p.toFixed(4)} sits in ${zoneLabel} (z-score ${zScore.toFixed(2)}).`,
    source: 'VWAP Engine',
    provider: 'FEF_SYSTEM',
    observedAt: new Date((candles[candles.length - 1] as any).timestamp || (candles[candles.length - 1] as any).time || Date.now()).toISOString(),
    receivedAt: Date.now(),
    freshnessMs: 0,
    isStale: false,
    instrument,
  }];

  return {
    agentId: 'ANCHORED_VWAP_AGENT',
    agentName: 'Anchored VWAP Specialist',
    role: 'Session-Anchored VWAP & Standard Deviation Bands Specialist',
    domainFamily: 'PRICE_TECHNICAL',
    instrument,
    direction,
    confidence: 85,
    evidenceTrust: 85,
    readiness: 'READY',
    primaryThesis: `Price trading at ${zoneLabel} relative to Session VWAP (${vwap.toFixed(4)}). Expected posture: ${direction.toLowerCase()}.`,
    evidence,
    conflicts: [],
    missingEvidence: [],
    invalidation: 'Break of outer 2.5σ standard deviation band without volume mitigation',
    keyRisk: 'Strong trend expansion overriding mean-reversion equilibrium',
    provenanceBadge: 'DERIVED',
    generatedAt: Date.now(),
  };
}

/**
 * 12. MarketRegimeClassifierAgent (Domain: VOLATILITY)
 * Statistical Efficiency & Volatility Regime Detection Engine
 */
export function evaluateMarketRegimeClassifierAgent(inputs: {
  instrument?: string;
  candles?: OHLCCandle[];
  currentPrice?: number;
}): UnifiedAgentResponse {
  const instrument = (inputs.instrument || 'EURUSD').toUpperCase();
  const candles = inputs.candles;

  const validClosedCandles = (Array.isArray(candles) ? candles : []).filter(
    (c) =>
      c &&
      typeof c.open === 'number' &&
      typeof c.close === 'number' &&
      typeof c.high === 'number' &&
      typeof c.low === 'number' &&
      c.open > 0 &&
      c.close > 0 &&
      c.high >= c.low &&
      Number.isFinite(c.timestamp)
  );

  if (validClosedCandles.length < 15) {
    return {
      agentId: 'MARKET_REGIME_CLASSIFIER_AGENT',
      agentName: 'Market Regime Classifier Specialist',
      role: 'Statistical Efficiency & Volatility Regime Detection Specialist',
      domainFamily: 'VOLATILITY',
      instrument,
      direction: 'NEUTRAL',
      confidence: 0,
      evidenceTrust: 0,
      readiness: 'DATA_LIMITED',
      primaryThesis: `Insufficient verified closed candles (< 15) to classify volatility regime for ${instrument}.`,
      evidence: [],
      conflicts: [],
      missingEvidence: ['Minimum 15 closed candles required for regime efficiency analysis'],
      invalidation: 'Insufficient bar samples',
      keyRisk: 'Insufficient volatility sample',
      provenanceBadge: 'UNAVAILABLE',
      generatedAt: Date.now(),
    };
  }

  const window = validClosedCandles.slice(-15);
  const netMove = Math.abs(window[window.length - 1].close - window[0].close);
  let pathSum = 0;
  for (let i = 1; i < window.length; i++) {
    pathSum += Math.abs(window[i].close - window[i - 1].close);
  }

  const er = pathSum > 0 ? netMove / pathSum : 0;
  const drift = window[window.length - 1].close - window[0].close;

  let regimeType: string;
  let direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';

  if (er > 0.40) {
    regimeType = 'TRENDING_EXPANSION';
    direction = drift > 0 ? 'BULLISH' : 'BEARISH';
  } else if (er < 0.22) {
    regimeType = 'COMPRESSED_CHOP';
    direction = 'NEUTRAL';
  } else {
    regimeType = 'BALANCED_AUCTION';
    direction = 'NEUTRAL';
  }

  const evidence = [{
    id: `regime-${instrument}`,
    agentId: 'MARKET_REGIME_CLASSIFIER_AGENT',
    domainFamily: 'VOLATILITY' as const,
    nature: 'ANALYSIS' as const,
    classification: 'DERIVED_FROM_VERIFIED' as const,
    polarity: direction,
    strength: er,
    confidence: 80,
    claim: `Price action efficiency ratio ER=${er.toFixed(2)} defines active regime as ${regimeType}.`,
    source: 'Regime Classifier',
    provider: 'FEF_SYSTEM',
    observedAt: new Date(validClosedCandles[validClosedCandles.length - 1].timestamp).toISOString(),
    receivedAt: Date.now(),
    freshnessMs: 0,
    isStale: false,
    instrument,
  }];

  return {
    agentId: 'MARKET_REGIME_CLASSIFIER_AGENT',
    agentName: 'Market Regime Classifier Specialist',
    role: 'Statistical Efficiency & Volatility Regime Detection Specialist',
    domainFamily: 'VOLATILITY',
    instrument,
    direction,
    confidence: 80,
    evidenceTrust: 80,
    readiness: 'READY',
    primaryThesis: `Market regime detected as ${regimeType} with efficiency ratio ${er.toFixed(2)}.`,
    evidence,
    conflicts: [],
    missingEvidence: [],
    invalidation: 'Abrupt volatility compression or volatility clustering expansion',
    keyRisk: 'Regime shift from chop to aggressive breakout prior to confirmation',
    provenanceBadge: 'DERIVED',
    generatedAt: Date.now(),
  };
}

/**
 * 13. OrderFlowDeltaAgent (Domain: ORDER_FLOW)
 * Cumulative Tick Volume Delta & Fractal Absorption Specialist
 */
export function evaluateOrderFlowDeltaAgent(inputs: {
  instrument?: string;
  candles?: OHLCCandle[];
  marketStructure?: any;
  isBrokerConnected?: boolean;
}): UnifiedAgentResponse {
  const instrument = (inputs.instrument || 'EURUSD').toUpperCase();
  const candles = inputs.candles;
  const isBroker = inputs.isBrokerConnected ?? false;
  const hasBrokerTicks = Boolean(isBroker && candles && candles.some(c => typeof c.tickVolume === 'number' && c.tickVolume > 0));

  if (!candles || !Array.isArray(candles) || candles.length < 15 || !hasBrokerTicks) {
    return {
      agentId: 'ORDER_FLOW_DELTA_AGENT',
      agentName: 'Order Flow Delta Specialist',
      role: 'Cumulative Tick Volume Delta & Fractal Absorption Specialist',
      domainFamily: 'ORDER_FLOW',
      instrument,
      direction: 'NEUTRAL',
      confidence: 0,
      evidenceTrust: 0,
      readiness: 'DATA_LIMITED',
      primaryThesis: !hasBrokerTicks
        ? `Broker tick volume delta is unavailable without active MT5 broker feed for ${instrument}.`
        : `Insufficient candles (< 15) to evaluate tick volume delta for ${instrument}.`,
      evidence: [],
      conflicts: [],
      missingEvidence: ['Minimum 15 closed candles with broker tick volume required'],
      invalidation: 'Insufficient tick data',
      keyRisk: 'Unrecorded volume delta',
      provenanceBadge: 'DATA LIMITED',
      generatedAt: Date.now(),
    };
  }

  // Calculate cumulative volume delta (CVD) proxy over last 15 bars
  const window = candles.slice(-15);
  let cumDelta = 0;
  for (const c of window) {
    const range = c.high - c.low || 0.0001;
    const volRaw = (c.tickVolume !== undefined && c.tickVolume > 0) ? c.tickVolume : ((c as any).volume || 100);
    const barDelta = ((c.close - c.open) / range) * volRaw;
    cumDelta += barDelta;
  }

  const lastClose = window[window.length - 1].close;
  const firstClose = window[0].close;
  const priceMove = lastClose - firstClose;

  // Absorption divergence detection:
  // Price up but delta down -> Bearish absorption
  // Price down but delta up -> Bullish accumulation
  let direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let deltaCondition = 'CONCORDANT';

  if (priceMove > 0 && cumDelta < 0) {
    direction = 'BEARISH';
    deltaCondition = 'ABSORPTION_DIVERGENCE_BEARISH';
  } else if (priceMove < 0 && cumDelta > 0) {
    direction = 'BULLISH';
    deltaCondition = 'ACCUMULATION_DIVERGENCE_BULLISH';
  } else if (cumDelta > 0) {
    direction = 'BULLISH';
  } else if (cumDelta < 0) {
    direction = 'BEARISH';
  }

  const evidence = [{
    id: `cvd-${instrument}`,
    agentId: 'ORDER_FLOW_DELTA_AGENT',
    domainFamily: 'ORDER_FLOW' as const,
    nature: 'ANALYSIS' as const,
    classification: 'BROKER_TICK_VOLUME_PROXY' as const,
    polarity: direction,
    strength: 0.75,
    confidence: 80,
    claim: `Cumulative tick volume delta: ${cumDelta.toFixed(0)} units. Condition: ${deltaCondition}. Verified broker tick volume proxy active.`,
    source: 'Tick Order Flow Engine',
    provider: 'MT5_BROKER_TELEMETRY',
    observedAt: new Date((candles[candles.length - 1] as any).timestamp || (candles[candles.length - 1] as any).time || Date.now()).toISOString(),
    receivedAt: Date.now(),
    freshnessMs: 0,
    isStale: false,
    instrument,
  }];

  return {
    agentId: 'ORDER_FLOW_DELTA_AGENT',
    agentName: 'Order Flow Delta Specialist',
    role: 'Cumulative Tick Volume Delta & Fractal Absorption Specialist',
    domainFamily: 'ORDER_FLOW',
    instrument,
    direction,
    confidence: 80,
    evidenceTrust: 80,
    readiness: 'READY',
    primaryThesis: `Order flow cumulative tick delta reflects ${deltaCondition.toLowerCase()} with ${direction.toLowerCase()} institutional pressure.`,
    evidence,
    conflicts: [],
    missingEvidence: [],
    invalidation: 'Aggressive sweep invalidating resting delta absorption zone',
    keyRisk: 'OTC broker tick volume proxy variance from central futures exchange DOM',
    provenanceBadge: 'DERIVED',
    generatedAt: Date.now(),
  };
}

/**
 * 14. CotPositioningAgent (Domain: INSTITUTIONAL)
 * Smart Money Commercial vs Non-Commercial Institutional Crowding Specialist
 */
export function evaluateCotPositioningAgent(inputs: {
  instrument?: string;
  liveCot?: { commercialNet?: number; nonCommercialNet?: number; percentile?: number; status?: string };
  cotEnvelope?: VerifiedEvidenceEnvelope<CotReportRecord>;
}): UnifiedAgentResponse {
  const instrument = (inputs.instrument || 'XAUUSD').toUpperCase();
  const live = inputs.liveCot;
  const envelope = inputs.cotEnvelope;

  let hasLive = false;
  let percentileVal = 50;
  let noteText = '';
  let providerName = 'CFTC_BENCHMARK';
  let observedDate = new Date().toISOString();

  if (isEnvelopeActionable(envelope)) {
    hasLive = true;
    percentileVal = envelope.payload.percentile;
    noteText = `Verified CFTC COT report (${envelope.payload.contractName}): Non-Comm Net ${envelope.payload.nonCommercialNet >= 0 ? '+' : ''}${envelope.payload.nonCommercialNet} (${envelope.payload.percentile}% percentile)`;
    providerName = envelope.provider;
    observedDate = envelope.observedAt;
  } else if (live?.percentile !== undefined) {
    hasLive = true;
    percentileVal = live.percentile;
    noteText = `Live CFTC COT report net percentile ${live.percentile}%`;
    providerName = 'CFTC_COT';
  }

  // Authoritative Baseline Matrix (Contextual Reference Only)
  const baselineMatrix: Record<string, { percentile: number; bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; note: string }> = {
    XAUUSD: { percentile: 74, bias: 'BULLISH', note: 'Non-Commercials net long 74th percentile (Elevated institutional long)' },
    XAGUSD: { percentile: 62, bias: 'BULLISH', note: 'Silver managed money net long 62nd percentile' },
    USOIL: { percentile: 48, bias: 'NEUTRAL', note: 'Crude oil commercial vs speculative positioning balanced' },
    UKOIL: { percentile: 48, bias: 'NEUTRAL', note: 'Brent oil speculative positioning neutral' },
    EURUSD: { percentile: 52, bias: 'NEUTRAL', note: 'EUR speculative positioning at 52nd percentile' },
    GBPUSD: { percentile: 58, bias: 'BULLISH', note: 'GBP non-commercials net long 58th percentile' },
    USDJPY: { percentile: 82, bias: 'BULLISH', note: 'JPY net short carry crowding 82nd percentile (Bullish USDJPY)' },
    AUDUSD: { percentile: 45, bias: 'NEUTRAL', note: 'AUD speculative contracts neutral' },
    BTCUSD: { percentile: 65, bias: 'BULLISH', note: 'CME Bitcoin futures institutional net long 65th percentile' },
  };

  const matched = hasLive
    ? {
        percentile: percentileVal,
        bias: (percentileVal > 60 ? 'BULLISH' : percentileVal < 40 ? 'BEARISH' : 'NEUTRAL') as 'BULLISH' | 'BEARISH' | 'NEUTRAL',
        note: noteText,
      }
    : baselineMatrix[instrument] || { percentile: 50, bias: 'NEUTRAL', note: 'Benchmark COT positioning at neutral baseline' };

  const isCrowded = matched.percentile > 85 || matched.percentile < 15;
  const direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CAUTION' = hasLive
    ? (isCrowded ? 'CAUTION' : matched.bias)
    : 'NEUTRAL';

  const classification: EvidenceClassification = hasLive ? 'DERIVED_FROM_VERIFIED' : 'STATIC_REFERENCE';
  const confidence = hasLive ? 75 : 0;
  const evidenceTrust = hasLive ? 75 : 0;
  const readiness: AgentReadinessState = hasLive ? 'READY' : 'DATA_LIMITED';
  const provenanceBadge: ProvenanceBadgeType = hasLive ? 'INDEPENDENT' : 'DATA LIMITED';

  const evidence = [{
    id: `cot-${instrument}`,
    agentId: 'COT_POSITIONING_AGENT',
    domainFamily: 'INSTITUTIONAL' as const,
    nature: hasLive ? ('ANALYSIS' as const) : ('DATA' as const),
    classification,
    polarity: direction as any,
    strength: hasLive ? 0.8 : 0.0,
    confidence,
    claim: hasLive
      ? `CFTC Commitments of Traders (COT) percentile: ${matched.percentile}%. ${matched.note}.${isCrowded ? ' Warning: Institutional crowding indicates structural exhaustion risk.' : ''}`
      : `LIVE CFTC DATA NOT CONNECTED (STATIC CONTEXTUAL BASELINE ONLY). Historical benchmark reference: ${matched.note} (${matched.percentile}% percentile). Zero actionable directional bias.`,
    source: hasLive ? 'CFTC Institutional Positioning Feed' : 'CFTC Benchmark Matrix (Static Baseline)',
    provider: providerName,
    observedAt: observedDate,
    receivedAt: Date.now(),
    freshnessMs: 0,
    isStale: false,
    instrument,
  }];

  return {
    agentId: 'COT_POSITIONING_AGENT',
    agentName: 'COT Positioning Specialist',
    role: 'Smart Money Commercial vs Speculative Institutional Positioning Specialist',
    domainFamily: 'INSTITUTIONAL',
    instrument,
    direction: direction as any,
    confidence,
    evidenceTrust,
    readiness,
    primaryThesis: hasLive
      ? `COT institutional positioning (${matched.percentile}% percentile) provides ${direction.toLowerCase()} structural backdrop for ${instrument}.`
      : `LIVE CFTC DATA NOT CONNECTED (STATIC CONTEXTUAL BASELINE ONLY). Baseline reference: ${matched.note}. Zero directional weight contributed to consensus.`,
    evidence,
    conflicts: [],
    missingEvidence: hasLive ? [] : ['LIVE CFTC data feed not connected'],
    invalidation: 'Weekly CFTC release showing > 20% institutional contract liquidation',
    keyRisk: 'Delayed reporting latency (CFTC reports lag real-time Tuesday positions)',
    provenanceBadge,
    generatedAt: Date.now(),
  };
}

/**
 * 15. CentralBankPolicyAgent (Domain: MACRO_REGIME)
 * Monetary Policy Differential & Sovereign Carry Spread Specialist
 */
export function evaluateCentralBankPolicyAgent(inputs: {
  instrument?: string;
  liveCentralBanks?: Record<string, { rate: number; stance: string; isVerified?: boolean }>;
  centralBankEnvelope?: VerifiedEvidenceEnvelope<Record<string, CentralBankPolicyData>>;
}): UnifiedAgentResponse {
  const instrument = (inputs.instrument || 'EURUSD').toUpperCase();
  const live = inputs.liveCentralBanks;
  const envelope = inputs.centralBankEnvelope;

  const baseCurr = instrument.substring(0, 3);
  const quoteCurr = instrument.substring(3, 6);

  let hasLive = false;
  let baseRate: number | null = null;
  let quoteRate: number | null = null;
  let providerName = 'CENTRAL_BANKS';
  let observedDate = new Date().toISOString();
  let baseVerified = false;
  let quoteVerified = false;
  let unverifiedReason = '';

  if (isEnvelopeActionable(envelope) && envelope.payload) {
    const baseEntry = envelope.payload[baseCurr];
    const quoteEntry = envelope.payload[quoteCurr];

    baseVerified = Boolean(
      baseEntry &&
        baseEntry.isVerified !== false &&
        (typeof baseEntry.currentRate === 'number' ||
          (typeof baseEntry.policyRate === 'number' && baseEntry.policyRate > 0))
    );
    quoteVerified = Boolean(
      quoteEntry &&
        quoteEntry.isVerified !== false &&
        (typeof quoteEntry.currentRate === 'number' ||
          (typeof quoteEntry.policyRate === 'number' && quoteEntry.policyRate > 0))
    );

    if (baseVerified && quoteVerified) {
      hasLive = true;
      baseRate = baseEntry!.currentRate ?? baseEntry!.policyRate;
      quoteRate = quoteEntry!.currentRate ?? quoteEntry!.policyRate;
      providerName = envelope.provider;
      observedDate = envelope.observedAt;
    } else {
      const missing: string[] = [];
      if (!baseVerified) missing.push(`${baseCurr} (${baseEntry?.bankCode || 'Unconfigured'})`);
      if (!quoteVerified) missing.push(`${quoteCurr} (${quoteEntry?.bankCode || 'Unconfigured'})`);
      unverifiedReason = `Unverified authoritative policy rate for: ${missing.join(', ')}`;
    }
  } else if (live && live[baseCurr] && live[quoteCurr]) {
    baseVerified = live[baseCurr].isVerified ?? (typeof live[baseCurr].rate === 'number');
    quoteVerified = live[quoteCurr].isVerified ?? (typeof live[quoteCurr].rate === 'number');
    if (baseVerified && quoteVerified) {
      hasLive = true;
      baseRate = live[baseCurr].rate;
      quoteRate = live[quoteCurr].rate;
      providerName = 'CENTRAL_BANKS';
    } else {
      unverifiedReason = `Unverified live policy rate for ${baseCurr} or ${quoteCurr}`;
    }
  } else {
    unverifiedReason = `Central bank policy feeds offline or unconfigured for ${baseCurr}/${quoteCurr}`;
  }

  // Check if instrument is a currency pair or single-jurisdiction asset
  const isForexPair = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF'].includes(instrument);

  if (!isForexPair && instrument !== 'XAUUSD' && instrument !== 'XAGUSD') {
    // Non-forex instruments (US100, USOIL, BTCUSD) are single-currency or macro assets, not sovereign carry pairs
    const usdEntry = envelope?.payload?.['USD'];
    const isUsdVerified = usdEntry && usdEntry.isVerified && typeof usdEntry.currentRate === 'number';
    return {
      agentId: 'CENTRAL_BANK_POLICY_AGENT',
      agentName: 'Central Bank Policy Specialist',
      role: 'Monetary Policy Differential & Sovereign Carry Spread Specialist',
      domainFamily: 'MACRO_REGIME',
      instrument,
      direction: 'NEUTRAL',
      confidence: isUsdVerified ? 35 : 0,
      evidenceTrust: isUsdVerified ? 85 : 0,
      readiness: isUsdVerified ? 'PARTIAL' : 'DATA_LIMITED',
      primaryThesis: isUsdVerified
        ? `Sovereign carry differential not applicable to non-forex asset ${instrument}. Federal Reserve policy benchmark (${usdEntry.semanticKey}: ${usdEntry.currentRate}%) monitored for macro discount rate context.`
        : `Central bank carry differential not applicable to ${instrument}. Unconfigured sovereign feeds.`,
      evidence: isUsdVerified ? [{
        id: `cb-policy-${instrument}`,
        agentId: 'CENTRAL_BANK_POLICY_AGENT',
        domainFamily: 'MACRO_REGIME' as const,
        nature: 'DATA' as const,
        classification: 'INDEPENDENT_VERIFIED' as const,
        polarity: 'NEUTRAL' as const,
        strength: 0.4,
        confidence: 35,
        claim: `Federal Reserve ${usdEntry.rateName} is ${usdEntry.currentRate}%. Asset ${instrument} is not a multi-currency sovereign carry pair; directional weight held at NEUTRAL.`,
        source: usdEntry.source,
        provider: 'FRED',
        observedAt: usdEntry.effectiveDate,
        receivedAt: Date.now(),
        freshnessMs: 0,
        isStale: false,
        instrument,
      }] : [],
      conflicts: [],
      missingEvidence: isUsdVerified ? [] : ['Authoritative Federal Reserve policy rate feed'],
      invalidation: 'Emergency FOMC inter-meeting rate decision',
      keyRisk: 'Discount rate repricing across non-forex asset classes',
      provenanceBadge: isUsdVerified ? 'INDEPENDENT' : 'DATA LIMITED',
      generatedAt: Date.now(),
    };
  }

  let spreadBps: number | null = null;
  let direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let confidence = 0;
  let strength = 0;

  if (hasLive && baseRate !== null && quoteRate !== null) {
    spreadBps = Math.round((baseRate - quoteRate) * 100);
    const absSpread = Math.abs(spreadBps);

    if (spreadBps > 25) {
      direction = 'BULLISH';
    } else if (spreadBps < -25) {
      direction = 'BEARISH';
    } else {
      direction = 'NEUTRAL';
    }

    // Calibrated carry confidence model: point-in-time carry spread without verified trajectory is capped at 45%
    if (absSpread >= 100) {
      confidence = 45; // Capped at 45% (removes false 85% confidence from carry alone)
      strength = Math.min(1.0, absSpread / 400);
    } else if (absSpread >= 25) {
      confidence = 35;
      strength = Math.min(1.0, absSpread / 400);
    } else {
      confidence = 20;
      strength = 0.2;
    }

    // Apply trust penalty if either leg is aging
    const baseEntry = envelope?.payload?.[baseCurr];
    const quoteEntry = envelope?.payload?.[quoteCurr];
    const isAging = baseEntry?.freshness === 'AGING' || quoteEntry?.freshness === 'AGING';
    if (isAging) {
      confidence = Math.round(confidence * 0.65);
    }
  }

  const classification: EvidenceClassification = hasLive ? 'DERIVED_FROM_VERIFIED' : 'STATIC_REFERENCE';
  const evidenceTrust = hasLive ? (confidence > 0 ? 85 : 0) : 0;
  const readiness: AgentReadinessState = hasLive ? 'READY' : 'DATA_LIMITED';
  const provenanceBadge: ProvenanceBadgeType = hasLive ? 'INDEPENDENT' : 'DATA LIMITED';

  const claim =
    hasLive && spreadBps !== null
      ? `Authoritative central bank policy spread is ${spreadBps > 0 ? '+' : ''}${spreadBps} bps (${baseCurr}: ${baseRate}% vs ${quoteCurr}: ${quoteRate}%). Point-in-time sovereign carry aligns ${direction.toLowerCase()} (calibrated confidence: ${confidence}%).`
      : `AUTHORITATIVE POLICY DIFFERENTIAL UNVERIFIED. ${unverifiedReason}. Zero synthetic or assumed rates. Directional weight held at NEUTRAL with 0 confidence.`;

  const evidence = [
    {
      id: `cb-policy-${instrument}`,
      agentId: 'CENTRAL_BANK_POLICY_AGENT',
      domainFamily: 'MACRO_REGIME' as const,
      nature: 'DATA' as const,
      classification,
      polarity: direction,
      strength,
      confidence,
      claim,
      source: hasLive ? 'Official Central Bank Policy Rate Feed' : 'Unconfigured/Offline Central Bank Feeds',
      provider: providerName,
      observedAt: observedDate,
      receivedAt: Date.now(),
      freshnessMs: 0,
      isStale: false,
      instrument,
    },
  ];

  return {
    agentId: 'CENTRAL_BANK_POLICY_AGENT',
    agentName: 'Central Bank Policy Specialist',
    role: 'Monetary Policy Differential & Sovereign Carry Spread Specialist',
    domainFamily: 'MACRO_REGIME',
    instrument,
    direction,
    confidence,
    evidenceTrust,
    readiness,
    primaryThesis:
      hasLive && spreadBps !== null
        ? `Authoritative policy spread of ${spreadBps > 0 ? '+' : ''}${spreadBps} bps provides ${direction.toLowerCase()} carry background for ${instrument} (calibrated carry confidence: ${confidence}%).`
        : `AUTHORITATIVE POLICY DIFFERENTIAL UNVERIFIED (${unverifiedReason}). Zero directional bias contributed to consensus.`,
    evidence,
    conflicts: [],
    missingEvidence: hasLive ? [] : [unverifiedReason],
    invalidation: 'Inter-meeting emergency rate change or unexpected forward guidance pivot',
    keyRisk: 'Market pricing in earlier rate moves than official guidance',
    provenanceBadge,
    generatedAt: Date.now(),
  };
}

/**
 * 16. QuantMonteCarloStressAgent (Domain: RISK_GUARDIAN)
 * Value-at-Risk (VaR 95%) & 1,000-Path Geometric Brownian Motion Tail Risk Specialist
 */
export function evaluateQuantMonteCarloAgent(inputs: {
  instrument?: string;
  currentPrice?: number;
  slPrice?: number;
  tp1Price?: number;
  tp2Price?: number;
  direction?: 'BUY' | 'SELL';
  candles?: OHLCCandle[];
}): UnifiedAgentResponse {
  const instrument = (inputs.instrument || 'EURUSD').toUpperCase();
  const { currentPrice, slPrice, candles, direction = 'BUY' } = inputs;

  if (!currentPrice || !slPrice || !candles || candles.length < 15) {
    return {
      agentId: 'QUANT_MONTE_CARLO_AGENT',
      agentName: 'Quant Monte Carlo Stress Specialist',
      role: 'Value-at-Risk (VaR 95%) & 1,000-Path Tail Risk Simulation Specialist',
      domainFamily: 'RISK_GUARDIAN',
      instrument,
      direction: 'NEUTRAL',
      confidence: 0,
      evidenceTrust: 0,
      readiness: 'DATA_LIMITED',
      primaryThesis: `Insufficient geometry or candles to run Monte Carlo stress test for ${instrument}.`,
      evidence: [],
      conflicts: [],
      missingEvidence: ['Trade entry, stop loss geometry, and verified candles required'],
      invalidation: 'Missing risk bounds',
      keyRisk: 'Unmodeled tail risk',
      provenanceBadge: 'UNAVAILABLE',
      generatedAt: Date.now(),
    };
  }

  // Calculate rolling volatility
  const window = candles.slice(-20);
  const returns: number[] = [];
  for (let i = 1; i < window.length; i++) {
    returns.push((window[i].close - window[i - 1].close) / window[i - 1].close);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (returns.length || 1);
  const sigma = Math.sqrt(variance) || 0.005;

  const slDistance = Math.abs(currentPrice - slPrice);
  const slPct = slDistance / currentPrice;

  // 1,000-iteration geometric Brownian motion simulation over 20 horizon steps
  const iterations = 1000;
  let slBreaches = 0;
  for (let i = 0; i < iterations; i++) {
    let p = currentPrice;
    for (let step = 0; step < 20; step++) {
      // Box-Muller normal sample
      const u1 = Math.random() || 0.0001;
      const u2 = Math.random() || 0.0001;
      const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      p = p * Math.exp((-0.5 * sigma * sigma) * (1 / 20) + sigma * Math.sqrt(1 / 20) * z);

      if (direction === 'BUY' && p <= slPrice) {
        slBreaches++;
        break;
      } else if (direction === 'SELL' && p >= slPrice) {
        slBreaches++;
        break;
      }
    }
  }

  const adverseProb = slBreaches / iterations;
  const var95Pct = (1.645 * sigma * Math.sqrt(20) * 100).toFixed(2);
  const isHighRisk = adverseProb > 0.60;

  const resDirection: 'BULLISH' | 'BEARISH' | 'CAUTION' = isHighRisk
    ? 'CAUTION'
    : (direction === 'BUY' ? 'BULLISH' : 'BEARISH');

  const evidence = [{
    id: `mc-stress-${instrument}`,
    agentId: 'QUANT_MONTE_CARLO_AGENT',
    domainFamily: 'RISK_GUARDIAN' as const,
    nature: 'ANALYSIS' as const,
    classification: 'DERIVED_FROM_VERIFIED' as const,
    polarity: resDirection as any,
    strength: 0.85,
    confidence: 80,
    claim: `1,000-path Monte Carlo stress test: SL breach probability is ${(adverseProb * 100).toFixed(1)}%. Horizon VaR (95%) is ${var95Pct}%. Tail-risk status: ${isHighRisk ? 'ELEVATED' : 'WITHIN_BOUNDS'}.`,
    source: 'Monte Carlo Stress Engine',
    provider: 'FEF_SYSTEM',
    observedAt: new Date((candles[candles.length - 1] as any).timestamp || (candles[candles.length - 1] as any).time || Date.now()).toISOString(),
    receivedAt: Date.now(),
    freshnessMs: 0,
    isStale: false,
    instrument,
  }];

  return {
    agentId: 'QUANT_MONTE_CARLO_AGENT',
    agentName: 'Quant Monte Carlo Stress Specialist',
    role: 'Value-at-Risk (VaR 95%) & 1,000-Path Tail Risk Simulation Specialist',
    domainFamily: 'RISK_GUARDIAN',
    instrument,
    direction: resDirection as any,
    confidence: 80,
    evidenceTrust: 80,
    readiness: 'READY',
    primaryThesis: `Monte Carlo simulation models ${(adverseProb * 100).toFixed(1)}% adverse excursion risk; VaR 95%=${var95Pct}%.`,
    evidence,
    conflicts: [],
    missingEvidence: [],
    invalidation: 'Volatility expansion exceeding 2.5x estimated historical variance',
    keyRisk: 'Fat-tailed kurtosis jump during illiquid market rollovers',
    provenanceBadge: 'DERIVED',
    generatedAt: Date.now(),
  };
}

/**
 * 17. EconomicNewsMomentumAgent (Domain: NEWS_WIRE)
 * Event Release Embargo & Post-News Momentum Continuation Specialist
 */
export function evaluateEconomicNewsMomentumAgent(inputs: {
  instrument?: string;
  calendarEvents?: any[];
  candles?: OHLCCandle[];
  currentPrice?: number;
}): UnifiedAgentResponse {
  const instrument = (inputs.instrument || 'EURUSD').toUpperCase();
  const events = inputs.calendarEvents;

  if (!events || !Array.isArray(events) || events.length === 0) {
    return {
      agentId: 'ECONOMIC_NEWS_MOMENTUM_AGENT',
      agentName: 'Economic News Momentum Specialist',
      role: 'Macroeconomic News Embargo & Post-News Momentum Continuation Specialist',
      domainFamily: 'NEWS_WIRE',
      instrument,
      direction: 'NEUTRAL',
      confidence: 0,
      evidenceTrust: 0,
      readiness: 'DATA_LIMITED',
      primaryThesis: `Economic calendar feed uninitialized or data-limited for ${instrument} (fail-closed).`,
      evidence: [],
      conflicts: [],
      missingEvidence: ['Live economic calendar telemetry uninitialized'],
      invalidation: 'Data threshold requirement unmet',
      keyRisk: 'Unscheduled flash headlines',
      provenanceBadge: 'UNAVAILABLE',
      generatedAt: Date.now(),
    };
  }

  const now = Date.now();
  // Check for active embargo (+/- 30 mins from high impact event)
  const imminentEvent = events.find((e) => {
    const eventTime = typeof e.timestamp === 'number' ? e.timestamp : new Date(e.timestamp || e.date).getTime();
    const diffMs = Math.abs(eventTime - now);
    return diffMs <= 1800000 && (e.impact === 'HIGH' || e.impact === 'CRITICAL');
  });

  if (imminentEvent) {
    const evidence = [{
      id: `news-embargo-${instrument}`,
      agentId: 'ECONOMIC_NEWS_MOMENTUM_AGENT',
      domainFamily: 'NEWS_WIRE' as const,
      nature: 'DATA' as const,
      classification: 'LIVE_EXTERNAL' as const,
      polarity: 'CAUTION' as const,
      strength: 0.9,
      confidence: 85,
      claim: `High-impact economic release active: "${imminentEvent.title || 'Major Macro Event'}". Embargo lockout enforced (+/- 30 min blackout window).`,
      source: 'Economic Calendar Feed',
      provider: 'CALENDAR_SERVICE',
      observedAt: new Date().toISOString(),
      receivedAt: Date.now(),
      freshnessMs: 0,
      isStale: false,
      instrument,
    }];

    return {
      agentId: 'ECONOMIC_NEWS_MOMENTUM_AGENT',
      agentName: 'Economic News Momentum Specialist',
      role: 'Macroeconomic News Embargo & Post-News Momentum Continuation Specialist',
      domainFamily: 'NEWS_WIRE',
      instrument,
      direction: 'CAUTION',
      confidence: 85,
      evidenceTrust: 85,
      readiness: 'PARTIAL',
      primaryThesis: `Macro event blackout active for "${imminentEvent.title || 'Economic Print'}". Trade execution restricted.`,
      evidence,
      conflicts: [],
      missingEvidence: [],
      invalidation: 'Passing of post-release volatility absorption window',
      keyRisk: 'Severe slippage and spread widening during macroeconomic print',
      provenanceBadge: 'LIVE',
      generatedAt: Date.now(),
    };
  }

  const evidence = [{
    id: `news-clear-${instrument}`,
    agentId: 'ECONOMIC_NEWS_MOMENTUM_AGENT',
    domainFamily: 'NEWS_WIRE' as const,
    nature: 'DATA' as const,
    classification: 'LIVE_EXTERNAL' as const,
    polarity: 'NEUTRAL' as const,
    strength: 0.7,
    confidence: 80,
    claim: 'No imminent high-impact economic releases within +/- 30m window. Macroeconomic runway clear.',
    source: 'Economic Calendar Feed',
    provider: 'CALENDAR_SERVICE',
    observedAt: new Date().toISOString(),
    receivedAt: Date.now(),
    freshnessMs: 0,
    isStale: false,
    instrument,
  }];

  return {
    agentId: 'ECONOMIC_NEWS_MOMENTUM_AGENT',
    agentName: 'Economic News Momentum Specialist',
    role: 'Macroeconomic News Embargo & Post-News Momentum Continuation Specialist',
    domainFamily: 'NEWS_WIRE',
    instrument,
    direction: 'NEUTRAL',
    confidence: 80,
    evidenceTrust: 80,
    readiness: 'READY',
    primaryThesis: `Clear economic runway without impending high-impact embargoes for ${instrument}.`,
    evidence,
    conflicts: [],
    missingEvidence: [],
    invalidation: 'Emergency unscheduled central bank or geopolitical headline',
    keyRisk: 'Off-calendar flash disruption',
    provenanceBadge: 'LIVE',
    generatedAt: Date.now(),
  };
}



