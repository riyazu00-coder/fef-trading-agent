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
    const { getLocalMarketDataProvider } = await import('@/lib/providers/local-market-data-provider');
    const localProvider = getLocalMarketDataProvider();
    const health = await localProvider.getHealth();

    if (health && health.localDatabase === 'ONLINE') {
      const localQuotes = await localProvider.getLatestQuotes();
      const localQuoteKeys = Object.keys(localQuotes || {});
      const hasLocalQuotes = localQuoteKeys.length > 0;

      const mergedQuotes: Record<string, any> = {
        ...(baseStatus?.quotes || {}),
      };

      if (hasLocalQuotes) {
        for (const [sym, q] of Object.entries(localQuotes)) {
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

      const isMt5Conn = baseStatus?.mt5Connected ?? health.brokerConnected;

      const enriched = {
        success: true,
        ...(baseStatus || {}),
        localDatabase: 'ONLINE',
        storageMode: 'LOCAL',
        cloudSync: 'DISABLED',
        mt5Connected: isMt5Conn,
        brokerConnected: health.brokerConnected,
        quotesAvailable: hasLocalQuotes ? localQuoteKeys.length : (baseStatus?.quotesAvailable || 0),
        quotes: mergedQuotes,
        allQuotes: mergedQuotes,
        symbols: hasLocalQuotes ? localQuoteKeys : (baseStatus?.symbols || []),
        execution: 'READ_ONLY',
        operatingMode: 'READ_ONLY',
        feedStatus: health.feedStatus,
        broker: health.broker || baseStatus?.broker || baseStatus?.terminal?.broker,
        server: health.server || baseStatus?.server || baseStatus?.terminal?.server,
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
