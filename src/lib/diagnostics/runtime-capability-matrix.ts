/**
 * FEF TRADING SOLUTIONS — CANONICAL RUNTIME CAPABILITY MATRIX
 * 
 * Truthfully evaluates and exposes the end-to-end multi-asset capabilities
 * for all 26 canonical instruments across the connected MT5 broker/bridge/relay.
 * 
 * Status Taxonomy:
 * - LIVE: Broker connected, quotes fresh, specs verified, candles available, market session open.
 * - DEGRADED: Live quotes or candles present but stale, or partial timeframe coverage.
 * - MARKET_CLOSED: Valid broker instrument with specs, but current market session is closed.
 * - DATA_LIMITED: Symbol recognized/resolved, but insufficient broker history/telemetry to form full council.
 * - UNAVAILABLE: Instrument not offered by broker, or broker offline / disconnected.
 */

import { MARKET_REGISTRY, MarketDefinition, getAllMarkets } from '../registry/market-registry';
import { CANONICAL_SYMBOL_MAPPINGS } from '../bridge/symbol-mapper';
import { evaluateMarketSession } from '../session/market-session-engine';

export type RuntimeCapabilityStatus = 'LIVE' | 'DEGRADED' | 'MARKET_CLOSED' | 'DATA_LIMITED' | 'UNAVAILABLE';

export interface AssetRuntimeCapability {
  symbol: string;
  category: string;
  displayName: string;
  brokerSymbol: string | null;
  status: RuntimeCapabilityStatus;
  statusReason: string;
  quotePresent: boolean;
  quoteFresh: boolean;
  bid: number | null;
  ask: number | null;
  spread: number | null;
  specsPresent: boolean;
  contractSize: number | null;
  tickValue: number | null;
  minLot: number | null;
  maxLot: number | null;
  lotStep: number | null;
  marketSessionOpen: boolean;
  sessionStateLabel: string;
  candlesAvailable: Record<string, boolean>;
  candleBarsCount: number;
  lastUpdated: number | null;
}

export interface RuntimeCapabilityMatrix {
  timestamp: number;
  totalAssets: number;
  liveAssetsCount: number;
  degradedAssetsCount: number;
  marketClosedAssetsCount: number;
  dataLimitedAssetsCount: number;
  unavailableAssetsCount: number;
  instruments: Record<string, AssetRuntimeCapability>;
  summaryByCategory: Record<string, {
    total: number;
    live: number;
    marketClosed: number;
    dataLimited: number;
    unavailable: number;
    status: RuntimeCapabilityStatus;
  }>;
}

const REQUIRED_TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'] as const;

/**
 * Evaluate single asset runtime capability from bridge telemetry and candle store
 */
export function evaluateAssetCapability(
  symbol: string,
  bridgeStatus?: any,
  candleStore?: any,
  nowMs: number = Date.now()
): AssetRuntimeCapability {
  const normSym = symbol.toUpperCase().trim();
  const def: MarketDefinition | undefined = MARKET_REGISTRY[normSym];
  const displayName = def?.displayName || normSym;
  const category = def?.category || 'FOREX';

  const quotesMap = bridgeStatus?.quotes || {};
  const specsMap = bridgeStatus?.specsBySymbol || {};
  const diagMap = bridgeStatus?.assetDiagnostics || {};
  const sessionsMap = bridgeStatus?.sessions || {};

  // Resolve matching broker symbol
  let brokerSymbol: string | null = null;
  let quoteData: any = null;
  let specData: any = null;

  // 1. Direct canonical lookup
  if (quotesMap[normSym]) {
    quoteData = quotesMap[normSym];
    brokerSymbol = quoteData.brokerSymbol || normSym;
  }
  if (specsMap[normSym]) {
    specData = specsMap[normSym];
    brokerSymbol = specData.brokerSymbol || brokerSymbol || normSym;
  }

  // 2. Diagnostics lookup
  if (!brokerSymbol && diagMap[normSym]?.brokerSymbol) {
    const diagSym = String(diagMap[normSym].brokerSymbol).trim();
    if (diagSym) {
      brokerSymbol = diagSym;
      if (quotesMap[diagSym]) quoteData = quotesMap[diagSym];
      if (specsMap[diagSym]) specData = specsMap[diagSym];
    }
  }

  // 3. Alias fallback lookup
  if (!brokerSymbol) {
    const aliases = CANONICAL_SYMBOL_MAPPINGS[normSym] || [normSym];
    for (const alias of aliases) {
      if (quotesMap[alias]) {
        quoteData = quotesMap[alias];
        brokerSymbol = alias;
        break;
      }
      if (specsMap[alias]) {
        specData = specsMap[alias];
        brokerSymbol = alias;
        break;
      }
    }
  }

  // Quote freshness
  let quotePresent = false;
  let quoteFresh = false;
  let bid: number | null = null;
  let ask: number | null = null;
  let spread: number | null = null;
  let lastUpdated: number | null = null;

  if (quoteData && typeof quoteData === 'object') {
    quotePresent = true;
    bid = Number.isFinite(quoteData.bid) ? quoteData.bid : null;
    ask = Number.isFinite(quoteData.ask) ? quoteData.ask : null;
    spread = Number.isFinite(quoteData.spread) ? quoteData.spread : null;

    const qTs = quoteData.timestamp || (quoteData.time ? new Date(quoteData.time).getTime() : 0);
    lastUpdated = qTs || null;
    const ageMs = nowMs - qTs;
    // Quote is fresh if age < 15s (or crypto 24/7 < 15s)
    quoteFresh = qTs > 0 && ageMs < 15000 && !quoteData.isStale;
  }

  // Specs validation
  let specsPresent = false;
  let contractSize: number | null = null;
  let tickValue: number | null = null;
  let minLot: number | null = null;
  let maxLot: number | null = null;
  let lotStep: number | null = null;

  if (specData && typeof specData === 'object') {
    specsPresent = true;
    contractSize = Number.isFinite(specData.contractSize) ? specData.contractSize : null;
    tickValue = Number.isFinite(specData.tickValue) ? specData.tickValue : null;
    minLot = Number.isFinite(specData.minLot) ? specData.minLot : null;
    maxLot = Number.isFinite(specData.maxLot) ? specData.maxLot : null;
    lotStep = Number.isFinite(specData.lotStep) ? specData.lotStep : null;
  }

  // Market session evaluation
  const sessionResult = evaluateMarketSession(normSym);
  const marketSessionOpen = sessionResult.isOpen;
  const sessionStateLabel = sessionResult.statusLabel;

  // Candle inspection
  const candlesAvailable: Record<string, boolean> = {};
  let totalCandleBars = 0;

  const candleSource = (candleStore && (candleStore[normSym] || (brokerSymbol && candleStore[brokerSymbol])))
    || (bridgeStatus?.candles && (bridgeStatus.candles[normSym] || (brokerSymbol && bridgeStatus.candles[brokerSymbol])))
    || null;

  for (const tf of REQUIRED_TIMEFRAMES) {
    const entry = candleSource ? candleSource[tf] : null;
    const hasBars = entry && Array.isArray(entry.candles) && entry.candles.length > 0;
    candlesAvailable[tf] = Boolean(hasBars);
    if (hasBars) {
      totalCandleBars += entry.candles.length;
    }
  }

  // Capability Status Derivation
  let status: RuntimeCapabilityStatus = 'UNAVAILABLE';
  let statusReason = 'Instrument not offered by broker or bridge offline';

  const isBrokerSupported = Boolean(
    brokerSymbol ||
    (diagMap[normSym] && diagMap[normSym].resolutionStatus !== 'NOT_SUPPORTED_BY_BROKER')
  );

  if (!isBrokerSupported && !quotePresent && !specsPresent) {
    status = 'UNAVAILABLE';
    statusReason = 'Not supported or offered on connected MT5 broker';
  } else if (!marketSessionOpen) {
    status = 'MARKET_CLOSED';
    statusReason = `Market session currently closed (${sessionStateLabel})`;
  } else if (quotePresent && quoteFresh && specsPresent && totalCandleBars >= 20) {
    status = 'LIVE';
    statusReason = 'Live MT5 broker quote authority, verified specs & candle stream';
  } else if (quotePresent && (!quoteFresh || totalCandleBars < 20)) {
    status = 'DEGRADED';
    statusReason = !quoteFresh
      ? 'Quote telemetry is stale or delayed'
      : 'Partial candle history available from broker';
  } else if (isBrokerSupported && (!quotePresent || !specsPresent)) {
    status = 'DATA_LIMITED';
    statusReason = 'Broker instrument recognized, but quote or spec telemetry is pending';
  } else {
    status = 'UNAVAILABLE';
    statusReason = 'Telemetry unavailable';
  }

  return {
    symbol: normSym,
    category,
    displayName,
    brokerSymbol,
    status,
    statusReason,
    quotePresent,
    quoteFresh,
    bid,
    ask,
    spread,
    specsPresent,
    contractSize,
    tickValue,
    minLot,
    maxLot,
    lotStep,
    marketSessionOpen,
    sessionStateLabel,
    candlesAvailable,
    candleBarsCount: totalCandleBars,
    lastUpdated
  };
}

/**
 * Evaluate complete 26-instrument runtime capability matrix
 */
export function evaluateRuntimeCapabilityMatrix(
  bridgeStatus?: any,
  candleStore?: any,
  nowMs: number = Date.now()
): RuntimeCapabilityMatrix {
  const allMarkets = getAllMarkets();
  const instruments: Record<string, AssetRuntimeCapability> = {};

  let liveCount = 0;
  let degradedCount = 0;
  let closedCount = 0;
  let dataLimitedCount = 0;
  let unavailableCount = 0;

  const categoryAggregates: Record<string, { total: number; live: number; marketClosed: number; dataLimited: number; unavailable: number }> = {
    METALS: { total: 0, live: 0, marketClosed: 0, dataLimited: 0, unavailable: 0 },
    FOREX: { total: 0, live: 0, marketClosed: 0, dataLimited: 0, unavailable: 0 },
    INDICES: { total: 0, live: 0, marketClosed: 0, dataLimited: 0, unavailable: 0 },
    COMMODITIES: { total: 0, live: 0, marketClosed: 0, dataLimited: 0, unavailable: 0 },
    CRYPTO: { total: 0, live: 0, marketClosed: 0, dataLimited: 0, unavailable: 0 }
  };

  for (const m of allMarkets) {
    const cap = evaluateAssetCapability(m.symbol, bridgeStatus, candleStore, nowMs);
    instruments[m.symbol] = cap;

    if (cap.status === 'LIVE') liveCount++;
    else if (cap.status === 'DEGRADED') degradedCount++;
    else if (cap.status === 'MARKET_CLOSED') closedCount++;
    else if (cap.status === 'DATA_LIMITED') dataLimitedCount++;
    else unavailableCount++;

    const cat = cap.category.toUpperCase();
    if (!categoryAggregates[cat]) {
      categoryAggregates[cat] = { total: 0, live: 0, marketClosed: 0, dataLimited: 0, unavailable: 0 };
    }
    categoryAggregates[cat].total++;
    if (cap.status === 'LIVE') categoryAggregates[cat].live++;
    else if (cap.status === 'MARKET_CLOSED') categoryAggregates[cat].marketClosed++;
    else if (cap.status === 'DATA_LIMITED') categoryAggregates[cat].dataLimited++;
    else categoryAggregates[cat].unavailable++;
  }

  const summaryByCategory: Record<string, any> = {};
  for (const [cat, agg] of Object.entries(categoryAggregates)) {
    let catStatus: RuntimeCapabilityStatus = 'UNAVAILABLE';
    if (agg.live > 0) catStatus = 'LIVE';
    else if (agg.marketClosed > 0) catStatus = 'MARKET_CLOSED';
    else if (agg.dataLimited > 0) catStatus = 'DATA_LIMITED';
    summaryByCategory[cat] = {
      ...agg,
      status: catStatus
    };
  }

  return {
    timestamp: nowMs,
    totalAssets: allMarkets.length,
    liveAssetsCount: liveCount,
    degradedAssetsCount: degradedCount,
    marketClosedAssetsCount: closedCount,
    dataLimitedAssetsCount: dataLimitedCount,
    unavailableAssetsCount: unavailableCount,
    instruments,
    summaryByCategory
  };
}

