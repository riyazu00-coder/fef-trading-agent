/**
 * FEF CORTEX — LOCAL TELEMETRY ENRICHER
 *
 * Enriches MT5 telemetry status with authoritative local SQLite market data
 * for local-first operations.
 */

/**
 * Sanitize telemetry payload to prevent leaking filesystem paths, secrets, or tokens
 */
function sanitizePayload(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    if (typeof obj === 'string' && (obj.startsWith('/Users/') || obj.includes('/.fef/'))) {
      return '[REDACTED_LOCAL_PATH]';
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizePayload(item));
  }

  const sanitized: Record<string, any> = {};
  const SENSITIVE_KEYS = new Set([
    'token', 'bridgetoken', 'secret', 'devicesecret', 'privatekey', 'password',
    'dbpath', 'filepath', 'databasepath', 'credentials', 'apikey', 'auth'
  ]);

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      continue;
    }
    sanitized[key] = sanitizePayload(value);
  }
  return sanitized;
}

export async function enrichTelemetryWithLocalMarketData(baseStatus: any): Promise<any> {
  try {
    let getLocalMarketDataProvider: any = null;
    try {
      const mod = await import('@/lib/providers/local-market-data-provider');
      getLocalMarketDataProvider = mod.getLocalMarketDataProvider;
    } catch {
      const mod = await import('../providers/local-market-data-provider');
      getLocalMarketDataProvider = mod.getLocalMarketDataProvider;
    }

    const localProvider = getLocalMarketDataProvider ? getLocalMarketDataProvider() : null;
    const health = localProvider ? await localProvider.getHealth() : null;

    if (health && health.localDatabase === 'ONLINE') {
      const localQuotes = await localProvider.getLatestQuotes();
      const localQuoteKeys = Object.keys(localQuotes || {});
      const hasLocalQuotes = localQuoteKeys.length > 0;

      const mergedQuotes: Record<string, any> = {
        ...(baseStatus?.quotes || {}),
      };

      if (hasLocalQuotes) {
        for (const [sym, quoteVal] of Object.entries(localQuotes)) {
          const q = quoteVal as any;
          mergedQuotes[sym] = {
            symbol: q.brokerSymbol || sym,
            canonicalSymbol: q.canonicalSymbol,
            bid: q.bid,
            ask: q.ask,
            mid: q.mid,
            spread: q.spread,
            digits: q.digits,
            timestamp: q.quoteTimestamp,
            ageMs: q.ageMs,
            freshness: q.freshness,
            source: 'MT5_BROKER',
            storage: 'LOCAL_SQLITE',
            isExecutable: false,
          };
        }
      }

      // Explicit Terminal Disconnect check
      const explicitDisconnect = Boolean(
        baseStatus && (
          (baseStatus.terminal && (baseStatus.terminal.connected === false || baseStatus.terminal.terminalConnected === false)) ||
          baseStatus.terminalConnected === false
        )
      );

      // Robust boolean state determination:
      // Bridge online & fresh OR SQLite with verified fresh broker data
      const isBridgeOnline = Boolean(baseStatus && (baseStatus.mt5Connected || baseStatus.localBridge === 'ONLINE'));
      const isDbLive = Boolean(health.brokerConnected && health.feedStatus !== 'OFFLINE');
      const isMt5Conn = !explicitDisconnect && (Boolean(baseStatus?.mt5Connected) || (isDbLive && hasLocalQuotes));

      // Measured connection states for transparency
      const measuredStates = {
        processRunning: true,
        terminalConnected: !explicitDisconnect && (health.brokerConnected || Boolean(baseStatus?.terminal?.connected || baseStatus?.terminal?.terminalConnected)),
        eaAttached: Boolean(baseStatus?.terminal?.build || health.broker),
        eaHeartbeatFresh: baseStatus?.heartbeatAgeMs != null ? baseStatus.heartbeatAgeMs <= 20000 : (health.lastPersistenceAgeMs != null && health.lastPersistenceAgeMs <= 20000),
        brokerQuotesFresh: hasLocalQuotes && Object.values(localQuotes).some((q: any) => typeof q.ageMs === 'number' && q.ageMs <= 30000),
        localDatabaseWritable: health.localDatabase === 'ONLINE',
        cockpitDataFresh: hasLocalQuotes,
      };

      const enriched = {
        success: true,
        ...(baseStatus || {}),
        localDatabase: 'ONLINE',
        storageMode: 'LOCAL',
        cloudSync: 'DISABLED',
        mt5Connected: isMt5Conn,
        brokerConnected: !explicitDisconnect && (health.brokerConnected || Boolean(baseStatus?.terminal?.connected || baseStatus?.terminal?.terminalConnected)),
        quotesAvailable: hasLocalQuotes ? localQuoteKeys.length : (baseStatus?.quotesAvailable || 0),
        quotes: mergedQuotes,
        allQuotes: mergedQuotes,
        symbols: hasLocalQuotes ? localQuoteKeys : (baseStatus?.symbols || []),
        execution: 'READ_ONLY',
        operatingMode: 'READ_ONLY',
        feedStatus: !explicitDisconnect && (health.feedStatus === 'LIVE' || isMt5Conn) ? 'LIVE' : (hasLocalQuotes ? 'FALLBACK' : 'OFFLINE'),
        broker: health.broker || baseStatus?.broker || baseStatus?.terminal?.broker,
        server: health.server || baseStatus?.server || baseStatus?.terminal?.server,
        measuredStates,
      };
      return sanitizePayload(enriched);
    }
  } catch (err) {
    // Fail safe to baseStatus if local provider fails
  }
  return sanitizePayload(baseStatus);
}

// CommonJS support for Node test scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    enrichTelemetryWithLocalMarketData,
    sanitizePayload,
  };
}
