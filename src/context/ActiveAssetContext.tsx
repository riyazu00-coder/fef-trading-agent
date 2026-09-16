'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
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
}

const ActiveAssetContext = createContext<ActiveAssetContextType | null>(null);

export const ActiveAssetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeSymbol, setActiveSymbolState] = useState<string>('XAUUSD');
  const [allAssets, setAllAssets] = useState<Record<string, LiveMarketAsset>>(INITIAL_LIVE_ASSETS);
  const [timeframe, setTimeframe] = useState<string>('H1');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [lastUpdated, setLastUpdated] = useState<string>('Just now');
  const [isLive, setIsLive] = useState<boolean>(true);

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

  // Poll live market endpoint and MT5 bridge telemetry
  const refreshData = useCallback(async () => {
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

  // Continuously scan global opportunities across all assets in background
  useEffect(() => {
    try {
      const radar = generateGlobalRadarIntelligence(allAssets, timeframe);
      if (radar.rankedOpportunities && radar.rankedOpportunities.length > 0) {
        evaluateRadarTransitions(radar.rankedOpportunities);
      }
    } catch (e) {
      console.warn('Background opportunity radar evaluation error:', e);
    }
  }, [allAssets, timeframe]);

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

  // Full dynamic multi-agent intelligence recomputed for active symbol & timeframe
  const assetProfile = useMemo(() => {
    return generateAssetIntelligence(activeSymbol, activeAsset, timeframe);
  }, [activeSymbol, activeAsset, timeframe]);

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
      refreshData
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
      refreshData
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
