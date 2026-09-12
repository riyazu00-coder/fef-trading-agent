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

  // Poll live market endpoint every 5 seconds
  const refreshData = useCallback(async () => {
    try {
      const updated = await fetchLiveMarketPrices();
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
