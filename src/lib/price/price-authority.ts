/**
 * FEF TRADING SOLUTIONS — CANONICAL PRICE MODEL & PRICE AUTHORITY RESOLVER
 * 
 * Primary Architectural Rule:
 * When a verified MT5 broker connection exists, MT5 broker BID/ASK is the
 * SOLE AUTHORITATIVE EXECUTION PRICE.
 * 
 * Purposes:
 * - EXECUTION: MT5 broker price strictly required (BUY -> ASK, SELL -> BID).
 *   If unavailable, stale, session-closed, or remote production -> EXECUTION LOCKED.
 * - POSITION_SIZING: Uses broker contract specification & broker price when connected.
 * - RISK: Broker price required for executable trade risk calculations.
 * - AGENT_ANALYSIS: Reference feed permitted, but source must remain attached.
 * - DISPLAY_REFERENCE: External/reference feed allowed.
 * - CHART_CONTEXT: Reference feed allowed.
 * 
 * Cross-Feed Monitor:
 * - Deterministically calculates basis difference in bps & % between brokerMid and referencePrice.
 * - Timestamp-aware: Never compares stale feeds as simultaneous ticks.
 * - Categorizes basis into: NORMAL_BASIS, ELEVATED_BASIS, STALE_SOURCE, SOURCE_DIVERGENCE.
 * - ZERO synthetic price offsets or artificial price matching.
 */

import { MT5QuoteData } from '../bridge/mt5-bridge-protocol';
import { LiveMarketAsset } from '../providers/real-market-api';

export type PriceClass =
  | 'EXECUTABLE_BROKER'
  | 'BROKER_EXECUTABLE'
  | 'REFERENCE_LIVE'
  | 'REFERENCE_DELAYED'
  | 'REFERENCE'
  | 'ESTIMATION_REFERENCE'
  | 'CACHED'
  | 'UNAVAILABLE';

export type PricePurpose =
  | 'DISPLAY_REFERENCE'
  | 'AGENT_ANALYSIS'
  | 'CHART_CONTEXT'
  | 'RISK'
  | 'POSITION_SIZING'
  | 'EXECUTION';

export interface CanonicalPrice {
  canonicalSymbol: string;
  brokerSymbol: string;

  bid?: number;
  ask?: number;
  mid: number;

  provider: string;
  provenance: string;
  providerType: 'MT5_BROKER' | 'MT5_REMOTE_BROKER' | 'PUBLIC_API' | 'DERIVED' | 'SYNTHETIC_FALLBACK';

  priceClass: PriceClass;

  timestamp: number;
  providerTimestamp?: number;
  receivedAt: number;
  ageMs: number;
  freshness: 'FRESH' | 'STALE' | 'SESSION_CLOSED' | 'UNAVAILABLE';

  broker?: string;
  server?: string;

  executable: boolean;
  sourcePriority: number; // e.g. 100 for MT5_BROKER, 50 for REFERENCE_LIVE, 10 for CACHED

  spread?: number;
  digits: number;
  point: number;
}

export interface PriceResolutionContext {
  brokerQuote?: MT5QuoteData | null;
  referenceAsset?: LiveMarketAsset | null;
  isMt5Connected?: boolean;
  operatingMode?: 'READ_ONLY' | 'DEMO_EXECUTION' | 'LIVE_EXECUTION' | 'UNIVERSAL_EXECUTION';
  direction?: 'BUY' | 'SELL';
  side?: 'BUY' | 'SELL';
  brokerName?: string;
  brokerServer?: string;
  isProduction?: boolean;
  isRemoteMt5?: boolean;
}

export interface PriceResolutionResult {
  price: number;
  canonical: CanonicalPrice | null;
  effectivePrice: number;
  purpose: PricePurpose;
  isExecutable: boolean;
  executable: boolean;
  status: 'RESOLVED' | 'LOCKED' | 'UNAVAILABLE';
  reason?: string;
  sourceUsed: string;
  direction?: 'BUY' | 'SELL';
  provenance: string;
  priceClass: PriceClass;
  providerType: 'MT5_BROKER' | 'MT5_REMOTE_BROKER' | 'PUBLIC_API' | 'DERIVED' | 'SYNTHETIC_FALLBACK';
  freshness: 'FRESH' | 'STALE' | 'SESSION_CLOSED' | 'UNAVAILABLE';
}

export type CrossFeedBasisStatus =
  | 'NORMAL_BASIS'
  | 'ELEVATED_BASIS'
  | 'STALE_SOURCE'
  | 'SOURCE_DIVERGENCE'
  | 'REFERENCE_DIVERGENCE'
  | 'UNAVAILABLE';

export interface CrossFeedComparison {
  canonicalSymbol: string;
  brokerSymbol: string;
  brokerBid: number;
  brokerAsk: number;
  brokerMid: number;
  brokerPrice: number;
  referencePrice: number;
  absoluteDifference: number;
  divergenceAbs: number;
  differenceBps: number;
  basisBps: number;
  differencePercent: number;
  basisPercent: number;
  brokerTimestamp: number;
  brokerAgeMs: number;
  referenceTimestamp: number;
  referenceAgeMs: number;
  status: CrossFeedBasisStatus;
  statusLabel: string;
  isStaleComparison: boolean;
  explanation: string;
}

/**
 * Check whether current environment is production without a dedicated remote MT5 bridge
 */
export function isProductionWithoutRemoteBridge(env?: string, remoteUrl?: string): boolean {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
    if (!isLocal) {
      return true;
    }
  }
  const appEnv = env !== undefined ? env : process.env.NEXT_PUBLIC_APP_ENV;
  const mt5Url = remoteUrl !== undefined ? remoteUrl : process.env.NEXT_PUBLIC_MT5_REMOTE_URL;
  if (appEnv === 'production' && !mt5Url) {
    return true;
  }
  return false;
}

/**
 * Build CanonicalPrice from MT5 broker quote
 */
export function buildCanonicalFromBrokerQuote(
  canonicalSymbol: string,
  quote: MT5QuoteData,
  brokerName?: string,
  brokerServer?: string,
  nowMs: number = Date.now(),
  isRemote: boolean = false
): CanonicalPrice {
  const quoteTime = quote.timestamp || (quote.time ? new Date(quote.time).getTime() : nowMs);
  const calculatedAge = Math.max(0, nowMs - (isNaN(quoteTime) ? nowMs : quoteTime));
  const ageMs = typeof quote.ageMs === 'number' ? quote.ageMs : calculatedAge;
  const isFresh = (quote.freshness === 'FRESH' || (!quote.freshness && !quote.isStale)) && !quote.isStale && ageMs < 5000;
  const bid = Number(quote.bid || 0);
  const ask = Number(quote.ask || 0);
  const mid = Number(((bid + ask) / 2).toFixed(quote.digits || 2));
  const bName = brokerName && brokerName !== 'UNKNOWN BROKER' ? brokerName : 'MT5 Broker';
  const provenance = isRemote
    ? `MT5_REMOTE:${bName}${brokerServer ? ` (${brokerServer})` : ''}`
    : `MT5:${bName}${brokerServer ? ` (${brokerServer})` : ''}`;

  return {
    canonicalSymbol,
    brokerSymbol: quote.brokerSymbol || canonicalSymbol,
    bid,
    ask,
    mid,
    provider: isRemote ? `${bName} (Remote Relay)` : bName,
    provenance,
    providerType: isRemote ? 'MT5_REMOTE_BROKER' : 'MT5_BROKER',
    priceClass: isRemote
      ? (isFresh ? 'REFERENCE_LIVE' : quote.freshness === 'SESSION_CLOSED' ? 'REFERENCE_DELAYED' : 'CACHED')
      : (isFresh ? 'EXECUTABLE_BROKER' : quote.freshness === 'SESSION_CLOSED' ? 'REFERENCE_DELAYED' : 'CACHED'),
    timestamp: quoteTime,
    providerTimestamp: quoteTime,
    receivedAt: nowMs,
    ageMs,
    freshness: quote.freshness || (isFresh ? 'FRESH' : 'STALE'),
    broker: bName,
    server: brokerServer,
    executable: isRemote ? false : isFresh,
    sourcePriority: isRemote ? 90 : 100,
    spread: Number(quote.spread || (ask - bid)),
    digits: Number(quote.digits || 2),
    point: Number(quote.point || 0.01)
  };
}

/**
 * Build CanonicalPrice from public/reference market feed (e.g. Gold-API, Binance, Open-ER)
 */
export function buildCanonicalFromReferenceFeed(
  canonicalSymbol: string,
  priceOrAsset: number | LiveMarketAsset,
  providerName?: string,
  nowMs: number = Date.now()
): CanonicalPrice {
  if (typeof priceOrAsset === 'number') {
    const p = priceOrAsset;
    const prov = providerName || 'Reference Feed';
    return {
      canonicalSymbol,
      brokerSymbol: canonicalSymbol,
      bid: undefined,
      ask: undefined,
      mid: p,
      provider: prov,
      provenance: prov,
      providerType: 'PUBLIC_API',
      priceClass: 'REFERENCE_LIVE',
      timestamp: nowMs,
      providerTimestamp: nowMs,
      receivedAt: nowMs,
      ageMs: 0,
      freshness: 'FRESH',
      executable: false, // REFERENCE FEEDS ARE NEVER EXECUTABLE
      sourcePriority: 50,
      spread: undefined,
      digits: canonicalSymbol.includes('JPY') ? 3 : (canonicalSymbol.startsWith('XAU') || canonicalSymbol.startsWith('BTC')) ? 2 : 5,
      point: canonicalSymbol.includes('JPY') ? 0.001 : 0.01
    };
  }

  const asset = priceOrAsset;
  const p = Number(asset.price || 0);
  const prov = asset.provider || (asset as any).source || providerName || 'Public Reference Feed';
  const isLive = asset.feedStatus === 'LIVE' || asset.classification === 'LIVE';

  return {
    canonicalSymbol,
    brokerSymbol: canonicalSymbol,
    bid: asset.bid,
    ask: asset.ask,
    mid: p,
    provider: prov,
    provenance: prov,
    providerType: 'PUBLIC_API',
    priceClass: isLive ? 'REFERENCE_LIVE' : 'REFERENCE_DELAYED',
    timestamp: nowMs,
    receivedAt: nowMs,
    ageMs: 0,
    freshness: isLive ? 'FRESH' : 'STALE',
    executable: false, // REFERENCE FEEDS ARE NEVER EXECUTABLE
    sourcePriority: 50,
    spread: asset.spread,
    digits: canonicalSymbol.includes('JPY') ? 3 : (canonicalSymbol.startsWith('XAU') || canonicalSymbol.startsWith('BTC')) ? 2 : 5,
    point: canonicalSymbol.includes('JPY') ? 0.001 : 0.01
  };
}

/**
 * CENTRAL PRICE AUTHORITY RESOLVER
 * 
 * Resolves authoritative price per purpose with fail-closed safety.
 */
export function resolvePriceForPurpose(
  symbol: string,
  purpose: PricePurpose,
  context: PriceResolutionContext
): PriceResolutionResult {
  const now = Date.now();
  const upper = symbol.toUpperCase().trim();
  const dir = context.direction || context.side || 'BUY';

  // 1. Build canonical representations if data is provided
  const brokerCanonical = context.brokerQuote && context.brokerQuote.bid > 0
    ? buildCanonicalFromBrokerQuote(upper, context.brokerQuote, context.brokerName, context.brokerServer, now, Boolean(context.isRemoteMt5))
    : null;

  const referenceCanonical = context.referenceAsset && context.referenceAsset.price > 0
    ? buildCanonicalFromReferenceFeed(upper, context.referenceAsset, undefined, now)
    : null;

  // 2. Production Environment Check (Defense-in-depth)
  const isProd = context.isProduction !== undefined ? context.isProduction : isProductionWithoutRemoteBridge();

  // 3. EXECUTION PURPOSE: Broker price strictly required
  if (purpose === 'EXECUTION') {
    // Fail closed if remote MT5 in Phase 2B (telemetry only)
    if (context.isRemoteMt5) {
      return {
        price: 0,
        canonical: brokerCanonical,
        effectivePrice: 0,
        purpose,
        isExecutable: false,
        executable: false,
        status: 'LOCKED',
        reason: 'Phase 2B is TELEMETRY ONLY. Remote execution is disabled.',
        sourceUsed: 'NONE',
        direction: dir,
        provenance: brokerCanonical ? brokerCanonical.provenance : 'MT5_REMOTE_BROKER',
        priceClass: 'UNAVAILABLE',
        providerType: 'MT5_REMOTE_BROKER',
        freshness: brokerCanonical ? brokerCanonical.freshness : 'UNAVAILABLE'
      };
    }

    if (isProd) {
      return {
        price: 0,
        canonical: null,
        effectivePrice: 0,
        purpose,
        isExecutable: false,
        executable: false,
        status: 'LOCKED',
        reason: 'PRODUCTION ISOLATION: Production web app cannot connect to 127.0.0.1 MT5 bridge. Execution strictly locked.',
        sourceUsed: 'NONE',
        direction: dir,
        provenance: 'NONE',
        priceClass: 'UNAVAILABLE',
        providerType: 'SYNTHETIC_FALLBACK',
        freshness: 'UNAVAILABLE'
      };
    }

    if (!context.isMt5Connected || !brokerCanonical) {
      const refPrice = referenceCanonical ? referenceCanonical.mid : (context.referenceAsset?.price || 0);
      return {
        price: refPrice,
        canonical: referenceCanonical,
        effectivePrice: refPrice,
        purpose,
        isExecutable: false,
        executable: false,
        status: 'LOCKED',
        reason: 'MT5 broker terminal is not connected. Live execution requires verified MT5 broker connection. Reference feed cannot execute.',
        sourceUsed: 'NONE',
        direction: dir,
        provenance: referenceCanonical ? referenceCanonical.provenance : 'REFERENCE FEED',
        priceClass: 'REFERENCE',
        providerType: referenceCanonical ? referenceCanonical.providerType : 'PUBLIC_API',
        freshness: referenceCanonical ? referenceCanonical.freshness : 'UNAVAILABLE'
      };
    }
    if (context.operatingMode === 'READ_ONLY' || (context.operatingMode && context.operatingMode !== 'DEMO_EXECUTION')) {
      return {
        price: brokerCanonical.mid,
        canonical: brokerCanonical,
        effectivePrice: brokerCanonical.mid,
        purpose,
        isExecutable: false,
        executable: false,
        status: 'LOCKED',
        reason: `OPERATING MODE LOCKED: Current mode is '${context.operatingMode || 'READ_ONLY'}'. DEMO_EXECUTION required.`,
        sourceUsed: brokerCanonical.provider,
        direction: dir,
        provenance: brokerCanonical.provenance,
        priceClass: brokerCanonical.priceClass,
        providerType: brokerCanonical.providerType,
        freshness: brokerCanonical.freshness
      };
    }
    if (!brokerCanonical.executable || brokerCanonical.freshness !== 'FRESH') {
      return {
        price: brokerCanonical.mid,
        canonical: brokerCanonical,
        effectivePrice: brokerCanonical.mid,
        purpose,
        isExecutable: false,
        executable: false,
        status: 'LOCKED',
        reason: `Broker quote is stale or market session closed for ${upper} (${brokerCanonical.freshness}, ${Math.round(brokerCanonical.ageMs / 1000)}s old). Fresh live quote required.`,
        sourceUsed: brokerCanonical.provider,
        direction: dir,
        provenance: brokerCanonical.provenance,
        priceClass: brokerCanonical.priceClass,
        providerType: brokerCanonical.providerType,
        freshness: brokerCanonical.freshness
      };
    }

    // Directional Execution Pricing: BUY -> ASK, SELL -> BID
    const execPrice = dir === 'BUY' ? (brokerCanonical.ask || brokerCanonical.mid) : (brokerCanonical.bid || brokerCanonical.mid);

    return {
      price: execPrice,
      canonical: brokerCanonical,
      effectivePrice: execPrice,
      purpose,
      isExecutable: true,
      executable: true,
      status: 'RESOLVED',
      sourceUsed: `${brokerCanonical.broker || 'MT5 Broker'} (${dir === 'BUY' ? 'ASK' : 'BID'})`,
      direction: dir,
      provenance: brokerCanonical.provenance,
      priceClass: 'EXECUTABLE_BROKER',
      providerType: 'MT5_BROKER',
      freshness: brokerCanonical.freshness
    };
  }

  // 4. POSITION_SIZING PURPOSE
  if (purpose === 'POSITION_SIZING') {
    if (brokerCanonical && brokerCanonical.executable && context.isMt5Connected && !isProd) {
      const sizingPrice = dir === 'BUY' ? (brokerCanonical.ask || brokerCanonical.mid) : (brokerCanonical.bid || brokerCanonical.mid);
      return {
        price: sizingPrice,
        canonical: brokerCanonical,
        effectivePrice: sizingPrice,
        purpose,
        isExecutable: true,
        executable: true,
        status: 'RESOLVED',
        sourceUsed: `${brokerCanonical.broker || 'MT5'} BROKER LIVE (${dir === 'BUY' ? 'ASK' : 'BID'})`,
        direction: dir,
        provenance: brokerCanonical.provenance,
        priceClass: 'EXECUTABLE_BROKER',
        providerType: 'MT5_BROKER',
        freshness: brokerCanonical.freshness
      };
    }

    // Disconnected sizing fallback: Allowed for hypothetical calculators, but marked non-executable
    if (referenceCanonical) {
      return {
        price: referenceCanonical.mid,
        canonical: referenceCanonical,
        effectivePrice: referenceCanonical.mid,
        purpose,
        isExecutable: false,
        executable: false,
        status: 'RESOLVED',
        reason: 'STATIC FALLBACK: Using reference feed for hypothetical sizing. Not executable without live MT5 broker connection.',
        sourceUsed: `${referenceCanonical.provider} (REFERENCE ONLY)`,
        direction: dir,
        provenance: referenceCanonical.provenance,
        priceClass: 'ESTIMATION_REFERENCE',
        providerType: 'PUBLIC_API',
        freshness: referenceCanonical.freshness
      };
    }

    return {
      price: 0,
      canonical: null,
      effectivePrice: 0,
      purpose,
      isExecutable: false,
      executable: false,
      status: 'UNAVAILABLE',
      reason: `No price available for position sizing on ${upper}.`,
      sourceUsed: 'NONE',
      direction: dir,
      provenance: 'NONE',
      priceClass: 'UNAVAILABLE',
      providerType: 'SYNTHETIC_FALLBACK',
      freshness: 'UNAVAILABLE'
    };
  }

  // 5. RISK PURPOSE
  if (purpose === 'RISK') {
    if (brokerCanonical && brokerCanonical.executable && context.isMt5Connected && !isProd) {
      const riskRefPrice = dir === 'BUY' ? (brokerCanonical.ask || brokerCanonical.mid) : (brokerCanonical.bid || brokerCanonical.mid);
      return {
        price: riskRefPrice,
        canonical: brokerCanonical,
        effectivePrice: riskRefPrice,
        purpose,
        isExecutable: true,
        executable: true,
        status: 'RESOLVED',
        sourceUsed: `${brokerCanonical.broker || 'MT5'} BROKER LIVE`,
        direction: dir,
        provenance: brokerCanonical.provenance,
        priceClass: 'EXECUTABLE_BROKER',
        providerType: 'MT5_BROKER',
        freshness: brokerCanonical.freshness
      };
    }

    if (referenceCanonical) {
      return {
        price: referenceCanonical.mid,
        canonical: referenceCanonical,
        effectivePrice: referenceCanonical.mid,
        purpose,
        isExecutable: false,
        executable: false,
        status: 'RESOLVED',
        reason: 'REFERENCE METRIC: Realized risk requires broker price. Reference feed provides theoretical bounds only.',
        sourceUsed: `${referenceCanonical.provider} (REFERENCE)`,
        direction: dir,
        provenance: referenceCanonical.provenance,
        priceClass: 'REFERENCE',
        providerType: 'PUBLIC_API',
        freshness: referenceCanonical.freshness
      };
    }

    return {
      price: 0,
      canonical: null,
      effectivePrice: 0,
      purpose,
      isExecutable: false,
      executable: false,
      status: 'UNAVAILABLE',
      reason: `Risk evaluation price unavailable for ${upper}.`,
      sourceUsed: 'NONE',
      direction: dir,
      provenance: 'NONE',
      priceClass: 'UNAVAILABLE',
      providerType: 'SYNTHETIC_FALLBACK',
      freshness: 'UNAVAILABLE'
    };
  }

  // 6. AGENT_ANALYSIS & CHART_CONTEXT PURPOSES
  if (purpose === 'AGENT_ANALYSIS' || purpose === 'CHART_CONTEXT') {
    if (referenceCanonical) {
      return {
        price: referenceCanonical.mid,
        canonical: referenceCanonical,
        effectivePrice: referenceCanonical.mid,
        purpose,
        isExecutable: false,
        executable: false,
        status: 'RESOLVED',
        sourceUsed: `${referenceCanonical.provider} (REFERENCE FEED)`,
        direction: dir,
        provenance: referenceCanonical.provenance,
        priceClass: 'REFERENCE',
        providerType: 'PUBLIC_API',
        freshness: referenceCanonical.freshness
      };
    }

    if (brokerCanonical && (context.isRemoteMt5 ? (brokerCanonical.freshness !== 'UNAVAILABLE') : (brokerCanonical.executable && !isProd))) {
      return {
        price: brokerCanonical.mid,
        canonical: brokerCanonical,
        effectivePrice: brokerCanonical.mid,
        purpose,
        isExecutable: false,
        executable: false,
        status: 'RESOLVED',
        sourceUsed: context.isRemoteMt5
          ? `${brokerCanonical.broker || 'MT5'} (REMOTE BROKER TELEMETRY MID)`
          : `${brokerCanonical.broker || 'MT5'} (BROKER LIVE MID)`,
        direction: dir,
        provenance: brokerCanonical.provenance,
        priceClass: 'REFERENCE',
        providerType: brokerCanonical.providerType,
        freshness: brokerCanonical.freshness
      };
    }

    return {
      price: 0,
      canonical: null,
      effectivePrice: 0,
      purpose,
      isExecutable: false,
      executable: false,
      status: 'UNAVAILABLE',
      reason: `Analysis feed unavailable for ${upper}.`,
      sourceUsed: 'NONE',
      direction: dir,
      provenance: 'NONE',
      priceClass: 'UNAVAILABLE',
      providerType: 'SYNTHETIC_FALLBACK',
      freshness: 'UNAVAILABLE'
    };
  }

  // 7. DISPLAY_REFERENCE (Default UI Overview)
  if (brokerCanonical && (context.isRemoteMt5 ? (brokerCanonical.freshness !== 'UNAVAILABLE') : (brokerCanonical.executable && !isProd))) {
    return {
      price: brokerCanonical.mid,
      canonical: brokerCanonical,
      effectivePrice: brokerCanonical.mid,
      purpose: 'DISPLAY_REFERENCE',
      isExecutable: false,
      executable: false,
      status: 'RESOLVED',
      sourceUsed: context.isRemoteMt5
        ? `${brokerCanonical.broker || 'MT5'} REMOTE BROKER TELEMETRY`
        : `${brokerCanonical.broker || 'MT5'} BROKER LIVE`,
      direction: dir,
      provenance: brokerCanonical.provenance,
      priceClass: 'REFERENCE',
      providerType: brokerCanonical.providerType,
      freshness: brokerCanonical.freshness
    };
  }

  if (referenceCanonical) {
    return {
      price: referenceCanonical.mid,
      canonical: referenceCanonical,
      effectivePrice: referenceCanonical.mid,
      purpose: 'DISPLAY_REFERENCE',
      isExecutable: false,
      executable: false,
      status: 'RESOLVED',
      sourceUsed: `${referenceCanonical.provider} (REFERENCE FEED)`,
      direction: dir,
      provenance: referenceCanonical.provenance,
      priceClass: 'REFERENCE',
      providerType: 'PUBLIC_API',
      freshness: referenceCanonical.freshness
    };
  }

  return {
    price: 0,
    canonical: null,
    effectivePrice: 0,
    purpose: 'DISPLAY_REFERENCE',
    isExecutable: false,
    executable: false,
    status: 'UNAVAILABLE',
    reason: `Price unavailable for ${upper}.`,
    sourceUsed: 'NONE',
    direction: dir,
    provenance: 'NONE',
    priceClass: 'UNAVAILABLE',
    providerType: 'SYNTHETIC_FALLBACK',
    freshness: 'UNAVAILABLE'
  };
}

/**
 * CROSS-FEED DIVERGENCE MONITOR
 * 
 * Deterministically compares MT5 broker pricing with external reference feed
 * without applying synthetic offsets or artificial transformations.
 */
export function evaluateCrossFeedDivergence(
  canonicalSymbol: string,
  brokerQuote: MT5QuoteData | null | undefined,
  referenceAsset: LiveMarketAsset | null | undefined,
  options: {
    maxStaleAgeMs?: number;
    normalBasisThresholdBps?: number;
    elevatedBasisThresholdBps?: number;
    nowMs?: number;
  } = {}
): CrossFeedComparison {
  const now = options.nowMs || Date.now();
  const maxStaleAge = options.maxStaleAgeMs || 30000;
  const normalThreshold = options.normalBasisThresholdBps || 15.0; // 0.15%
  const elevatedThreshold = options.elevatedBasisThresholdBps || 50.0; // 0.50%

  if (!brokerQuote || brokerQuote.bid <= 0 || brokerQuote.ask <= 0) {
    return {
      canonicalSymbol,
      brokerSymbol: brokerQuote?.brokerSymbol || canonicalSymbol,
      brokerBid: 0,
      brokerAsk: 0,
      brokerMid: 0,
      brokerPrice: 0,
      referencePrice: referenceAsset?.price || 0,
      absoluteDifference: 0,
      divergenceAbs: 0,
      differenceBps: 0,
      basisBps: 0,
      differencePercent: 0,
      basisPercent: 0,
      brokerTimestamp: 0,
      brokerAgeMs: Infinity,
      referenceTimestamp: now,
      referenceAgeMs: 0,
      status: 'UNAVAILABLE',
      statusLabel: 'BROKER FEED OFFLINE',
      isStaleComparison: true,
      explanation: 'MT5 broker quote is not connected or streaming.'
    };
  }

  const brokerTime = brokerQuote.timestamp || (brokerQuote.time ? new Date(brokerQuote.time).getTime() : now);
  const brokerAge = typeof brokerQuote.ageMs === 'number' ? brokerQuote.ageMs : Math.max(0, now - brokerTime);
  const refPrice = Number(referenceAsset?.price || 0);

  if (refPrice <= 0) {
    const mid = Number(((brokerQuote.bid + brokerQuote.ask) / 2).toFixed(brokerQuote.digits || 2));
    return {
      canonicalSymbol,
      brokerSymbol: brokerQuote.brokerSymbol || canonicalSymbol,
      brokerBid: brokerQuote.bid,
      brokerAsk: brokerQuote.ask,
      brokerMid: mid,
      brokerPrice: mid,
      referencePrice: 0,
      absoluteDifference: 0,
      divergenceAbs: 0,
      differenceBps: 0,
      basisBps: 0,
      differencePercent: 0,
      basisPercent: 0,
      brokerTimestamp: brokerTime,
      brokerAgeMs: brokerAge,
      referenceTimestamp: 0,
      referenceAgeMs: Infinity,
      status: 'UNAVAILABLE',
      statusLabel: 'REFERENCE FEED OFFLINE',
      isStaleComparison: true,
      explanation: 'Reference market feed price is unavailable.'
    };
  }

  const brokerMid = Number(((brokerQuote.bid + brokerQuote.ask) / 2).toFixed(brokerQuote.digits || 2));
  const absDiff = Math.abs(brokerMid - refPrice);
  const diffPct = brokerMid > 0 ? (absDiff / brokerMid) * 100 : 0;
  const diffBps = diffPct * 100;
  const roundedAbs = Number(absDiff.toFixed(brokerQuote.digits || 2));
  const roundedBps = Number(diffBps.toFixed(1));
  const roundedPct = Number(diffPct.toFixed(3));

  // Stale check: A stale feed must NEVER be compared as though timestamps were simultaneous
  const isBrokerStale = brokerAge > maxStaleAge || brokerQuote.freshness === 'STALE' || brokerQuote.freshness === 'SESSION_CLOSED';

  if (isBrokerStale) {
    return {
      canonicalSymbol,
      brokerSymbol: brokerQuote.brokerSymbol || canonicalSymbol,
      brokerBid: brokerQuote.bid,
      brokerAsk: brokerQuote.ask,
      brokerMid,
      brokerPrice: brokerMid,
      referencePrice: refPrice,
      absoluteDifference: roundedAbs,
      divergenceAbs: roundedAbs,
      differenceBps: roundedBps,
      basisBps: roundedBps,
      differencePercent: roundedPct,
      basisPercent: roundedPct,
      brokerTimestamp: brokerTime,
      brokerAgeMs: brokerAge,
      referenceTimestamp: now,
      referenceAgeMs: 0,
      status: 'STALE_SOURCE',
      statusLabel: 'STALE BROKER QUOTE',
      isStaleComparison: true,
      explanation: `Broker quote timestamp is ${Math.round(brokerAge / 1000)}s old (${brokerQuote.freshness || 'STALE'}). Cannot evaluate simultaneous basis.`
    };
  }

  if (diffBps <= normalThreshold) {
    return {
      canonicalSymbol,
      brokerSymbol: brokerQuote.brokerSymbol || canonicalSymbol,
      brokerBid: brokerQuote.bid,
      brokerAsk: brokerQuote.ask,
      brokerMid,
      brokerPrice: brokerMid,
      referencePrice: refPrice,
      absoluteDifference: roundedAbs,
      divergenceAbs: roundedAbs,
      differenceBps: roundedBps,
      basisBps: roundedBps,
      differencePercent: roundedPct,
      basisPercent: roundedPct,
      brokerTimestamp: brokerTime,
      brokerAgeMs: brokerAge,
      referenceTimestamp: now,
      referenceAgeMs: 0,
      status: 'NORMAL_BASIS',
      statusLabel: `NORMAL BASIS (${roundedBps} bps)`,
      isStaleComparison: false,
      explanation: `Healthy basis difference (${roundedBps} bps / ${roundedPct}%) between connected MT5 broker and reference feed.`
    };
  }

  if (diffBps <= elevatedThreshold) {
    return {
      canonicalSymbol,
      brokerSymbol: brokerQuote.brokerSymbol || canonicalSymbol,
      brokerBid: brokerQuote.bid,
      brokerAsk: brokerQuote.ask,
      brokerMid,
      brokerPrice: brokerMid,
      referencePrice: refPrice,
      absoluteDifference: roundedAbs,
      divergenceAbs: roundedAbs,
      differenceBps: roundedBps,
      basisBps: roundedBps,
      differencePercent: roundedPct,
      basisPercent: roundedPct,
      brokerTimestamp: brokerTime,
      brokerAgeMs: brokerAge,
      referenceTimestamp: now,
      referenceAgeMs: 0,
      status: 'ELEVATED_BASIS',
      statusLabel: `ELEVATED BASIS (${roundedBps} bps)`,
      isStaleComparison: false,
      explanation: `Elevated basis (${roundedBps} bps). Broker spread or session liquidity differs from reference feed.`
    };
  }

  return {
    canonicalSymbol,
    brokerSymbol: brokerQuote.brokerSymbol || canonicalSymbol,
    brokerBid: brokerQuote.bid,
    brokerAsk: brokerQuote.ask,
    brokerMid,
    brokerPrice: brokerMid,
    referencePrice: refPrice,
    absoluteDifference: roundedAbs,
    divergenceAbs: roundedAbs,
    differenceBps: roundedBps,
    basisBps: roundedBps,
    differencePercent: roundedPct,
    basisPercent: roundedPct,
    brokerTimestamp: brokerTime,
    brokerAgeMs: brokerAge,
    referenceTimestamp: now,
    referenceAgeMs: 0,
    status: 'REFERENCE_DIVERGENCE',
    statusLabel: `REFERENCE DIVERGENCE (${roundedBps} bps)`,
    isStaleComparison: false,
    explanation: `Substantial basis divergence (${roundedBps} bps / ${roundedPct}%). Connected MT5 Broker Bid/Ask is strictly authoritative for execution.`
  };
}
