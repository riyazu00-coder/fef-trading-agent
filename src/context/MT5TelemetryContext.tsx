'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useActiveAsset } from './ActiveAssetContext';
import {
  MT5UnifiedTelemetry,
  MT5ActiveSymbolTelemetry,
  compareBrokerQuote,
  deriveAccountRiskContext,
  filterPositionsForSymbol,
  filterOrdersForSymbol
} from '@/lib/bridge/mt5-telemetry-state';
import { symbolDirectory } from '@/lib/bridge/symbol-mapper';

interface MT5TelemetryContextType {
  telemetry: MT5UnifiedTelemetry;
  activeTelemetry: MT5ActiveSymbolTelemetry | null;
  isMt5Connected: boolean;
  isLocalBridgeOnline: boolean;
  refreshTelemetry: () => Promise<void>;
  lastSyncTimestamp: number;
}

const INITIAL_TELEMETRY: MT5UnifiedTelemetry = {
  localBridgeOnline: false,
  mt5Connected: false,
  state: 'NOT_CONFIGURED',
  transport: 'HTTP / WEBREQUEST',
  heartbeatAgeMs: null,
  lastHeartbeat: null,
  terminal: null,
  account: null,
  allPositions: [],
  allPendingOrders: [],
  allQuotes: {},
  operatingMode: 'READ_ONLY',
  readOnlyLockActive: true,
  lastSyncTimestamp: 0
};

const MT5TelemetryContext = createContext<MT5TelemetryContextType | null>(null);

export const MT5TelemetryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activeSymbol, activeAsset } = useActiveAsset();
  const [telemetry, setTelemetry] = useState<MT5UnifiedTelemetry>(INITIAL_TELEMETRY);
  const isFetchingRef = useRef<boolean>(false);

  // Single-flight fetch to retrieve complete status & telemetry
  const refreshTelemetry = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      let data: any = null;
      let localOnline = false;
      let mt5Online = false;
      let isRemote = false;

      // 1. Try local bridge endpoint first
      try {
        const res = await fetch('/api/bridge/mt5?action=TELEMETRY', {
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (res.ok) {
          const localData = await res.json();
          if (localData.localBridge === 'ONLINE' || localData.mt5Connected) {
            data = localData;
            localOnline = localData.localBridge === 'ONLINE' || localData.success === true;
            mt5Online = Boolean(localData.mt5Connected);
            isRemote = false;
          }
        }
      } catch {}

      // 2. If local bridge is not connected / offline, fall back to remote relay telemetry
      if (!mt5Online) {
        try {
          const remoteRes = await fetch('/api/remote-mt5/telemetry', {
            headers: { 'Cache-Control': 'no-cache' }
          });
          if (remoteRes.ok) {
            const remoteData = await remoteRes.json();
            if (remoteData.connected && remoteData.success) {
              data = remoteData;
              localOnline = true;
              mt5Online = true;
              isRemote = true;
            }
          }
        } catch (e) {
          // Both offline
        }
      }

      if (!data) {
        setTelemetry(prev => ({
          ...prev,
          localBridgeOnline: false,
          mt5Connected: false,
          state: 'MT5_OFFLINE',
          operatingMode: 'UNIVERSAL_EXECUTION',
          readOnlyLockActive: false,
          lastSyncTimestamp: Date.now()
        }));
        return;
      }

      localOnline = isRemote ? false : (data.localBridge === 'ONLINE' || data.success === true);
      mt5Online = isRemote ? Boolean(data.connected) : Boolean(data.mt5Connected);

      if (!localOnline && !mt5Online) {
        setTelemetry(prev => ({
          ...prev,
          localBridgeOnline: false,
          mt5Connected: false,
          state: 'MT5_OFFLINE',
          operatingMode: 'UNIVERSAL_EXECUTION',
          readOnlyLockActive: false,
          lastSyncTimestamp: Date.now()
        }));
        return;
      }

      // Hydrate symbolDirectory if symbols present
      if (Array.isArray(data.symbols) && data.symbols.length > 0) {
        symbolDirectory.discoverFromBrokerSymbols(data.symbols);
      }

      // Format quotes map
      const allQuotes: Record<string, any> = data.quotes || {};

      const opMode: 'UNIVERSAL_EXECUTION' | 'READ_ONLY' = mt5Online ? 'UNIVERSAL_EXECUTION' : 'READ_ONLY';
      const isReadOnly = !mt5Online;

      // Transform raw account to account context with consistent authoritative operating mode
      const rawAccount = data.account || {
        account: data.maskedAccount || data.accountMasked || '00***00',
        broker: data.broker || 'MT5 Broker',
        server: data.server || 'MT5-Server',
        balance: data.balance || 10000,
        equity: data.equity || 10000,
        margin: data.margin || 0,
        freeMargin: data.freeMargin || 10000,
        leverage: data.leverage || 200,
        currency: data.currency || 'USD',
        tradeMode: data.tradeMode || 'DEMO',
        tradeAllowed: true,
      };
      const accountContext = deriveAccountRiskContext(rawAccount, data.positions, opMode);

      setTelemetry({
        localBridgeOnline: localOnline,
        mt5Connected: mt5Online,
        isRemote,
        state: data.state || (mt5Online ? 'CONNECTED_UNIVERSAL_EXECUTION' : localOnline ? 'MT5_OFFLINE' : 'BRIDGE_OFFLINE'),
        transport: isRemote ? 'SECURE_RELAY (WSS)' : (data.transport || 'HTTP / WEBREQUEST'),
        heartbeatAgeMs: data.heartbeatAgeMs ?? null,
        lastHeartbeat: data.lastHeartbeat ?? null,
        terminal: data.terminal || {
          connected: true,
          tradeAllowed: true,
          brokerName: data.broker || 'MT5 Broker',
          brokerServer: data.server || 'MT5-Server',
          ping: data.ping ?? 5,
        },
        account: accountContext,
        allPositions: Array.isArray(data.positions) ? data.positions : [],
        allPendingOrders: Array.isArray(data.orders) ? data.orders : [],
        allQuotes,
        operatingMode: opMode,
        readOnlyLockActive: isReadOnly,
        lastSyncTimestamp: Date.now()
      });
    } catch {
      setTelemetry((prev) => ({
        ...prev,
        localBridgeOnline: false,
        mt5Connected: false,
        isRemote: false,
        state: 'BRIDGE_OFFLINE',
        lastSyncTimestamp: Date.now()
      }));
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  // Poll every 3 seconds, and when tab regains focus
  useEffect(() => {
    refreshTelemetry();
    const interval = setInterval(refreshTelemetry, 3000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshTelemetry();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refreshTelemetry]);

  // Reactive derivation of activeSymbolTelemetry with ZERO gold residue
  const activeTelemetry = useMemo<MT5ActiveSymbolTelemetry | null>(() => {
    const canonical = activeSymbol.toUpperCase().trim();
    const brokerSym = symbolDirectory.toBrokerSymbol(canonical) || canonical;

    // Look up quote under canonical or broker symbol
    const quote = telemetry.allQuotes[canonical] || telemetry.allQuotes[brokerSym] || null;
    const spec = symbolDirectory.getSpec(canonical) || symbolDirectory.getSpec(brokerSym) || null;

    // Compare with public price
    const comparison = compareBrokerQuote(
      activeAsset.price,
      quote,
      spec?.pipSize || 0.1
    );

    // Filter positions and pending orders strictly for current activeSymbol
    const positions = filterPositionsForSymbol(telemetry.allPositions, canonical);
    const pendingOrders = filterOrdersForSymbol(telemetry.allPendingOrders, canonical);

    return {
      canonicalSymbol: canonical,
      brokerSymbol: brokerSym,
      quote,
      spec,
      session: null,
      comparison,
      positions,
      pendingOrders
    };
  }, [activeSymbol, activeAsset.price, telemetry.allQuotes, telemetry.allPositions, telemetry.allPendingOrders]);

  const value = useMemo(
    () => ({
      telemetry,
      activeTelemetry,
      isMt5Connected: telemetry.mt5Connected,
      isLocalBridgeOnline: telemetry.localBridgeOnline,
      refreshTelemetry,
      lastSyncTimestamp: telemetry.lastSyncTimestamp
    }),
    [telemetry, activeTelemetry, refreshTelemetry]
  );

  return <MT5TelemetryContext.Provider value={value}>{children}</MT5TelemetryContext.Provider>;
};

export function useMT5Telemetry(): MT5TelemetryContextType {
  const ctx = useContext(MT5TelemetryContext);
  if (!ctx) {
    throw new Error('useMT5Telemetry must be used within an MT5TelemetryProvider');
  }
  return ctx;
}
