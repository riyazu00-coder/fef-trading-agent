'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  fetchLiveMarketPrices,
  INITIAL_LIVE_ASSETS,
  LiveMarketAsset
} from '../lib/providers/real-market-api';
import {
  generateAssetIntelligence,
  AssetIntelligenceProfile
} from '../lib/agents/multi-asset-pipeline';
import { getMarketDefinition, getAllMarkets } from '../lib/registry/market-registry';
import { generateGlobalRadarIntelligence } from '../lib/radar/opportunity-radar-engine';
import { evaluateRadarTransitions } from '../lib/radar/radar-notifications';
import { validateCandleSeries } from '../lib/candles/candle-validator';
import { OHLCCandle } from '../lib/market/canonical-market-snapshot';
import { EvidenceClassification } from '../lib/evidence/agent-evidence';
import { LiveIntelligenceFeeds } from '../lib/intelligence/feed-types';
import {
  ConnectivityState,
  evaluateConnectivityStatus,
  evaluateBrokerQuoteFreshness,
  QUOTE_DISPLAY_FRESH_THRESHOLD_MS,
  QUOTE_DISPLAY_STALE_THRESHOLD_MS,
  MARKET_DATA_POLL_INTERVAL_MS,
} from '../lib/bridge/connectivity-policy';
import { symbolDirectory } from '../lib/bridge/symbol-mapper';
import { evaluateCanonicalDailyStats } from '../lib/price/canonical-daily-ohlc';
import { resolveCanonicalTimestampContract } from '../lib/price/canonical-timestamp-contract';

export type CandleLoadingState = 'LOADING' | 'VERIFIED' | 'STALE' | 'UNAVAILABLE' | 'ERROR';

export interface SymbolCandlePayload {
  symbol: string;
  timeframe: string;
  candles: OHLCCandle[];
  bundle?: Record<string, OHLCCandle[]>;
  provenance?: EvidenceClassification;
  provider?: string;
  state: CandleLoadingState;
  fetchedAt: number;
}

interface ActiveAssetContextType {
  activeSymbol: string;
  setActiveSymbol: (sym: string) => void;
  activeAsset: LiveMarketAsset;
  allAssets: Record<string, LiveMarketAsset>;
  timeframe: string;
  setTimeframe: (tf: string) => void;
  categoryFilter: string;
  setCategoryFilter: (cat: string) => void;
  assetProfile: AssetIntelligenceProfile;
  lastUpdated: string;
  isLive: boolean;
  refreshData: () => Promise<void>;
  candles?: OHLCCandle[];
  candleBundle?: Record<string, OHLCCandle[]>;
  candleState: CandleLoadingState;
  candleCount: number;
  candleProvenance?: EvidenceClassification;
  candleProvider?: string;
  liveFeeds?: LiveIntelligenceFeeds;
  multiAssetCandles: Record<string, {
    candles: OHLCCandle[];
    bundle?: Record<string, OHLCCandle[]>;
    provenance?: EvidenceClassification;
    provider?: string;
  }>;
  connectionStatus?: ConnectivityState;
  isMt5Connected?: boolean;
  isReferenceLive?: boolean;
  heartbeatAgeMs?: number | null;
  brokerName?: string;
  quotesAvailable?: number;
}

const ActiveAssetContext = createContext<ActiveAssetContextType | null>(null);

export const ActiveAssetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeSymbol, setActiveSymbolState] = useState<string>('XAUUSD');
  const [allAssets, setAllAssets] = useState<Record<string, LiveMarketAsset>>(INITIAL_LIVE_ASSETS);
  const [timeframe, setTimeframeState] = useState<string>('H1');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [lastUpdated, setLastUpdated] = useState<string>('Just now');
  const [isLive, setIsLive] = useState<boolean>(true);

  // Authoritative connectivity & telemetry state with anti-flap hysteresis
  const [connectionStatus, setConnectionStatus] = useState<ConnectivityState>('ONLINE');
  const [isMt5Connected, setIsMt5Connected] = useState<boolean>(true);
  const [isReferenceLive, setIsReferenceLive] = useState<boolean>(true);
  const [heartbeatAgeMs, setHeartbeatAgeMs] = useState<number | null>(null);
  const [brokerName, setBrokerName] = useState<string>('Connected Broker');
  const [quotesAvailable, setQuotesAvailable] = useState<number>(0);

  // Connectivity and race-condition tracking refs
  const allAssetsRef = useRef<Record<string, LiveMarketAsset>>(INITIAL_LIVE_ASSETS);
  const consecutiveFailuresRef = useRef<number>(0);
  const lastSuccessTimeRef = useRef<number>(Date.now());
  const connectionStateRef = useRef<ConnectivityState>('ONLINE');
  const isRefreshingRef = useRef<boolean>(false);
  const refreshGenRef = useRef<number>(0);
  const lastBrokerQuotesRef = useRef<Record<string, { quote: any; timestamp: number }>>({});

  // Symbol-bound candle state & metadata
  const [candlePayload, setCandlePayload] = useState<SymbolCandlePayload | null>(null);
  const [liveFeeds, setLiveFeeds] = useState<LiveIntelligenceFeeds | undefined>(undefined);
  const [multiAssetCandles, setMultiAssetCandles] = useState<Record<string, {
    candles: OHLCCandle[];
    bundle?: Record<string, OHLCCandle[]>;
    provenance?: EvidenceClassification;
    provider?: string;
  }>>({});

  // Global cache across evaluated assets for multi-asset radar intelligence
  const multiAssetCandleCacheRef = useRef<Record<string, {
    candles: OHLCCandle[];
    bundle?: Record<string, OHLCCandle[]>;
    provenance?: EvidenceClassification;
    provider?: string;
  }>>({});

  // Active symbol & timeframe refs to prevent out-of-order race conditions and stale closures
  const activeSymbolRef = useRef<string>('XAUUSD');
  const activeTimeframeRef = useRef<string>('H1');

  // Race-condition prevention refs for timeframe & symbol switching
  const activeFetchIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastFetchedSymRef = useRef<string>('');
  const lastFetchedTfRef = useRef<string>('');
  const backgroundSyncIndexRef = useRef<number>(0);

  // Strict symbol and timeframe validation: never allow another asset's candles
  const isCandleMatch = Boolean(
    candlePayload &&
    candlePayload.symbol === activeSymbol &&
    candlePayload.timeframe === timeframe
  );

  const candles = isCandleMatch ? candlePayload?.candles : undefined;
  const candleBundle = isCandleMatch ? candlePayload?.bundle : undefined;
  const candleProvenance = isCandleMatch ? candlePayload?.provenance : undefined;
  const candleProvider = isCandleMatch ? candlePayload?.provider : undefined;
  const candleState: CandleLoadingState = isCandleMatch ? (candlePayload?.state || 'VERIFIED') : 'LOADING';
  const candleCount = isCandleMatch ? (candlePayload?.candles?.length || 0) : 0;

  // Restore persisted active symbol on client hydration
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('fef_active_symbol');
        if (saved) {
          const canonical = getMarketDefinition(saved);
          if (canonical) {
            activeSymbolRef.current = canonical.symbol;
            setActiveSymbolState(canonical.symbol);
          }
        }
      } catch {}
    }
  }, []);

  // Fetch verified broker / independent candles with race condition protection
  const fetchCandles = useCallback(async (sym: string, tf: string) => {
    const fetchId = ++activeFetchIdRef.current;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const isSwitch = sym !== lastFetchedSymRef.current || tf !== lastFetchedTfRef.current;
    if (isSwitch) {
      // Immediately clear candle payload on symbol/timeframe switch so previous asset candles are never consumed
      setCandlePayload(null);
      lastFetchedSymRef.current = sym;
      lastFetchedTfRef.current = tf;
    }

    try {
      const res = await fetch(`/api/candles?symbol=${encodeURIComponent(sym)}&timeframe=${encodeURIComponent(tf)}&bundle=true`, {
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (fetchId !== activeFetchIdRef.current) return;
      if (sym !== activeSymbolRef.current || tf !== activeTimeframeRef.current) return;

      if (!res.ok) {
        setCandlePayload({
          symbol: sym,
          timeframe: tf,
          candles: [],
          state: 'ERROR',
          fetchedAt: Date.now()
        });
        return;
      }

      const data = await res.json();
      if (fetchId !== activeFetchIdRef.current) return;
      if (sym !== activeSymbolRef.current || tf !== activeTimeframeRef.current) return;

      if (data.success && Array.isArray(data.candles) && data.candles.length >= 10) {
        const validation = validateCandleSeries(data.candles, tf);
        if (validation.valid) {
          const prov = data.provenance as EvidenceClassification | undefined;
          const acceptedProvenance: string[] = [
            'LIVE_MT5',
            'INDEPENDENT_VERIFIED',
            'INDEPENDENT_REFERENCE',
            'INDEPENDENT_VERIFIED_OHLC',
            'INDEPENDENT_REFERENCE_OHLC',
          ];
          if (prov && acceptedProvenance.includes(prov)) {
            const normalizedProv: EvidenceClassification =
              prov === 'INDEPENDENT_VERIFIED_OHLC' || prov === 'INDEPENDENT_VERIFIED'
                ? 'INDEPENDENT_VERIFIED'
                : prov === 'INDEPENDENT_REFERENCE_OHLC' || prov === 'INDEPENDENT_REFERENCE'
                ? 'INDEPENDENT_REFERENCE'
                : (prov as EvidenceClassification);

            const provName = prov === 'LIVE_MT5'
              ? data.broker || data.provider || 'Authenticated MT5 Broker'
              : data.provider || (normalizedProv === 'INDEPENDENT_REFERENCE' ? 'Independent Reference Proxy' : 'Independent Verified Feed');

            setCandlePayload({
              symbol: sym,
              timeframe: tf,
              candles: data.candles,
              bundle: (data.timeframes && typeof data.timeframes === 'object') ? data.timeframes : undefined,
              provenance: normalizedProv,
              provider: provName,
              state: data.state === 'VERIFIED' ? 'VERIFIED' : (data.state as any) || 'VERIFIED',
              fetchedAt: Date.now()
            });

            // Store in global multi-asset cache for radar intelligence
            const candleFeed = {
              candles: data.candles,
              bundle: data.timeframes,
              provenance: normalizedProv,
              provider: provName
            };
            multiAssetCandleCacheRef.current[sym] = candleFeed;
            setMultiAssetCandles((prev) => ({
              ...prev,
              [sym]: candleFeed
            }));
            return;
          }
          console.warn(`[Candles] Missing or untrusted provenance for ${sym} ${tf}`);
        } else {
          console.warn(`[Candles] Failed validation for ${sym} ${tf}:`, validation.reason);
        }
      }

      setCandlePayload({
        symbol: sym,
        timeframe: tf,
        candles: [],
        state: data.state === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'ERROR',
        fetchedAt: Date.now()
      });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      if (fetchId !== activeFetchIdRef.current) return;
      if (sym !== activeSymbolRef.current || tf !== activeTimeframeRef.current) return;
      console.warn(`[Candles] Fetch error for ${sym} ${tf}:`, err);
      setCandlePayload({
        symbol: sym,
        timeframe: tf,
        candles: [],
        state: 'ERROR',
        fetchedAt: Date.now()
      });
    }
  }, []);

  // Universe-Wide 26-Asset Staggered Rolling Candle Ingestion Loop
  // Continuously cycles across all 26 canonical assets in batches of 4,
  // populating multiAssetCandleCacheRef and multiAssetCandles state so GlobalOpportunityRadar
  // continuously receives real structural data without starving non-active instruments.
  useEffect(() => {
    let isCancelled = false;
    const allCanonicalMarkets = getAllMarkets();
    const canonicalSymbols = allCanonicalMarkets.map((m) => m.symbol);
    const BATCH_SIZE = 4;

    const syncRollingBatch = async () => {
      if (isCancelled) return;
      const startIndex = backgroundSyncIndexRef.current;
      const batch: string[] = [];
      for (let i = 0; i < BATCH_SIZE; i++) {
        const sym = canonicalSymbols[(startIndex + i) % canonicalSymbols.length];
        if (sym && sym !== activeSymbolRef.current) {
          batch.push(sym);
        }
      }
      backgroundSyncIndexRef.current = (startIndex + BATCH_SIZE) % canonicalSymbols.length;

      for (const sym of batch) {
        if (isCancelled) break;
        try {
          const res = await fetch(`/api/candles?symbol=${encodeURIComponent(sym)}&timeframe=H1&bundle=true`, {
            headers: { 'Cache-Control': 'no-cache' }
          });
          if (res.ok) {
            const data = await res.json();
            if (data.success && Array.isArray(data.candles) && data.candles.length >= 10) {
              const prov = data.provenance as EvidenceClassification | undefined;
              const normalizedProv: EvidenceClassification =
                prov === 'INDEPENDENT_VERIFIED_OHLC' || prov === 'INDEPENDENT_VERIFIED'
                  ? 'INDEPENDENT_VERIFIED'
                  : prov === 'INDEPENDENT_REFERENCE_OHLC' || prov === 'INDEPENDENT_REFERENCE'
                  ? 'INDEPENDENT_REFERENCE'
                  : (prov as EvidenceClassification);

              const provName = prov === 'LIVE_MT5'
                ? data.broker || data.provider || 'Authenticated MT5 Broker'
                : data.provider || (normalizedProv === 'INDEPENDENT_REFERENCE' ? 'Independent Reference Proxy' : 'Verified Independent Feed');
              const feedItem = {
                candles: data.candles,
                bundle: data.timeframes,
                provenance: normalizedProv,
                provider: provName
              };
              multiAssetCandleCacheRef.current[sym] = feedItem;
              if (!isCancelled) {
                setMultiAssetCandles((prev) => ({
                  ...prev,
                  [sym]: feedItem
                }));
              }
            }
          }
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    };

    const initialTimer = setTimeout(() => {
      syncRollingBatch();
    }, 1500);

    const rollingInterval = setInterval(() => {
      syncRollingBatch();
    }, 12000);

    return () => {
      isCancelled = true;
      clearTimeout(initialTimer);
      clearInterval(rollingInterval);
    };
  }, []);

  // Poll live market endpoint and MT5 bridge telemetry with anti-flap hysteresis and race condition guard
  const refreshData = useCallback(async () => {
    fetchCandles(activeSymbolRef.current, activeTimeframeRef.current);

    const gen = ++refreshGenRef.current;
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;

    try {
      // 1. Fetch reference market prices independently
      let refUpdated: Record<string, LiveMarketAsset> | null = null;
      let refOk = false;
      try {
        refUpdated = await fetchLiveMarketPrices();
        refOk = true;
      } catch (refErr) {
        console.warn('[ActiveAssetContext] Reference market feed error:', refErr);
        refOk = false;
      }

      // Base working assets: prioritize freshly fetched reference assets, fallback to current memory state
      const workingAssets: Record<string, LiveMarketAsset> = refUpdated
        ? { ...refUpdated }
        : { ...allAssetsRef.current };

      // 2. Query MT5 bridge telemetry independently
      let mt5Data: any = null;
      let mt5Online = false;
      let resolvedBroker = brokerName;
      let quotesCount = 0;
      let rawHeartbeatAge: number | null = null;
      let explicitDisconnect = false;

      try {
        // Check local HTTP bridge / cloud telemetry
        const localRes = await fetch('/api/bridge/mt5?action=TELEMETRY', {
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (localRes.ok) {
          const lData = await localRes.json();
          if (lData && typeof lData === 'object') {
            mt5Data = lData;
            mt5Online = Boolean(lData.mt5Connected);
            resolvedBroker = lData.broker || lData.terminal?.brokerName || resolvedBroker;
            rawHeartbeatAge = typeof lData.heartbeatAgeMs === 'number' ? lData.heartbeatAgeMs : null;
            explicitDisconnect = Boolean(lData.terminal && (lData.terminal.connected === false || lData.terminal.terminalConnected === false));
          }
        }

        // Only fall back to remote relay if not served by cloud persistent telemetry transport
        const isCloudTransport = mt5Data?.transport === 'CLOUD_PERSISTENT_TELEMETRY';
        if (!mt5Online && !isCloudTransport) {
          try {
            const remoteRes = await fetch('/api/remote-mt5/telemetry', {
              headers: { 'Cache-Control': 'no-cache' }
            });
            if (remoteRes.ok) {
              const rData = await remoteRes.json();
              if (rData.connected && rData.success) {
                mt5Data = rData;
                mt5Online = true;
                resolvedBroker = rData.broker || rData.terminal?.brokerName || resolvedBroker;
                rawHeartbeatAge = typeof rData.heartbeatAgeMs === 'number' ? rData.heartbeatAgeMs : null;
                explicitDisconnect = Boolean(rData.terminalConnected === false);
              }
            }
          } catch {}
        }
      } catch (bridgeErr) {
        console.warn('[ActiveAssetContext] MT5 telemetry poll error:', bridgeErr);
      }

      // Evaluate connectivity with anti-flap hysteresis
      const connEval = evaluateConnectivityStatus({
        isAuthoritativeConnected: mt5Online,
        heartbeatAgeMs: rawHeartbeatAge,
        previousState: connectionStateRef.current,
        consecutiveFailures: consecutiveFailuresRef.current,
        timeSinceLastSuccessMs: Date.now() - lastSuccessTimeRef.current,
        explicitTerminalDisconnect: explicitDisconnect,
      });

      connectionStateRef.current = connEval.state;
      consecutiveFailuresRef.current = connEval.consecutiveFailures;
      if (connEval.state === 'ONLINE' || (connEval.state === 'DEGRADED' && !connEval.isInGracePeriod)) {
        lastSuccessTimeRef.current = Date.now();
      }

      // 3. Overlay authoritative MT5 quotes when connected with sticky hysteresis
      if (connEval.isMt5Connected) {
        const nowMs = Date.now();
        const quotes: Record<string, any> = mt5Data?.quotes || {};
        const isLocalMode = mt5Data?.storageMode === 'LOCAL' || mt5Data?.localDatabase === 'ONLINE';
        quotesCount = Object.keys(quotes).length;

        for (const [symKey, baseAsset] of Object.entries(workingAssets)) {
          const canonical = symKey.toUpperCase();
          const brokerSym = symbolDirectory.toBrokerSymbol(canonical) || canonical;
          let quote = quotes[canonical] || quotes[brokerSym] || quotes[`${canonical}m`] || quotes[symKey];

          // If fresh quote received in this poll, update sticky cache
          if (quote && typeof quote.bid === 'number' && typeof quote.ask === 'number' && quote.bid > 0 && quote.ask > 0) {
            lastBrokerQuotesRef.current[canonical] = { quote, timestamp: nowMs };
          } else if (lastBrokerQuotesRef.current[canonical] && (nowMs - lastBrokerQuotesRef.current[canonical].timestamp <= QUOTE_DISPLAY_STALE_THRESHOLD_MS)) {
            // Use sticky cached quote if current poll was transiently delayed or missing this symbol
            quote = lastBrokerQuotesRef.current[canonical].quote;
          }

          if (quote && typeof quote.bid === 'number' && typeof quote.ask === 'number' && quote.bid > 0 && quote.ask > 0) {
            const freshness = evaluateBrokerQuoteFreshness(quote, nowMs);

            if (freshness.ageMs <= QUOTE_DISPLAY_STALE_THRESHOLD_MS) {
              // Quote <= 30s (within display tolerance): Retain MT5 broker price authority
              const midPrice = Number(((quote.bid + quote.ask) / 2).toFixed(quote.digits || 2));

              // Evaluate verified D1 stats from cached multi-asset candles if available
              const cachedD1 =
                multiAssetCandleCacheRef.current[canonical]?.bundle?.['D1'] ||
                multiAssetCandleCacheRef.current[symKey]?.bundle?.['D1'];
              let verifiedHigh = 0;
              let verifiedLow = 0;
              let verifiedChange = baseAsset.change24h;

              if (cachedD1 && cachedD1.length > 0) {
                const evalDaily = evaluateCanonicalDailyStats({
                  symbol: canonical,
                  category: baseAsset.category,
                  isBrokerConnected: true,
                  brokerQuote: {
                    bid: quote.bid,
                    ask: quote.ask,
                    mid: midPrice,
                    spread: quote.spread,
                    digits: quote.digits,
                    ageMs: freshness.ageMs,
                    broker: resolvedBroker,
                    isDisplayLive: freshness.isDisplayLive,
                  },
                  d1Candles: cachedD1,
                  d1Provenance: 'LIVE_MT5',
                  d1Provider: resolvedBroker,
                  nowMs,
                });
                if (evalDaily.isVerified && evalDaily.high != null && evalDaily.low != null && evalDaily.changePct != null) {
                  verifiedHigh = evalDaily.high;
                  verifiedLow = evalDaily.low;
                  verifiedChange = Number(evalDaily.changePct.toFixed(2));
                }
              }

              const spec = mt5Data?.specsBySymbol?.[canonical] || mt5Data?.specsBySymbol?.[symKey];
              const session = mt5Data?.sessions?.[canonical] || mt5Data?.sessions?.[symKey];
              const tradeMode = spec?.tradeMode || session?.tradeMode;
              const isTradeDisabled = tradeMode === 'DISABLED' || tradeMode === 0 || session?.marketAvailable === false;
              const marketAvailable = session?.marketAvailable !== undefined ? session.marketAvailable : !isTradeDisabled;

              const quoteTimeMs = typeof quote.timestamp === 'number' && quote.timestamp > 0
                ? (quote.timestamp < 1e11 ? quote.timestamp * 1000 : quote.timestamp)
                : (typeof (freshness as any)?.lastReceivedMs === 'number' ? (freshness as any).lastReceivedMs : nowMs);

              const timeContract = resolveCanonicalTimestampContract({
                quoteTimestamp: quoteTimeMs,
                lastUpdated: quote.freshness || freshness.statusLabel,
                nowMs,
                maxFreshAgeMs: 30_000,
                isBrokerFeed: true,
              });

              workingAssets[symKey] = {
                ...baseAsset,
                price: midPrice,
                bid: quote.bid,
                ask: quote.ask,
                spread: Number(quote.spread || (quote.ask - quote.bid)),
                high24h: verifiedHigh,
                low24h: verifiedLow,
                change24h: verifiedHigh > 0 ? verifiedChange : baseAsset.change24h,
                source: isLocalMode ? 'MT5 Broker (Local SQLite)' : 'MT5 Broker',
                provider: resolvedBroker,
                feedStatus: (quote.freshness === 'FRESH' || freshness.isDisplayLive) ? 'LIVE' : (quote.freshness === 'STALE' ? 'STALE' : 'FALLBACK'),
                referencePrice: baseAsset.referencePrice || baseAsset.price,
                referenceProvider: baseAsset.provider || 'TradingView Spot',
                lastUpdated: quote.freshness || freshness.statusLabel,
                quoteTimestampMs: timeContract.quoteTimestampMs,
                lastReceivedAtMs: timeContract.lastReceivedAtMs,
                lastValidatedAtMs: timeContract.lastValidatedAtMs,
                dataAgeMs: timeContract.dataAgeMs,
                dataFreshness: timeContract.dataFreshness,
                dataAvailability: timeContract.dataAvailability,
                tradeMode,
                isTradeDisabled,
                marketAvailable,
              };
            } else {
              // Quote > 30s: Exceeded display tolerance
              const staleTimeContract = resolveCanonicalTimestampContract({
                quoteTimestamp: typeof quote.timestamp === 'number' ? quote.timestamp : (nowMs - (freshness.ageMs || 45_000)),
                lastUpdated: freshness.statusLabel,
                nowMs,
                maxFreshAgeMs: 30_000,
                isBrokerFeed: true,
              });

              if (isLocalMode) {
                workingAssets[symKey] = {
                  ...baseAsset,
                  feedStatus: 'DATA LIMITED',
                  source: 'MT5 Broker (Local SQLite)',
                  provider: resolvedBroker,
                  lastUpdated: `Stale (${freshness.statusLabel})`,
                  quoteTimestampMs: staleTimeContract.quoteTimestampMs,
                  dataAgeMs: staleTimeContract.dataAgeMs,
                  dataFreshness: staleTimeContract.dataFreshness,
                  dataAvailability: 'AVAILABLE',
                };
              } else {
                workingAssets[symKey] = {
                  ...baseAsset,
                  feedStatus: 'FALLBACK',
                  lastUpdated: `Ref Fallback (${freshness.statusLabel})`,
                  quoteTimestampMs: staleTimeContract.quoteTimestampMs,
                  dataAgeMs: staleTimeContract.dataAgeMs,
                  dataFreshness: staleTimeContract.dataFreshness,
                  dataAvailability: 'PARTIAL',
                };
              }
            }
          } else if (isLocalMode) {
            // Missing/unsupported broker asset in local mode (e.g. GER40) -> strictly UNAVAILABLE, zero public fallback
            workingAssets[symKey] = {
              ...baseAsset,
              price: 0,
              bid: 0,
              ask: 0,
              spread: 0,
              source: 'MT5 Broker (Local SQLite)',
              provider: 'UNAVAILABLE',
              feedStatus: 'OFFLINE',
              classification: 'UNAVAILABLE',
              lastUpdated: 'UNAVAILABLE'
            };
          }
        }
      }

      // Check race condition guard: discard if newer poll arrived
      if (gen !== refreshGenRef.current) return;

      allAssetsRef.current = workingAssets;
      setAllAssets(workingAssets);
      setConnectionStatus(connEval.state);
      setIsMt5Connected(connEval.isMt5Connected);
      setIsReferenceLive(refOk);
      setHeartbeatAgeMs(rawHeartbeatAge);
      setBrokerName(resolvedBroker);
      setQuotesAvailable(quotesCount);
      setIsLive(connEval.isMt5Connected || refOk);
      setLastUpdated(new Date().toLocaleTimeString());
    } finally {
      isRefreshingRef.current = false;
    }
  }, [fetchCandles, brokerName]);

  useEffect(() => {
    refreshData();
    const timer = setInterval(refreshData, 5000);
    return () => clearInterval(timer);
  }, [refreshData]);

  // Candle polling & timeframe/symbol sync
  useEffect(() => {
    fetchCandles(activeSymbol, timeframe);
    const candleTimer = setInterval(() => {
      fetchCandles(activeSymbol, timeframe);
    }, 10000);
    return () => {
      clearInterval(candleTimer);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [activeSymbol, timeframe, fetchCandles]);

  // Intelligence feeds polling (News, Macro, Calendar, Geopolitical, Sentiment)
  useEffect(() => {
    let isMounted = true;
    const fetchFeeds = async () => {
      try {
        const res = await fetch('/api/intelligence/feeds');
        if (res.ok) {
          const json = await res.json();
          if (json.success && isMounted) {
            setLiveFeeds(json);
          }
        }
      } catch (err) {
        // Silently retain current feeds on network hiccups
      }
    };

    fetchFeeds();
    const feedTimer = setInterval(fetchFeeds, 20000);
    return () => {
      isMounted = false;
      clearInterval(feedTimer);
    };
  }, []);

  // Continuously scan global opportunities across all assets in background with full multi-asset candles
  useEffect(() => {
    try {
      const activeCandlesPayload = isCandleMatch && candles && candles.length >= 10
        ? { symbol: activeSymbol, candles, bundle: candleBundle, provenance: candleProvenance, provider: candleProvider }
        : undefined;
      const radar = generateGlobalRadarIntelligence(
        allAssets,
        timeframe,
        activeCandlesPayload,
        multiAssetCandleCacheRef.current
      );
      if (radar.rankedOpportunities && radar.rankedOpportunities.length > 0) {
        evaluateRadarTransitions(radar.rankedOpportunities);
      }
    } catch (e) {
      console.warn('Background opportunity radar evaluation error:', e);
    }
  }, [allAssets, timeframe, activeSymbol, isCandleMatch, candles, candleBundle, candleProvenance, candleProvider]);

  // Active Asset resolved object
  const activeAsset = useMemo(() => {
    return allAssets[activeSymbol] || INITIAL_LIVE_ASSETS[activeSymbol] || {
      symbol: activeSymbol,
      name: `${activeSymbol} (Live Broker)`,
      price: 1.0,
      bid: 0.999,
      ask: 1.001,
      spread: 0.0002,
      change24h: 0.0,
      high24h: 1.05,
      low24h: 0.95,
      volume: '$1.2B',
      sparkline: '0,10 100,10',
      source: 'Broker Tick',
      lastUpdated: 'Live',
      category: 'FOREX'
    };
  }, [allAssets, activeSymbol]);

  // Full dynamic multi-agent intelligence recomputed for active symbol & timeframe with verified candles and hydrated feeds.
  // Never pass candle data unless candlePayload strictly matches activeSymbol and timeframe.
  const assetProfile = useMemo(() => {
    const verifiedCandles = isCandleMatch ? (candleBundle || candles) : undefined;
    const verifiedProv = isCandleMatch ? candleProvenance : undefined;
    const verifiedProvName = isCandleMatch ? candleProvider : undefined;

    return generateAssetIntelligence(
      activeSymbol,
      activeAsset,
      timeframe,
      verifiedCandles,
      verifiedProv,
      verifiedProvName,
      undefined,
      liveFeeds
    );
  }, [activeSymbol, activeAsset, timeframe, isCandleMatch, candleBundle, candles, candleProvenance, candleProvider, liveFeeds]);

  const setActiveSymbol = useCallback((sym: string) => {
    const canonical = getMarketDefinition(sym);
    const resolved = canonical ? canonical.symbol : sym.toUpperCase();
    activeSymbolRef.current = resolved;
    setActiveSymbolState(resolved);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('fef_active_symbol', resolved);
      } catch {}
    }
  }, []);

  const setTimeframe = useCallback((tf: string) => {
    activeTimeframeRef.current = tf;
    setTimeframeState(tf);
  }, []);

  const value = useMemo(
    () => ({
      activeSymbol,
      setActiveSymbol,
      activeAsset,
      allAssets,
      timeframe,
      setTimeframe,
      categoryFilter,
      setCategoryFilter,
      assetProfile,
      lastUpdated,
      isLive,
      refreshData,
      candles,
      candleBundle,
      candleState,
      candleCount,
      candleProvenance,
      candleProvider,
      liveFeeds,
      multiAssetCandles,
      connectionStatus,
      isMt5Connected,
      isReferenceLive,
      heartbeatAgeMs,
      brokerName,
      quotesAvailable,
    }),
    [
      activeSymbol,
      setActiveSymbol,
      activeAsset,
      allAssets,
      timeframe,
      setTimeframe,
      categoryFilter,
      setCategoryFilter,
      assetProfile,
      lastUpdated,
      isLive,
      refreshData,
      candles,
      candleBundle,
      candleState,
      candleCount,
      candleProvenance,
      candleProvider,
      liveFeeds,
      multiAssetCandles,
      connectionStatus,
      isMt5Connected,
      isReferenceLive,
      heartbeatAgeMs,
      brokerName,
      quotesAvailable,
    ]
  );

  return <ActiveAssetContext.Provider value={value}>{children}</ActiveAssetContext.Provider>;
};

export function useActiveAsset(): ActiveAssetContextType {
  const ctx = useContext(ActiveAssetContext);
  if (!ctx) {
    throw new Error('useActiveAsset must be used within an ActiveAssetProvider');
  }
  return ctx;
}
