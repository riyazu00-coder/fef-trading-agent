#!/usr/bin/env node
/**
 * FEF TRADING SOLUTIONS — OUTBOUND LOCAL MT5 CONNECTOR AGENT
 *
 * Runs locally on the user's workstation alongside MetaTrader 5:
 * 1. Reads local verified MT5 telemetry from 127.0.0.1:5556.
 * 2. Authenticates locally using FEF_BRIDGE_TOKEN (Local Mac only, never sent to cloud).
 * 3. Builds bounded, read-only telemetry snapshots (Heartbeat, Account, Quotes, Candles).
 * 4. Signs each snapshot using HMAC-SHA256 with FEF_TELEMETRY_DEVICE_SECRET.
 * 5. Sends strictly outbound HTTPS POST to production /api/telemetry/ingress.
 * 6. PHYSICAL SAFETY: Contains ZERO trading or order execution capability.
 */

const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Load .env.local if present
const envLocalPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, 'utf8');
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  });
}

// Load device identity & secure token provisioning
const { resolveActiveBridgeToken } = require('./fef-device-identity');
const { LocalTelemetryRepository } = require('./fef-local-telemetry-repository');

// Storage mode: LOCAL (default), CLOUD, HYBRID
const TELEMETRY_STORAGE_MODE = (process.env.FEF_TELEMETRY_STORAGE_MODE || 'LOCAL').trim().toUpperCase();

// Initialize local repository for local-first persistence
let localRepo = null;
if (TELEMETRY_STORAGE_MODE === 'LOCAL' || TELEMETRY_STORAGE_MODE === 'HYBRID') {
  try {
    localRepo = new LocalTelemetryRepository();
  } catch (err) {
    console.error('[CONNECTOR] Failed to initialize LocalTelemetryRepository:', err.message);
  }
}

// 1. Local bridge configuration
const LOCAL_BRIDGE_URL = process.env.FEF_LOCAL_BRIDGE_URL || 'http://127.0.0.1:5556';
const tokenResolution = resolveActiveBridgeToken();
const LOCAL_BRIDGE_TOKEN = (tokenResolution.token || '').trim();

// 2. Cloud telemetry ingress configuration
const CLOUD_INGRESS_URL = (
  process.env.FEF_CLOUD_TELEMETRY_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://app.feftradingsolutions.com/api/telemetry/ingress'
).trim();

const DEVICE_ID = (process.env.FEF_TELEMETRY_DEVICE_ID || 'fef-mac-primary-01').trim();
const TELEMETRY_SECRET = (process.env.FEF_TELEMETRY_DEVICE_SECRET || '').trim();

const POLL_INTERVAL_MS = 2000;
let sequenceCounter = 0;
let pollTimer = null;
let candleTickCount = 0;
let initialCandlesSynced = false;
if (localRepo) {
  try {
    const metrics = localRepo.getCandleMetrics();
    if (metrics && metrics.count > 0) {
      initialCandlesSynced = true;
    }
  } catch {}
}

// Canonical assets supported by MT5 bridge
const CANONICAL_SYMBOLS = [
  'XAUUSD', 'XAGUSD',
  'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'GBPJPY', 'EURJPY', 'EURGBP',
  'US100', 'US30', 'US500', 'UK100', 'JP225',
  'USOIL', 'UKOIL', 'NATGAS',
  'BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'BNBUSD'
];

function getCanonicalUniverse() {
  return CANONICAL_SYMBOLS;
}

/**
 * Fetch status from local HTTP Bridge (:5556)
 */
function fetchLocalBridgeStatus() {
  return new Promise((resolve) => {
    const v1Url = new URL('/api/status', LOCAL_BRIDGE_URL);
    const req = http.request(
      v1Url,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${LOCAL_BRIDGE_TOKEN}`,
          'x-bridge-token': LOCAL_BRIDGE_TOKEN,
        },
        timeout: 2000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed && (parsed.success || parsed.localBridge)) {
              return resolve(parsed);
            }
            resolve(null);
          } catch {
            resolve(null);
          }
        });
      }
    );

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

/**
 * Fetch verified closed candles from local HTTP Bridge (:5556)
 */
function fetchLocalBridgeCandles(symbol, timeframe) {
  return new Promise((resolve) => {
    const url = new URL(
      `/api/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`,
      LOCAL_BRIDGE_URL
    );
    const req = http.request(
      url,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${LOCAL_BRIDGE_TOKEN}`,
          'x-bridge-token': LOCAL_BRIDGE_TOKEN,
        },
        timeout: 2500,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed && parsed.success && Array.isArray(parsed.candles)) {
              return resolve(parsed.candles);
            }
            resolve([]);
          } catch {
            resolve([]);
          }
        });
      }
    );

    req.on('error', () => resolve([]));
    req.on('timeout', () => {
      req.destroy();
      resolve([]);
    });
    req.end();
  });
}

/**
 * Sign and post telemetry payload outbound via HTTPS
 */
function postTelemetryOutbound(envelope) {
  return new Promise((resolve, reject) => {
    if (!TELEMETRY_SECRET) {
      return reject(new Error('LOCAL_TELEMETRY_SECRET_REQUIRED'));
    }

    const rawBody = JSON.stringify(envelope);
    const url = new URL(CLOUD_INGRESS_URL);
    const path = url.pathname;
    const timestamp = String(Date.now());
    const nonce = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');

    // Build canonical string: METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY_HASH
    const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
    const canonical = ['POST', path, timestamp, nonce, bodyHash].join('\n');
    const signature = crypto.createHmac('sha256', TELEMETRY_SECRET).update(canonical).digest('hex');

    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(rawBody, 'utf8'),
      'x-fef-device-id': DEVICE_ID,
      'x-fef-timestamp': timestamp,
      'x-fef-nonce': nonce,
      'x-fef-signature': signature,
      'x-fef-signature-version': 'v1',
    };

    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(
      url,
      {
        method: 'POST',
        headers,
        timeout: 4000,
      },
      (res) => {
        let respData = '';
        res.on('data', (c) => (respData += c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            if (envelope.type === 'HEARTBEAT' && envelope.sequence % 5 === 0) {
              console.log(`[CONNECTOR] Successfully pushed ${envelope.type} (seq ${envelope.sequence}) to cloud ingress: HTTP ${res.statusCode}`);
            }
            resolve({ success: true, statusCode: res.statusCode });
          } else {
            console.warn(`[CONNECTOR] Cloud ingress returned HTTP ${res.statusCode} on ${envelope.type}: ${respData.slice(0, 100)}`);
            resolve({ success: false, statusCode: res.statusCode, response: respData });
          }
        });
      }
    );

    req.on('error', (err) => resolve({ success: false, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Request timeout' });
    });

    req.write(rawBody);
    req.end();
  });
}

/**
 * Main polling iteration
 */
async function pollAndPushTelemetry() {
  const localStatus = await fetchLocalBridgeStatus();
  if (!localStatus) {
    console.log(`[CONNECTOR] Local bridge at ${LOCAL_BRIDGE_URL} is unreachable or offline`);
    if (localRepo) {
      try {
        localRepo.updateConnectorState(DEVICE_ID, 'DEGRADED', {
          lastError: 'LOCAL_BRIDGE_UNREACHABLE',
          storageMode: TELEMETRY_STORAGE_MODE,
          consecutiveErrors: 1,
        });
      } catch {}
    }
    return { success: false, error: 'LOCAL_BRIDGE_UNREACHABLE' };
  }

  const isConnected = Boolean(localStatus.mt5Connected);
  const nowIso = new Date().toISOString();

  // 1. Build HEARTBEAT payload
  const heartbeatPayload = {
    terminalBuild: localStatus.terminal?.build || 5000,
    broker: localStatus.terminal?.broker || 'UNKNOWN',
    server: localStatus.terminal?.server || 'UNKNOWN',
    magicNumber: localStatus.terminal?.magic || 8882026,
    heartbeatIntervalSec: 2,
    operatingMode: 'READ_ONLY',
    activeSymbolsCount: CANONICAL_SYMBOLS.length,
    quotesCount: Object.keys(localStatus.quotes || {}).length,
    terminalConnected: isConnected,
  };

  // 2. Build ACCOUNT_STATUS payload
  let accountPayload = null;
  if (localStatus.account) {
    const acc = localStatus.account;
    accountPayload = {
      maskedLogin: acc.maskedLogin || '00***00',
      broker: acc.broker || 'UNKNOWN',
      server: acc.server || 'UNKNOWN',
      currency: acc.currency || 'USD',
      tradeMode: acc.tradeMode || 'DEMO',
      leverage: acc.leverage || 100,
      balance: acc.balance || 0,
      equity: acc.equity || 0,
      margin: acc.margin || 0,
      freeMargin: acc.freeMargin || 0,
      marginLevel: acc.marginLevel || 0,
      operatingMode: 'READ_ONLY',
      tradeAllowed: false,
    };
  }

  // 3. Build QUOTE_SNAPSHOT payload
  const quotesList = [];
  if (localStatus.quotes && typeof localStatus.quotes === 'object') {
    for (const [sym, q] of Object.entries(localStatus.quotes)) {
      if (CANONICAL_SYMBOLS.includes(sym) && q && typeof q === 'object') {
        const bid = Number(q.bid);
        const ask = Number(q.ask);
        if (bid > 0 && ask >= bid) {
          quotesList.push({
            symbol: sym,
            bid,
            ask,
            spread: Number(q.spread) || Math.round((ask - bid) * 10000),
            timestamp: Number(q.quoteTimestamp) || Date.now(),
          });
        }
      }
    }
  }

  // 4. Timeframe-aware closed candle collection
  candleTickCount++;
  const primarySyncSymbols = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'US100', 'USOIL', 'BTCUSD'];
  const candleSnapshots = [];

  const shouldSyncFastTfs = candleTickCount === 1 || candleTickCount % 60 === 0 || (!initialCandlesSynced && candleTickCount % 5 === 0);
  const shouldSyncSlowTfs = candleTickCount === 1 || candleTickCount % 180 === 0 || (!initialCandlesSynced && candleTickCount % 5 === 0);

  // Fast timeframes (M15, M30) on start (tick 1) and every 60 ticks (~2 min)
  if (shouldSyncFastTfs) {
    for (const sym of primarySyncSymbols) {
      for (const tf of ['M15', 'M30']) {
        const rawBars = await fetchLocalBridgeCandles(sym, tf);
        if (rawBars && rawBars.length >= 15) {
          const validBars = rawBars
            .filter((b) => b && b.open > 0 && b.high >= b.low && b.close > 0)
            .slice(-50); // Bounded 50 closed bars
          if (validBars.length >= 15) {
            candleSnapshots.push({
              canonicalSymbol: sym,
              brokerSymbol: sym,
              timeframe: tf,
              candles: validBars,
              closed: true,
              provider: 'MT5_BROKER_BRIDGE',
            });
          }
        }
      }
    }
  }

  // Higher timeframes (H1, H4, D1) on start (tick 1) and every 180 ticks (~6 min)
  if (shouldSyncSlowTfs) {
    const rotatingBatchStart = ((candleTickCount / 180) * 4) % CANONICAL_SYMBOLS.length;
    const additionalSymbols = CANONICAL_SYMBOLS.slice(rotatingBatchStart, rotatingBatchStart + 4);
    const syncTargetSymbols = Array.from(new Set([...primarySyncSymbols, ...additionalSymbols]));

    for (const sym of syncTargetSymbols) {
      for (const tf of ['H1', 'H4', 'D1']) {
        const rawBars = await fetchLocalBridgeCandles(sym, tf);
        if (rawBars && rawBars.length >= 10) {
          const validBars = rawBars
            .filter((b) => b && b.open > 0 && b.high >= b.low && b.close > 0)
            .slice(-50);
          if (validBars.length >= 10) {
            candleSnapshots.push({
              canonicalSymbol: sym,
              brokerSymbol: sym,
              timeframe: tf,
              candles: validBars,
              closed: true,
              provider: 'MT5_BROKER_BRIDGE',
            });
          }
        }
      }
    }
  }

  if (candleSnapshots.length > 0) {
    initialCandlesSynced = true;
  }

  // 5. Atomic Local SQLite Persistence (Primary Storage Mode)
  if (TELEMETRY_STORAGE_MODE === 'LOCAL' || TELEMETRY_STORAGE_MODE === 'HYBRID') {
    if (!localRepo) {
      try {
        localRepo = new LocalTelemetryRepository();
      } catch (err) {
        console.error('[CONNECTOR] Failed to initialize LocalTelemetryRepository:', err.message);
      }
    }
    if (localRepo) {
      const cycleResult = localRepo.saveTelemetryCycle({
        deviceId: DEVICE_ID,
        capturedAt: nowIso,
        sequence: ++sequenceCounter,
        heartbeat: heartbeatPayload,
        account: isConnected ? accountPayload : null,
        quotes: quotesList,
        candleSnapshots,
        connectorState: {
          state: 'ONLINE',
          storageMode: TELEMETRY_STORAGE_MODE,
          lastBridgeHeartbeat: Date.now(),
          lastLocalPersist: Date.now(),
          lastError: null,
          consecutiveErrors: 0,
        },
      });

      if (cycleResult.success) {
        if (sequenceCounter % 5 === 0) {
          console.log(`[CONNECTOR] Persisted telemetry cycle (seq ${sequenceCounter}) to local SQLite [DB: ONLINE]`);
        }
      } else {
        console.error(`[CONNECTOR] Failed to persist to local SQLite: ${cycleResult.error}`);
        try {
          localRepo.updateConnectorState(DEVICE_ID, 'DEGRADED', {
            lastError: cycleResult.error,
            storageMode: TELEMETRY_STORAGE_MODE,
          });
        } catch {}
      }

      // Periodic candle pruning (once every hour or ~1800 cycles)
      if (candleTickCount % 1800 === 0) {
        try {
          localRepo.pruneCandles(CANONICAL_SYMBOLS, ['M15', 'M30', 'H1', 'H4', 'D1'], 500);
        } catch {}
      }
    }
  }

  // 6. Cloud Telemetry Push (Only if HYBRID or CLOUD mode)
  if (TELEMETRY_STORAGE_MODE === 'LOCAL') {
    // Zero outbound cloud requests, zero Upstash writes, completely decoupled
    return { success: true };
  }

  // Outbound HTTPS push to cloud ingress (CLOUD or HYBRID mode)
  const heartbeatEnvelope = {
    version: 1,
    deviceId: DEVICE_ID,
    type: 'HEARTBEAT',
    capturedAt: nowIso,
    sequence: ++sequenceCounter,
    payload: heartbeatPayload,
  };
  const hbRes = await postTelemetryOutbound(heartbeatEnvelope);
  if (!hbRes || !hbRes.success) {
    return hbRes || { success: false };
  }
  if (!isConnected) return { success: true };

  if (accountPayload) {
    const accountEnvelope = {
      version: 1,
      deviceId: DEVICE_ID,
      type: 'ACCOUNT_STATUS',
      capturedAt: nowIso,
      sequence: ++sequenceCounter,
      payload: accountPayload,
    };
    await postTelemetryOutbound(accountEnvelope);
  }

  if (quotesList.length > 0) {
    const quoteEnvelope = {
      version: 1,
      deviceId: DEVICE_ID,
      type: 'QUOTE_SNAPSHOT',
      capturedAt: nowIso,
      sequence: ++sequenceCounter,
      payload: { quotes: quotesList },
    };
    await postTelemetryOutbound(quoteEnvelope);
  }

  for (const cs of candleSnapshots) {
    const candleEnvelope = {
      version: 1,
      deviceId: DEVICE_ID,
      type: 'CANDLE_SNAPSHOT',
      capturedAt: new Date().toISOString(),
      sequence: ++sequenceCounter,
      payload: cs,
    };
    await postTelemetryOutbound(candleEnvelope);
  }

  return { success: true };
}

function start() {
  console.log('================================================================');
  console.log('FEF TRADING SOLUTIONS: LOCAL OUTBOUND MT5 TELEMETRY CONNECTOR');
  console.log('================================================================');
  console.log(`- Local MT5 Bridge:     ${LOCAL_BRIDGE_URL}`);
  console.log(`- Storage Mode:         ${TELEMETRY_STORAGE_MODE}`);
  if (TELEMETRY_STORAGE_MODE !== 'LOCAL') {
    console.log(`- Cloud Ingress Target: ${CLOUD_INGRESS_URL}`);
    console.log(
      `- Telemetry Secret:     ${TELEMETRY_SECRET ? 'CONFIGURED' : 'NOT_CONFIGURED (FAIL-CLOSED)'}`
    );
  } else {
    console.log(`- SQLite Database:      ${localRepo ? localRepo.dbPath : 'INITIALIZING'}`);
    console.log(`- Cloud Telemetry Sync: DISABLED (Zero external quota dependency)`);
  }
  console.log(`- Device ID:            ${DEVICE_ID}`);
  console.log('- Mode:                 READ-ONLY TELEMETRY (Zero Execution Transport)');
  console.log('================================================================\n');

  if (TELEMETRY_STORAGE_MODE !== 'LOCAL' && !TELEMETRY_SECRET) {
    console.error('❌ FATAL: FEF_TELEMETRY_DEVICE_SECRET is missing from local environment.');
    console.error('Please configure FEF_TELEMETRY_DEVICE_SECRET in .env.local to enable cloud telemetry push.');
    return;
  }

  let consecutiveErrors = 0;

  async function scheduleCycle() {
    let delay = POLL_INTERVAL_MS;
    try {
      const res = await pollAndPushTelemetry();
      if (res && res.success === false) {
        consecutiveErrors++;
        // Exponential backoff when cloud ingress returns 503 or 429: 5s, 10s, max 30s
        delay = Math.min(5000 * Math.pow(1.5, Math.min(consecutiveErrors - 1, 4)), 30000);
      } else {
        consecutiveErrors = 0;
      }
    } catch (err) {
      consecutiveErrors++;
      delay = Math.min(5000 * Math.pow(1.5, Math.min(consecutiveErrors - 1, 4)), 30000);
      console.error('[CONNECTOR ERROR]:', err?.message);
    } finally {
      pollTimer = setTimeout(scheduleCycle, delay);
    }
  }

  scheduleCycle();
}

if (require.main === module) {
  start();
}

module.exports = {
  fetchLocalBridgeStatus,
  fetchLocalBridgeCandles,
  postTelemetryOutbound,
  pollAndPushTelemetry,
  getCanonicalUniverse,
  CANONICAL_SYMBOLS,
};
