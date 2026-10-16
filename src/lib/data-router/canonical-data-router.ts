/**
 * FEF TRADING SOLUTIONS — CANONICAL MULTI-SOURCE DATA ROUTER
 * Phase 2D & V1.1 Independent Market Intelligence Architecture
 *
 * Single point of authority for routing market data per asset and data type:
 * - QUOTE: MT5 Broker when fresh -> Independent Feed -> Unavailable
 * - CANDLES: MT5 Broker OHLC -> Independent Verified OHLC -> Unavailable
 * - MACRO: Sovereign Yields / Central Bank Policy -> Data Limited
 * - NEWS: Live Wire -> Data Limited
 * - CORRELATION: Multi-Asset Basket -> Data Limited
 * - SENTIMENT: Contrarian Retail Skew -> Data Limited
 * - ORDER_FLOW: Level 2 / CVD -> Data Limited
 *
 * Guaranteed provenance metadata attached to every routed item.
 */

import { evaluateContinuityFeed, ContinuityFeedStatus } from '../price/continuity-feed';
import { getVerifiedCandles, VerifiedCandleResponse } from '../candles/independent-candle-service';
import { OHLCCandle } from '../market/canonical-market-snapshot';

export type DataType =
  | 'QUOTE'
  | 'CANDLES'
  | 'MACRO'
  | 'NEWS'
  | 'CORRELATION'
  | 'SENTIMENT'
  | 'INSTITUTIONAL'
  | 'ORDER_FLOW';

export type VerificationState = 'VERIFIED' | 'DERIVED' | 'DATA_LIMITED' | 'UNAVAILABLE';

export interface DataProvenance {
  dataType: DataType;
  symbol: string;
  provider: string;
  sourceType: 'BROKER_DIRECT' | 'PUBLIC_API' | 'DERIVED_MATH' | 'NONE' | 'REFERENCE_PROXY';
  timestamp: number;
  freshnessMs: number;
  freshnessState: 'FRESH' | 'STALE' | 'OFFLINE';
  verificationState: VerificationState;
  brokerSpecific: boolean;
  executable: boolean;
  referenceOnly: boolean;
  timeframe?: string;
  lastSuccessfulUpdate: number;
  failureReason?: string;
}

export interface RoutedQuote {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  spread: number;
  provenance: DataProvenance;
  continuity: ContinuityFeedStatus;
}

export interface RoutedCandles {
  symbol: string;
  timeframe: string;
  count: number;
  candles: OHLCCandle[];
  provenance: DataProvenance;
}

export class CanonicalDataRouter {
  /**
   * Resolve authoritative quote for an asset
   */
  public resolveQuote(params: {
    symbol: string;
    brokerQuote?: any;
    referencePrice?: number;
    referenceProvider?: string;
  }): RoutedQuote {
    const { symbol, brokerQuote, referencePrice, referenceProvider } = params;
    const continuity = evaluateContinuityFeed({
      symbol,
      brokerQuote,
      referencePrice,
      referenceProvider,
    });

    const isBroker = continuity.priceAuthority === 'MT5_BROKER';
    const isProxy = continuity.priceAuthority === 'REFERENCE_PROXY';
    const provenance: DataProvenance = {
      dataType: 'QUOTE',
      symbol,
      provider: continuity.provider,
      sourceType: isBroker
        ? 'BROKER_DIRECT'
        : (isProxy
            ? 'REFERENCE_PROXY'
            : (continuity.priceAuthority === 'REFERENCE_MARKET' || continuity.priceAuthority === 'REFERENCE' ? 'PUBLIC_API' : 'NONE')),
      timestamp: continuity.updatedAt,
      freshnessMs: continuity.brokerQuoteAgeMs ?? 0,
      freshnessState: continuity.state === 'BROKER_STALE' ? 'STALE' : (continuity.state === 'OFFLINE' ? 'OFFLINE' : 'FRESH'),
      verificationState: continuity.priceAuthority !== 'UNAVAILABLE' ? 'VERIFIED' : 'UNAVAILABLE',
      brokerSpecific: isBroker,
      executable: isBroker && !continuity.executionLocked,
      referenceOnly: !isBroker,
      lastSuccessfulUpdate: continuity.updatedAt,
      failureReason: continuity.reason,
    };

    return {
      symbol,
      price: continuity.activePrice,
      bid: continuity.bid,
      ask: continuity.ask,
      spread: continuity.spread,
      provenance,
      continuity,
    };
  }

  /**
   * Resolve authoritative OHLC candles for an asset and timeframe
   */
  public async resolveCandles(symbol: string, timeframe: string = 'M30'): Promise<RoutedCandles> {
    const normSymbol = (symbol || 'XAUUSD').toUpperCase();
    const normTf = (timeframe || 'M30').toUpperCase();

    const candleRes: VerifiedCandleResponse = await getVerifiedCandles(normSymbol, normTf);
    const hasCandles = candleRes.success && candleRes.candles.length >= 10;

    const provenance: DataProvenance = {
      dataType: 'CANDLES',
      symbol: normSymbol,
      provider: candleRes.provider,
      sourceType: candleRes.provenance.includes('BROKER') ? 'BROKER_DIRECT' : (hasCandles ? 'PUBLIC_API' : 'NONE'),
      timestamp: candleRes.updatedAt,
      freshnessMs: candleRes.ageMs,
      freshnessState: candleRes.state === 'VERIFIED' ? 'FRESH' : 'OFFLINE',
      verificationState: hasCandles ? 'VERIFIED' : 'DATA_LIMITED',
      brokerSpecific: candleRes.provenance.includes('BROKER'),
      executable: false, // Candles are context only, never direct execution price
      referenceOnly: !candleRes.provenance.includes('BROKER'),
      timeframe: normTf,
      lastSuccessfulUpdate: candleRes.updatedAt,
      failureReason: candleRes.error?.message,
    };

    return {
      symbol: normSymbol,
      timeframe: normTf,
      count: candleRes.count,
      candles: candleRes.candles,
      provenance,
    };
  }
}

export const canonicalDataRouter = new CanonicalDataRouter();
