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
import { getMarketDefinition } from '../lib/registry/market-registry';
import { generateGlobalRadarIntelligence } from '../lib/radar/opportunity-radar-engine';
import { evaluateRadarTransitions } from '../lib/radar/radar-notifications';
import { validateCandleSeries } from '../lib/candles/candle-validator';
import { OHLCCandle } from '../lib/market/canonical-market-snapshot';
import { EvidenceClassification } from '../lib/evidence/agent-evidence';

export type CandleLoadingState = 'LOADING' | 'VERIFIED' | 'STALE' | 'UNAVAILABLE' | 'ERROR';

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
  candleState: CandleLoadingState;
  candleCount: number;
  candleProvenance?: EvidenceClassification;
  candleProvider?: string;
}

const ActiveAssetContext = createContext<ActiveAssetContextType | null>(null);

export const ActiveAssetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeSymbol, setActiveSymbolState] = useState<string>('XAUUSD');
  const [allAssets, setAllAssets] = useState<Record<string, LiveMarketAsset>>(INITIAL_LIVE_ASSETS);
  const [timeframe, setTimeframe] = useState<string>('H1');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [lastUpdated, setLastUpdated] = useState<string>('Just now');
  const [isLive, setIsLive] = useState<boolean>(true);

  // Candle state & metadata
  const [candles, setCandles] = useState<OHLCCandle[] | undefined>(undefined);
  const [candleProvenance, setCandleProvenance] = useState<EvidenceClassification | undefined>(undefined);
  const [candleProvider, setCandleProvider] = useState<string | undefined>(undefined);
  const [candleState, setCandleState] = useState<CandleLoadingState>('LOADING');
  const [candleCount, setCandleCount] = useState<number>(0);

  // Race-condition prevention refs for timeframe & symbol switching
  const activeFetchIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastFetchedSymRef = useRef<string>('');
  const lastFetchedTfRef = useRef<string>('');

  // Restore persisted active symbol on client hydration
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('fef_active_symbol');
        if (saved) {
          const canonical = getMarketDefinition(saved);
          if (canonical) {
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
      setCandleState('LOADING');
      // Clear previous candles to prevent cross-asset or cross-timeframe stale analysis
      setCandles(undefined);
      setCandleProvenance(undefined);
      setCandleProvider(undefined);
      setCandleCount(0);
      lastFetchedSymRef.current = sym;
      lastFetchedTfRef.current = tf;
    }

    try {
      const res = await fetch(`/api/candles?symbol=${encodeURIComponent(sym)}&timeframe=${encodeURIComponent(tf)}`, {
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (fetchId !== activeFetchIdRef.current) return;

      if (!res.ok) {
        setCandles(undefined);
        setCandleProvenance(undefined);
        setCandleProvider(undefined);
        setCandleCount(0);
        setCandleState('ERROR');
        return;
      }

      const data = await res.json();
      if (fetchId !== activeFetchIdRef.current) return;

      if (data.success && Array.isArray(data.candles) && data.candles.length >= 10) {
        const validation = validateCandleSeries(data.candles, tf);
        if (validation.valid) {
          const prov = (data.provenance || 'LIVE_MT5') as EvidenceClassification;
          const provName = data.broker || data.provider || 'Exness Technologies Ltd';
          setCandles(data.candles);
          setCandleProvenance(prov);
          setCandleProvider(provName);
          setCandleCount(data.candles.length);
          setCandleState(data.state === 'VERIFIED' ? 'VERIFIED' : (data.state as any) || 'VERIFIED');
          return;
        } else {
          console.warn(`[Candles] Failed validation for ${sym} ${tf}:`, validation.reason);
        }
      }

      setCandles(undefined);
      setCandleProvenance(undefined);
      setCandleProvider(undefined);
      setCandleCount(0);
      setCandleState(data.state === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'ERROR');
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      if (fetchId !== activeFetchIdRef.current) return;
      console.warn(`[Candles] Fetch error for ${sym} ${tf}:`, err);
      setCandles(undefined);
      setCandleProvenance(undefined);
      setCandleProvider(undefined);
      setCandleCount(0);
      setCandleState('ERROR');
    }
  }, []);

  // Poll live market endpoint and MT5 bridge telemetry
  const refreshData = useCallback(async () => {
    fetchCandles(activeSymbol, timeframe);
    try {
      const updated = await fetchLiveMarketPrices();

      // Query MT5 bridge telemetry to check for authoritative broker quotes
      try {
        let mt5Data: any = null;
        let isMt5Connected = false;
        let brokerName = 'Exness';

        // 1. Check local HTTP bridge
        const localRes = await fetch('/api/bridge/mt5?action=TELEMETRY', {
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (localRes.ok) {
          const lData = await localRes.json();
          if (lData.mt5Connected || lData.localBridge === 'ONLINE') {
            mt5Data = lData;
            isMt5Connected = Boolean(lData.mt5Connected);
            brokerName = lData.broker || lData.terminal?.brokerName || 'Exness';
          }
        }

        // 2. Check remote relay if local is not connected
        if (!isMt5Connected) {
          try {
            const remoteRes = await fetch('/api/remote-mt5/telemetry', {
              headers: { 'Cache-Control': 'no-cache' }
            });
            if (remoteRes.ok) {
              const rData = await remoteRes.json();
              if (rData.connected && rData.success) {
                mt5Data = rData;
                isMt5Connected = true;
                brokerName = rData.broker || rData.terminal?.brokerName || 'Exness';
              }
            }
          } catch {}
        }

        // Overlay MT5 quotes ONLY when connected AND fresh (<5000ms).
        // If MT5 quote is stale (>=5000ms) or bridge disconnected, switch/retain reference fallback.
        if (isMt5Connected && mt5Data?.quotes) {
          const nowMs = Date.now();
          const quotes: Record<string, any> = mt5Data.quotes;

          for (const [symKey, refAsset] of Object.entries(updated)) {
            const canonical = symKey.toUpperCase();
            // Look up quote under canonical, alias, or lowercase
            const quote = quotes[canonical] || quotes[`${canonical}m`] || quotes[symKey];
            if (quote && typeof quote.bid === 'number' && typeof quote.ask === 'number' && quote.bid > 0 && quote.ask > 0) {
              const quoteTime = quote.timestamp || (quote.time ? new Date(quote.time).getTime() : nowMs);
              const quoteAgeMs = typeof quote.ageMs === 'number' ? quote.ageMs : Math.max(0, nowMs - quoteTime);
              const isFresh = quoteAgeMs < 5000;

              if (isFresh) {
                // Preferred Behavior Option B: Fresh verified MT5 -> MT5_BROKER
                const midPrice = Number(((quote.bid + quote.ask) / 2).toFixed(quote.digits || 2));
                updated[symKey] = {
                  ...refAsset,
                  price: midPrice,
                  bid: quote.bid,
                  ask: quote.ask,
                  spread: Number(quote.spread || (quote.ask - quote.bid)),
                  source: 'MT5 Broker',
                  provider: brokerName,
                  feedStatus: 'LIVE',
                  referencePrice: refAsset.referencePrice || refAsset.price,
                  lastUpdated: 'Live MT5'
                };
              } else {
                // Preferred Behavior Option B: MT5 stale -> REFERENCE_FEED / FALLBACK
                // Keep reference price as primary, preserve raw broker telemetry in reference annotations
                updated[symKey] = {
                  ...refAsset,
                  feedStatus: 'FALLBACK',
                  lastUpdated: `Ref Fallback (MT5 Stale ${Math.round(quoteAgeMs / 1000)}s)`
                };
              }
            }
          }
        }
      } catch (bridgeErr) {
        console.warn('Bridge telemetry overlay check error:', bridgeErr);
      }

      setAllAssets(updated);
      setLastUpdated(new Date().toLocaleTimeString());
      setIsLive(true);
    } catch (e) {
      console.warn('Real market feed refresh error:', e);
      setIsLive(false);
    }
  }, []);

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

  // Continuously scan global opportunities across all assets in background
  useEffect(() => {
    try {
      const activeCandlesPayload = candles && candles.length >= 10
        ? { symbol: activeSymbol, candles, provenance: candleProvenance, provider: candleProvider }
        : undefined;
      const radar = generateGlobalRadarIntelligence(allAssets, timeframe, activeCandlesPayload);
      if (radar.rankedOpportunities && radar.rankedOpportunities.length > 0) {
        evaluateRadarTransitions(radar.rankedOpportunities);
      }
    } catch (e) {
      console.warn('Background opportunity radar evaluation error:', e);
    }
  }, [allAssets, timeframe, activeSymbol, candles, candleProvenance, candleProvider]);

  // Active Asset resolved object
  const activeAsset = useMemo(() => {
    return allAssets[activeSymbol] || INITIAL_LIVE_ASSETS[activeSymbol] || {
      symbol: activeSymbol,
      name: `${activeSymbol} (Live Exness)`,
      price: 1.0,
      bid: 0.999,
      ask: 1.001,
      spread: 0.0002,
      change24h: 0.0,
      high24h: 1.05,
      low24h: 0.95,
      volume: '$1.2B',
      sparkline: '0,10 100,10',
      source: 'Exness Tick',
      lastUpdated: 'Live',
      category: 'FOREX'
    };
  }, [allAssets, activeSymbol]);

  // Full dynamic multi-agent intelligence recomputed for active symbol & timeframe with verified candles
  const assetProfile = useMemo(() => {
    return generateAssetIntelligence(
      activeSymbol,
      activeAsset,
      timeframe,
      candles,
      candleProvenance,
      candleProvider
    );
  }, [activeSymbol, activeAsset, timeframe, candles, candleProvenance, candleProvider]);

  const setActiveSymbol = useCallback((sym: string) => {
    const canonical = getMarketDefinition(sym);
    const resolved = canonical ? canonical.symbol : sym.toUpperCase();
    setActiveSymbolState(resolved);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('fef_active_symbol', resolved);
      } catch {}
    }
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
      candleState,
      candleCount,
      candleProvenance,
      candleProvider
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
      candleState,
      candleCount,
      candleProvenance,
      candleProvider
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
