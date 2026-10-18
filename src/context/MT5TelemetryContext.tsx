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
import {
  ConnectivityState,
  evaluateConnectivityStatus
} from '@/lib/bridge/connectivity-policy';

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

  // Anti-flap tracking refs and generation guard
  const consecutiveFailuresRef = useRef<number>(0);
  const lastSuccessTimeRef = useRef<number>(Date.now());
  const connectionStateRef = useRef<ConnectivityState>('OFFLINE');
  const telemetryGenRef = useRef<number>(0);

  // Single-flight fetch to retrieve complete status & telemetry with anti-flap hysteresis
  const refreshTelemetry = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    const currentGen = ++telemetryGenRef.current;

    try {
      let data: any = null;
      let localOnline = false;
      let mt5Online = false;
      let isRemote = false;

      // 1. Try local bridge / cloud ingress endpoint first
      try {
        const res = await fetch('/api/bridge/mt5?action=TELEMETRY', {
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (res.ok) {
          const localData = await res.json();
          if (localData && typeof localData === 'object') {
            data = localData;
            localOnline = localData.localBridge === 'ONLINE' || localData.success === true;
            mt5Online = Boolean(localData.mt5Connected);
            isRemote = false;
          }
        }
      } catch {}

      // 2. Only fall back to remote relay if local/cloud bridge was not configured or completely failed
      // and not already served by cloud persistent telemetry transport
      const isCloudTransport = data?.transport === 'CLOUD_PERSISTENT_TELEMETRY';
      if (!mt5Online && !isCloudTransport) {
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

      if (data) {
        localOnline = isRemote ? false : (data.localBridge === 'ONLINE' || data.success === true);
        mt5Online = isRemote ? Boolean(data.connected) : Boolean(data.mt5Connected);
      }

      // Check if bridge explicitly reported terminal disconnect
      const explicitDisconnect = Boolean(
        data && (
          (data.terminal && (data.terminal.connected === false || data.terminal.terminalConnected === false)) ||
          data.terminalConnected === false
        )
      );

      // Evaluate connectivity through deterministic anti-flap hysteresis policy
      const rawHeartbeatAge = data && typeof data.heartbeatAgeMs === 'number' ? data.heartbeatAgeMs : null;
      const connEval = evaluateConnectivityStatus({
        isAuthoritativeConnected: Boolean(data && mt5Online),
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

      // Drop stale out-of-order response
      if (currentGen !== telemetryGenRef.current) return;

      if (!data || (!localOnline && !mt5Online)) {
        if (connEval.isInGracePeriod && connEval.isMt5Connected) {
          // Grace period: keep previous telemetry alive, preserve mt5Connected: true, mark DEGRADED
          setTelemetry(prev => ({
            ...prev,
            connectionStatus: 'DEGRADED',
            statusLabel: connEval.statusLabel,
            isInGracePeriod: true,
            mt5Connected: true,
            localBridgeOnline: true,
            state: prev.operatingMode === 'READ_ONLY' || prev.readOnlyLockActive ? 'CONNECTED_READ_ONLY' : 'CONNECTED_DEMO_EXECUTION',
            lastSyncTimestamp: Date.now()
          }));
        } else {
          setTelemetry(prev => ({
            ...prev,
            localBridgeOnline: false,
            mt5Connected: false,
            connectionStatus: 'OFFLINE',
            statusLabel: connEval.statusLabel,
            isInGracePeriod: false,
            state: 'MT5_OFFLINE',
            operatingMode: 'READ_ONLY',
            readOnlyLockActive: true,
            lastSyncTimestamp: Date.now()
          }));
        }
        return;
      }

      // Hydrate symbolDirectory if symbols present
      if (Array.isArray(data.symbols) && data.symbols.length > 0) {
        symbolDirectory.discoverFromBrokerSymbols(data.symbols);
      }

      // Format quotes map
      const allQuotes: Record<string, any> = data.allQuotes || data.quotes || {};

      // Execution policy: Real accounts strictly HARD LOCKED to READ_ONLY.
      // Demo accounts with V2 reflect DEMO_EXECUTION accurately.
      const isRealAccount = data.account?.tradeMode === 'REAL' || data.accountMode === 'REAL' || (data.terminal && data.terminal.operatingMode === 'REAL');
      const opMode: 'READ_ONLY' | 'DEMO_EXECUTION' = isRealAccount ? 'READ_ONLY' : (data.operatingMode || 'DEMO_EXECUTION');
      const isReadOnly = isRealAccount || opMode === 'READ_ONLY';

      // Transform authentic account only when provided by upstream telemetry
      const rawAccount = data.account || (data.maskedAccount || data.balance != null || data.equity != null || data.tradeMode != null ? {
        maskedLogin: data.maskedAccount || data.accountMasked,
        broker: data.broker,
        server: data.server,
        balance: data.balance,
        equity: data.equity,
        margin: data.margin,
        freeMargin: data.freeMargin,
        leverage: data.leverage,
        currency: data.currency,
        tradeMode: data.tradeMode,
        tradeAllowed: data.tradeAllowed
      } : null);
      const accountContext = deriveAccountRiskContext(rawAccount, data.positions || data.allPositions, opMode);

      // Terminal status: preserve authentic terminal telemetry if provided, otherwise null
      const terminalStatus = data.terminal ? {
        terminalConnected: Boolean(data.terminal.connected ?? data.terminal.terminalConnected ?? mt5Online),
        brokerConnected: Boolean(data.terminal.brokerConnected ?? data.terminal.connected ?? mt5Online),
        brokerName: data.terminal.brokerName || data.broker || '',
        brokerServer: data.terminal.brokerServer || data.server || '',
        terminalBuild: Number(data.terminal.terminalBuild || 0),
        tradeAllowed: Boolean(data.terminal.tradeAllowed),
        tradeExpert: Boolean(data.terminal.tradeExpert),
        pingToBrokerMs: typeof data.terminal.pingToBrokerMs === 'number'
          ? data.terminal.pingToBrokerMs
          : (typeof data.terminal.ping === 'number' ? data.terminal.ping : 0),
        bridgeVersion: data.terminal.bridgeVersion || '',
        operatingMode: opMode,
        lastHeartbeat: data.terminal.lastHeartbeat || data.lastHeartbeat || ''
      } : null;

      const effectiveMt5Connected = connEval.isMt5Connected;
      const connectionState = connEval.state === 'DEGRADED'
        ? 'CONNECTED_DEGRADED'
        : isRealAccount
        ? 'CONNECTED_READ_ONLY'
        : (data.state || (effectiveMt5Connected ? 'CONNECTED_DEMO_EXECUTION' : localOnline ? 'MT5_OFFLINE' : 'BRIDGE_OFFLINE'));

      const transportLabel = isRemote
        ? (data.transport || 'SECURE_RELAY (WSS)')
        : (data.transport || 'HTTP / WEBREQUEST');

      setTelemetry(prev => {
        const allPositions = Array.isArray(data.allPositions) ? data.allPositions : (Array.isArray(data.positions) ? data.positions : (prev.allPositions || []));
        const allPendingOrders = Array.isArray(data.allPendingOrders) ? data.allPendingOrders : (Array.isArray(data.orders) ? data.orders : (prev.allPendingOrders || []));

        return {
          localBridgeOnline: localOnline,
          mt5Connected: effectiveMt5Connected,
          isRemote,
          state: connectionState,
          connectionStatus: connEval.state,
          statusLabel: connEval.statusLabel,
          isInGracePeriod: connEval.isInGracePeriod,
          transport: transportLabel,
          heartbeatAgeMs: data.heartbeatAgeMs ?? null,
          lastHeartbeat: data.lastHeartbeat ?? null,
          terminal: terminalStatus || (effectiveMt5Connected ? prev.terminal : null),
          account: accountContext || (effectiveMt5Connected ? prev.account : null),
          allPositions,
          allPendingOrders,
          allQuotes,
          operatingMode: opMode,
          readOnlyLockActive: isReadOnly,
          lastSyncTimestamp: Date.now()
        };
      });
    } catch {
      const connEval = evaluateConnectivityStatus({
        isAuthoritativeConnected: false,
        heartbeatAgeMs: null,
        previousState: connectionStateRef.current,
        consecutiveFailures: consecutiveFailuresRef.current,
        timeSinceLastSuccessMs: Date.now() - lastSuccessTimeRef.current,
      });

      connectionStateRef.current = connEval.state;
      consecutiveFailuresRef.current = connEval.consecutiveFailures;

      if (currentGen !== telemetryGenRef.current) return;

      if (connEval.isInGracePeriod && connEval.isMt5Connected) {
        setTelemetry(prev => ({
          ...prev,
          connectionStatus: 'DEGRADED',
          statusLabel: connEval.statusLabel,
          isInGracePeriod: true,
          mt5Connected: true,
          localBridgeOnline: true,
          state: prev.operatingMode === 'READ_ONLY' || prev.readOnlyLockActive ? 'CONNECTED_READ_ONLY' : 'CONNECTED_DEMO_EXECUTION',
          lastSyncTimestamp: Date.now()
        }));
      } else {
        setTelemetry((prev) => ({
          ...prev,
          localBridgeOnline: false,
          mt5Connected: false,
          isRemote: false,
          connectionStatus: 'OFFLINE',
          statusLabel: connEval.statusLabel,
          isInGracePeriod: false,
          state: 'BRIDGE_OFFLINE',
          lastSyncTimestamp: Date.now()
        }));
      }
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
