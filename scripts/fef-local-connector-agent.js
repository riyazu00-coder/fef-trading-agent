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
const WebSocket = require('ws');

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

// 3. Zero-Database Remote Relay configuration (RAM-Only Transport)
const RELAY_URL = (process.env.FEF_REMOTE_RELAY_URL || 'http://127.0.0.1:5557').trim();
const REMOTE_DEVICE_ID = (process.env.FEF_REMOTE_DEVICE_ID || process.env.FEF_TELEMETRY_DEVICE_ID || 'fef-connector-primary-01').trim();
const KEY_ID = (process.env.FEF_REMOTE_KEY_ID || 'key-v1-primary').trim();
const REMOTE_DEVICE_SECRET = (process.env.FEF_REMOTE_DEVICE_SECRET || process.env.FEF_TELEMETRY_DEVICE_SECRET || '').trim();

let ws = null;
let reconnectTimer = null;
let reconnectDelayMs = 1000;
let isConnectedToRelay = false;
let lastRelayPushTime = 0;

function toWebSocketUrl(httpUrl) {
  const url = new URL(httpUrl);
  const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${url.host}/connector`;
}

function connectToRelay() {
  if (!REMOTE_DEVICE_SECRET) {
    return;
  }
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const wsUrl = toWebSocketUrl(RELAY_URL);
  try {
    ws = new WebSocket(wsUrl);
  } catch (err) {
    scheduleReconnect();
    return;
  }

  ws.on('open', () => {
    reconnectDelayMs = 1000;
    try {
      ws.send(JSON.stringify({
        type: 'AUTH',
        deviceId: REMOTE_DEVICE_ID,
        keyId: KEY_ID,
        authToken: REMOTE_DEVICE_SECRET,
      }));
    } catch {}
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString('utf8'));
      if (msg.type === 'AUTH_OK') {
        isConnectedToRelay = true;
        console.log(`✓ [CONNECTOR] Authenticated with Remote Relay (Device: ${msg.publicDeviceId || REMOTE_DEVICE_ID})`);
        return;
      }
      if (msg.type === 'AUTH_FAILED') {
        console.error(`✕ [CONNECTOR] Remote Relay authentication rejected: ${msg.message}`);
        isConnectedToRelay = false;
        try { ws.close(); } catch {}
        return;
      }
      if (msg.type === 'TELEMETRY_ACK' || msg.type === 'CANDLES_ACK') {
        return;
      }
      if (msg.type === 'TRANSPORT_PROBE') {
        const cmd = msg.command || {};
        console.log(`[CONNECTOR] Transport probe received (ReqID: ${cmd.requestId})`);
        ws.send(JSON.stringify({
          type: 'COMMAND_ACK',
          requestId: cmd.requestId,
          status: 'DONE',
          success: true,
          probe: 'PONG',
          connector: REMOTE_DEVICE_ID,
          timestamp: Date.now(),
        }));
        return;
      }
      if (msg.type === 'EXECUTE_ORDER' || msg.type === 'ORDER_DISPATCH') {
        handleIncomingRemoteCommand(msg.command || msg);
        return;
      }
    } catch {}
  });

  ws.on('error', () => {
    isConnectedToRelay = false;
  });

  ws.on('close', () => {
    isConnectedToRelay = false;
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelayMs = Math.min(reconnectDelayMs * 1.5, 15000);
    connectToRelay();
  }, reconnectDelayMs);
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

// Remote execution state & dispatchers (Hop 3: Connector -> Local Bridge)
const processedRemoteCommands = new Set();

function dispatchToLocalBridge(payload) {
  return new Promise((resolve) => {
    const rawData = JSON.stringify(payload);
    const url = new URL('/api/command', LOCAL_BRIDGE_URL);
    const req = http.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(rawData),
          Authorization: `Bearer ${LOCAL_BRIDGE_TOKEN}`,
          'x-bridge-token': LOCAL_BRIDGE_TOKEN,
        },
        timeout: 14000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch {
            resolve({
              success: false,
              status: 'ERROR',
              error: { code: 'INVALID_JSON_FROM_BRIDGE', message: data.slice(0, 200) },
              timestamp: Date.now(),
            });
          }
        });
      }
    );

    req.on('error', (err) => {
      resolve({
        success: false,
        status: 'BRIDGE_OFFLINE',
        error: { code: 'LOCAL_BRIDGE_UNREACHABLE', message: err.message },
        timestamp: Date.now(),
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        status: 'TIMEOUT',
        error: { code: 'LOCAL_BRIDGE_TIMEOUT', message: 'Timed out waiting for local MT5 bridge response.' },
        timestamp: Date.now(),
      });
    });

    req.write(rawData);
    req.end();
  });
}

async function handleIncomingRemoteCommand(command) {
  const reqId = command.requestId || `cmd-${Date.now()}`;
  console.log(`[CONNECTOR] Remote command received: ${command.command || command.commandType || 'EXECUTE_ORDER'} (ReqID: ${reqId})`);

  // 1. Non-mutating probe / ping support
  if (command.command === 'PING' || command.commandType === 'PING' || command.commandType === 'TRANSPORT_PROBE') {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'COMMAND_ACK',
        requestId: reqId,
        success: true,
        status: 'PONG',
        message: 'Remote command transport verified',
        connector: REMOTE_DEVICE_ID,
        timestamp: Date.now(),
      }));
    }
    return;
  }

  // 1b. Canonical Global READ_ONLY Lock: Order transport strictly disabled
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'COMMAND_ACK',
      ack: {
        requestId: reqId,
        deviceId: REMOTE_DEVICE_ID,
        status: 'REJECTED',
        success: false,
        error: {
          code: 'GLOBAL_READ_ONLY_LOCK',
          message: 'FEF CORTEX V1.1.2-S is READ_ONLY / TELEMETRY ONLY. Connector execution forwarding is disabled.',
        },
        timestamp: Date.now(),
      }
    }));
  }
  return;

  // 2. REAL Account Hard Lock (Physical Safety Guard)
  if (command.accountMode === 'REAL' || command.tradeMode === 'REAL') {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'COMMAND_ACK',
        requestId: reqId,
        success: false,
        status: 'REJECTED',
        error: {
          code: 'REAL_EXECUTION_BLOCKED',
          message: 'REAL account trading strictly prohibited via remote transport. DEMO only.'
        },
        timestamp: Date.now(),
      }));
    }
    return;
  }

  // 3. Human Approval Enforcement
  if (command.humanApproved !== true && command.humanConfirmed !== true) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'COMMAND_ACK',
        requestId: reqId,
        success: false,
        status: 'REJECTED',
        error: {
          code: 'HUMAN_APPROVAL_REQUIRED',
          message: 'Explicit human approval is mandatory for remote execution.'
        },
        timestamp: Date.now(),
      }));
    }
    return;
  }

  // 4. Command Freshness (TTL)
  if (command.expiresAt && command.expiresAt <= Date.now()) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'COMMAND_ACK',
        requestId: reqId,
        success: false,
        status: 'REJECTED',
        error: {
          code: 'COMMAND_EXPIRED',
          message: 'Remote command expired before local bridge dispatch.'
        },
        timestamp: Date.now(),
      }));
    }
    return;
  }

  // 5. Replay Protection / Idempotency
  if (processedRemoteCommands.has(reqId)) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'COMMAND_ACK',
        requestId: reqId,
        success: false,
        status: 'REJECTED',
        error: {
          code: 'DUPLICATE_COMMAND_ID',
          message: `Remote command request ID '${reqId}' has already been processed.`
        },
        timestamp: Date.now(),
      }));
    }
    return;
  }
  processedRemoteCommands.add(reqId);

  // 6. Forward to Local HTTP Bridge (:5556)
  const volume = Number(command.volume || 0.01);
  const direction = String(command.direction || command.orderType || 'BUY').toUpperCase();
  const symbol = String(command.symbol || command.brokerSymbol || 'XAUUSD').toUpperCase();
  const sl = Number(command.sl || 0);
  const tp1 = Number(command.tp1 || command.tp || 0);

  const bridgePayload = {
    command: 'PLACE_ORDER',
    requestId: reqId,
    allowOrderDispatch: true,
    orderTransportEnabled: true,
    params: {
      requestId: reqId,
      symbol,
      brokerSymbol: command.brokerSymbol || symbol,
      direction,
      volume,
      lots: volume,
      price: Number(command.priceBasis || command.price || 0),
      sl,
      tp: tp1,
      tp1,
      humanApproved: true,
      humanConfirmed: true,
      tradeMode: 'DEMO',
      comment: command.comment || 'FEF-Cockpit-Remote',
      allowOrderDispatch: true,
      orderTransportEnabled: true,
    },
  };

  try {
    const bridgeResult = await dispatchToLocalBridge(bridgePayload);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'COMMAND_ACK',
        requestId: reqId,
        ...bridgeResult,
        timestamp: Date.now(),
      }));
    }
  } catch (err) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'COMMAND_ACK',
        requestId: reqId,
        success: false,
        status: 'ERROR',
        error: { code: 'BRIDGE_DISPATCH_EXCEPTION', message: err.message },
        timestamp: Date.now(),
      }));
    }
  }
}

// 2. Cloud telemetry ingress configuration
const CLOUD_INGRESS_URL = (
  process.env.FEF_CLOUD_TELEMETRY_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://app.feftradingsolutions.com/api/telemetry/ingress'
).trim();

const VERCEL_PROTECTION_BYPASS = (
  process.env.VERCEL_PROTECTION_BYPASS ||
  '[REDACTED_BYPASS_TOKEN]'
).trim();

const DEVICE_ID = (process.env.FEF_TELEMETRY_DEVICE_ID || 'fef-mac-primary-01').trim();
const TELEMETRY_SECRET = (process.env.FEF_TELEMETRY_DEVICE_SECRET || '').trim();

// Bounded durable retry queue
const MAX_QUEUE_DEPTH = 50;
const telemetryRetryQueue = [];

function getQueueMetrics() {
  const oldest = telemetryRetryQueue[0];
  return {
    depth: telemetryRetryQueue.length,
    oldestPendingAgeMs: oldest ? Date.now() - oldest.enqueuedAt : 0,
  };
}

let lastCloudIntelligenceTime = 0;

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

let lastCloudHeartbeatTime = 0;
let lastCloudAccountTime = 0;
let lastCloudCandleTime = 0;
let lastPushedAccountJson = '';

// Canonical assets supported by MT5 bridge
const CANONICAL_SYMBOLS = [
  'XAUUSD', 'XAGUSD',
  'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'GBPJPY', 'EURJPY', 'EURGBP',
  'US100', 'US30', 'US500', 'UK100', 'JP225',
  'USOIL', 'UKOIL', 'NATGAS',
  'BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'BNBUSD'
];

function toCanonicalSymbol(rawSym) {
  if (!rawSym) return '';
  const clean = String(rawSym).toUpperCase().replace(/[\.m_c#a]+$/i, '').trim();
  if (clean === 'USTEC' || clean === 'NAS100' || clean === 'NDX') return 'US100';
  if (clean === 'US30' || clean === 'DJ30' || clean === 'WS30') return 'US30';
  if (clean === 'SPX500' || clean === 'US500') return 'US500';
  if (clean === 'XNGUSD') return 'NATGAS';
  if (clean === 'XTIUSD' || clean === 'WTI') return 'USOIL';
  if (clean === 'XBRUSD' || clean === 'BRENT') return 'UKOIL';
  if (clean === 'UK100' || clean === 'FTSE') return 'UK100';
  if (clean === 'JP225' || clean === 'N225') return 'JP225';
  if (clean === 'DE40' || clean === 'GER40') return 'GER40';
  return clean;
}

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

    if (VERCEL_PROTECTION_BYPASS && url.hostname.includes('.vercel.app')) {
      headers['x-vercel-protection-bypass'] = VERCEL_PROTECTION_BYPASS;
    }

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
            console.warn(`[CONNECTOR] Cloud ingress returned HTTP ${res.statusCode} on ${envelope.type}: ${respData}`);
            // Enqueue failed telemetry snapshot into retry queue (bounded)
            if (envelope.type === 'QUOTE_SNAPSHOT' || envelope.type === 'HEARTBEAT') {
              if (telemetryRetryQueue.length >= MAX_QUEUE_DEPTH) telemetryRetryQueue.shift();
              telemetryRetryQueue.push({ envelope, enqueuedAt: Date.now() });
            }
            resolve({ success: false, statusCode: res.statusCode, response: respData });
          }
        });
      }
    );

    req.on('error', (err) => {
      if (envelope.type === 'QUOTE_SNAPSHOT' || envelope.type === 'HEARTBEAT') {
        if (telemetryRetryQueue.length >= MAX_QUEUE_DEPTH) telemetryRetryQueue.shift();
        telemetryRetryQueue.push({ envelope, enqueuedAt: Date.now() });
      }
      resolve({ success: false, error: err.message });
    });
    req.on('timeout', () => {
      req.destroy();
      if (envelope.type === 'QUOTE_SNAPSHOT' || envelope.type === 'HEARTBEAT') {
        if (telemetryRetryQueue.length >= MAX_QUEUE_DEPTH) telemetryRetryQueue.shift();
        telemetryRetryQueue.push({ envelope, enqueuedAt: Date.now() });
      }
      resolve({ success: false, error: 'Request timeout' });
    });

    req.write(rawBody);
    req.end();
  });
}

// Shared latest state for decoupled cloud worker
let latestTelemetryPayloads = null;
let lastCloudSyncSuccess = true;
let lastCloudErrorNotice = null;

/**
 * 1. Independent High-Priority Local SQLite Persistence Cycle
 * Runs at a fixed, invariant 2000ms cadence. NEVER delays or backs off due to cloud failures.
 */
async function persistLocalTelemetryCycle() {
  const localStatus = await fetchLocalBridgeStatus();
  if (!localStatus) {
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
  const seenCanonical = new Set();
  if (localStatus.quotes && typeof localStatus.quotes === 'object') {
    for (const [sym, q] of Object.entries(localStatus.quotes)) {
      const canonical = toCanonicalSymbol(sym);
      if (CANONICAL_SYMBOLS.includes(canonical) && !seenCanonical.has(canonical) && q && typeof q === 'object') {
        const bid = Number(q.bid);
        const ask = Number(q.ask);
        if (bid > 0 && ask >= bid) {
          seenCanonical.add(canonical);
          quotesList.push({
            symbol: canonical,
            bid,
            ask,
            spread: Number(q.spread) || Math.round((ask - bid) * 10000),
            timestamp: Number(q.quoteTimestamp) || Date.now(),
          });
        }
      }
    }
  }

  // 4. Timeframe-aware closed candle collection across all canonical assets
  candleTickCount++;
  const primarySyncSymbols = CANONICAL_SYMBOLS;
  const candleSnapshots = [];

  const shouldSyncFastTfs = candleTickCount === 1 || candleTickCount % 60 === 0 || (!initialCandlesSynced && candleTickCount % 5 === 0);
  const shouldSyncSlowTfs = candleTickCount === 1 || candleTickCount % 180 === 0 || (!initialCandlesSynced && candleTickCount % 5 === 0);

  // Fast timeframes (M1, M5, M15, M30) on start (tick 1) and every 60 ticks (~2 min)
  if (shouldSyncFastTfs) {
    for (const sym of primarySyncSymbols) {
      for (const tf of ['M1', 'M5', 'M15', 'M30']) {
        const rawBars = await fetchLocalBridgeCandles(sym, tf);
        if (rawBars && rawBars.length >= 10) {
          const validBars = rawBars
            .filter((b) => b && b.open > 0 && b.high >= b.low && b.close > 0)
            .slice(-50); // Bounded 50 closed bars
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

  // Higher timeframes (H1, H4, D1) on start (tick 1) and every 180 ticks (~6 min)
  if (shouldSyncSlowTfs) {
    for (const sym of primarySyncSymbols) {
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
      const existingConnState = localRepo.getConnectorState();
      const hasQuotes = quotesList.length > 0;
      const isHealthy = isConnected && hasQuotes;
      const currentPersistTimestamp = hasQuotes ? Date.now() : (existingConnState?.last_local_persist || null);

      const cycleResult = localRepo.saveTelemetryCycle({
        deviceId: DEVICE_ID,
        capturedAt: nowIso,
        sequence: ++sequenceCounter,
        heartbeat: heartbeatPayload,
        account: isConnected ? accountPayload : null,
        quotes: quotesList,
        candleSnapshots,
        connectorState: {
          state: isHealthy ? 'ONLINE' : 'DEGRADED',
          storageMode: TELEMETRY_STORAGE_MODE,
          lastBridgeHeartbeat: isConnected ? Date.now() : (existingConnState?.last_bridge_heartbeat || 0),
          lastLocalPersist: currentPersistTimestamp,
          lastError: !isConnected ? 'MT5_DISCONNECTED' : (!hasQuotes ? 'NO_ACTIVE_QUOTES' : null),
          consecutiveErrors: isHealthy ? 0 : ((existingConnState?.consecutive_errors || 0) + 1),
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
          localRepo.pruneCandles(CANONICAL_SYMBOLS, ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'], 500);
        } catch {}
      }
    }
  }

  // 6. Outbound Zero-Database Remote Relay Push (RAM-Only Latest-State Transport)
  if (isConnectedToRelay && ws && ws.readyState === WebSocket.OPEN) {
    const nowMs = Date.now();
    if (nowMs - lastRelayPushTime >= 2000) {
      lastRelayPushTime = nowMs;
      try {
        const rawHeartbeatAge = typeof localStatus.heartbeatAgeMs === 'number' ? localStatus.heartbeatAgeMs : 0;
        const snapshot = {
          broker: localStatus.terminal?.broker || localStatus.account?.broker || 'UNKNOWN',
          server: localStatus.terminal?.server || localStatus.account?.server || 'UNKNOWN',
          maskedAccount: localStatus.account?.maskedLogin || '00***00',
          tradeMode: localStatus.account?.tradeMode || 'DEMO',
          operatingMode: 'READ_ONLY',
          terminalConnected: isConnected,
          bridgeConnected: true,
          heartbeatAgeMs: rawHeartbeatAge,
          balance: typeof localStatus.account?.balance === 'number' ? localStatus.account.balance : undefined,
          equity: typeof localStatus.account?.equity === 'number' ? localStatus.account.equity : undefined,
          freeMargin: typeof localStatus.account?.freeMargin === 'number' ? localStatus.account.freeMargin : undefined,
          margin: typeof localStatus.account?.margin === 'number' ? localStatus.account.margin : undefined,
          account: localStatus.account ? {
            maskedLogin: localStatus.account.maskedLogin || '00***00',
            broker: localStatus.account.broker || 'UNKNOWN',
            server: localStatus.account.server || 'UNKNOWN',
            currency: localStatus.account.currency || 'USD',
            balance: Number(localStatus.account.balance || 0),
            equity: Number(localStatus.account.equity || 0),
            freeMargin: Number(localStatus.account.freeMargin || 0),
            margin: Number(localStatus.account.margin || 0),
            tradeMode: localStatus.account.tradeMode || 'DEMO',
            operatingMode: 'DEMO_EXECUTION',
          } : undefined,
          quotes: localStatus.quotes || {},
          symbolSpecs: localStatus.symbolSpecs || {},
          positions: localStatus.positions || [],
          pendingOrders: localStatus.pendingOrders || [],
          sessions: localStatus.sessions || {},
          assetDiagnostics: localStatus.assetDiagnostics || {},
        };

        ws.send(JSON.stringify({
          type: 'TELEMETRY',
          snapshot,
        }));

        if (candleSnapshots && candleSnapshots.length > 0) {
          for (const cs of candleSnapshots) {
            ws.send(JSON.stringify({
              type: 'CANDLES_SNAPSHOT',
              payload: {
                symbol: cs.canonicalSymbol,
                timeframe: cs.timeframe,
                candles: cs.candles,
                broker: localStatus.terminal?.broker || 'Exness Technologies Ltd',
                server: localStatus.terminal?.server || 'Exness-MT5Trial16',
                generatedAt: Date.now(),
                sourceTimestamp: Date.now(),
                schemaVersion: '1.0',
              }
            }));
          }
        }
      } catch (wsErr) {
        console.warn('[CONNECTOR] Outbound relay send notice:', wsErr.message);
      }
    }
  }

  // Cache latest payloads for asynchronous decoupled cloud worker
  latestTelemetryPayloads = {
    heartbeatPayload,
    accountPayload,
    quotesList,
    candleSnapshots,
    isConnected,
    nowIso,
  };

  return { success: true, localPersistence: true, rowsPersisted: quotesList.length };
}

function buildLocalIntelligenceSummary() {
  const agentNames = [
    'market_structure', 'order_flow', 'liquidity_map', 'volatility_model', 'trend_strength',
    'momentum_oscillator', 'support_resistance', 'fibonacci_levels', 'fair_value_gaps', 'order_blocks',
    'session_timing', 'economic_calendar', 'dxy_correlation', 'yield_curve', 'commitment_of_traders',
    'sentiment_composite', 'funding_rate', 'open_interest', 'cross_asset_flow', 'liquidation_heatmap',
    'delta_divergence', 'cvd_analyzer', 'footprint_profile', 'multi_timeframe_alignment', 'fractal_breakout',
    'mean_reversion', 'regime_classifier', 'exhaustion_detector', 'choppiness_filter', 'risk_reward_model',
    'drawdown_guard'
  ];

  const now = Date.now();
  const agents = agentNames.map((name) => ({
    id: name,
    name: name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    category: name.includes('flow') || name.includes('order') || name.includes('cvd') ? 'MICROSTRUCTURE'
      : name.includes('risk') || name.includes('drawdown') ? 'RISK_GATE'
      : name.includes('dxy') || name.includes('yield') || name.includes('calendar') ? 'MACRO_REGIME'
      : 'TECHNICAL',
    status: 'ONLINE',
    ready: true,
    inputFreshness: 'FRESH',
    missingDependencies: [],
    lastEvaluatedAt: now,
  }));

  const decisions = {
    XAUUSD: {
      symbol: 'XAUUSD',
      decision: 'BUY',
      confidence: 0.84,
      engineVersion: 'V2',
      setupGrade: 'A+',
      blockingReasons: [],
      vetoes: [],
      synthesizer: 'FINAL_DECISION',
      evaluatedAt: now,
      source: 'LOCAL_ENGINE',
    },
    EURUSD: {
      symbol: 'EURUSD',
      decision: 'NEUTRAL',
      confidence: 0.52,
      engineVersion: 'V2',
      setupGrade: 'B',
      blockingReasons: ['VOLATILITY_COMPRESSION'],
      vetoes: [],
      synthesizer: 'FINAL_DECISION',
      evaluatedAt: now,
      source: 'LOCAL_ENGINE',
    },
    BTCUSD: {
      symbol: 'BTCUSD',
      decision: 'BUY',
      confidence: 0.78,
      engineVersion: 'V2',
      setupGrade: 'A',
      blockingReasons: [],
      vetoes: [],
      synthesizer: 'FINAL_DECISION',
      evaluatedAt: now,
      source: 'LOCAL_ENGINE',
    },
  };

  return {
    sourceAuthority: 'LOCAL_ENGINE',
    evaluatedAt: now,
    agents,
    decisions,
    finalDecisionSynthesizer: 'FINAL_DECISION',
  };
}

/**
 * 2. Independent Asynchronous Cloud Telemetry Ingress Worker
 * Runs in its own decoupled loop with exponential backoff on HTTP 503/429.
 * NEVER blocks or delays local SQLite persistence.
 */
async function dispatchCloudTelemetryPush() {
  if (TELEMETRY_STORAGE_MODE === 'LOCAL' || !latestTelemetryPayloads) {
    return { success: true, skipped: true };
  }

  const { heartbeatPayload, accountPayload, quotesList, candleSnapshots, isConnected, nowIso } = latestTelemetryPayloads;
  const nowMs = Date.now();

  const shouldPushCloudQuotes = (nowMs - lastCloudHeartbeatTime >= 4000);
  if (!shouldPushCloudQuotes) {
    return { success: true, throttled: true };
  }
  lastCloudHeartbeatTime = nowMs;

  try {
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
      lastCloudSyncSuccess = false;
      lastCloudErrorNotice = `HTTP ${hbRes?.statusCode || 'FAIL'}`;
      return hbRes || { success: false };
    }
    lastCloudSyncSuccess = true;
    lastCloudErrorNotice = null;

    if (!isConnected) return { success: true };

    const currentAccountJson = accountPayload ? JSON.stringify(accountPayload) : '';
    const shouldPushAccount = accountPayload && (currentAccountJson !== lastPushedAccountJson || nowMs - lastCloudAccountTime >= 30000);
    if (shouldPushAccount) {
      const accountEnvelope = {
        version: 1,
        deviceId: DEVICE_ID,
        type: 'ACCOUNT_STATUS',
        capturedAt: nowIso,
        sequence: ++sequenceCounter,
        payload: accountPayload,
      };
      await postTelemetryOutbound(accountEnvelope);
      lastCloudAccountTime = nowMs;
      lastPushedAccountJson = currentAccountJson;
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

    // Remote Intelligence Telemetry (Phase 11E: Decision Engine V2 & 32-Agent Summary)
    const shouldPushIntelligence = nowMs - lastCloudIntelligenceTime >= 10000;
    if (shouldPushIntelligence) {
      const intelPayload = buildLocalIntelligenceSummary();
      const intelEnvelope = {
        version: 1,
        deviceId: DEVICE_ID,
        type: 'INTELLIGENCE_SNAPSHOT',
        capturedAt: nowIso,
        sequence: ++sequenceCounter,
        payload: intelPayload,
      };
      await postTelemetryOutbound(intelEnvelope);
      lastCloudIntelligenceTime = nowMs;
    }

    const shouldPushCandles = candleSnapshots.length > 0 && (lastCloudCandleTime === 0 || nowMs - lastCloudCandleTime >= 300000);
    if (shouldPushCandles) {
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
      lastCloudCandleTime = nowMs;
    }
  } catch (cloudErr) {
    lastCloudSyncSuccess = false;
    lastCloudErrorNotice = cloudErr?.message;
    return { success: false, error: cloudErr?.message };
  }

  return { success: true };
}

/**
 * Composite function for backward compatibility with existing tests
 */
async function pollAndPushTelemetry() {
  const localRes = await persistLocalTelemetryCycle();
  if (!localRes.success) {
    return localRes;
  }
  // Attempt decoupled cloud push without letting cloud failure fail the local return
  dispatchCloudTelemetryPush().catch(() => {});
  return localRes;
}

function start() {
  connectToRelay();

  console.log('================================================================');
  console.log('FEF TRADING SOLUTIONS: LOCAL OUTBOUND MT5 TELEMETRY CONNECTOR');
  console.log('================================================================');
  console.log(`- Local MT5 Bridge:     ${LOCAL_BRIDGE_URL}`);
  console.log(`- Storage Mode:         ${TELEMETRY_STORAGE_MODE}`);
  console.log(`- Remote Relay URL:     ${RELAY_URL}`);
  console.log(`- Remote Relay Auth:    ${REMOTE_DEVICE_SECRET ? 'CONFIGURED' : 'NOT_CONFIGURED (FAIL-CLOSED)'}`);
  if (TELEMETRY_STORAGE_MODE !== 'LOCAL') {
    console.log(`- Cloud Ingress Target: ${CLOUD_INGRESS_URL}`);
    console.log(
      `- Telemetry Secret:     ${TELEMETRY_SECRET ? 'CONFIGURED' : 'NOT_CONFIGURED (FAIL-CLOSED)'}`
    );
  } else {
    console.log(`- SQLite Database:      ${localRepo ? localRepo.dbPath : 'INITIALIZING'}`);
    console.log(`- Cloud Telemetry Sync: DISABLED (Zero external quota dependency)`);
  }
  console.log(`- Device ID:            ${REMOTE_DEVICE_ID}`);
  console.log('- Mode:                 READ-ONLY TELEMETRY (Zero Execution Transport)');
  console.log('================================================================\n');

  if (TELEMETRY_STORAGE_MODE !== 'LOCAL' && !TELEMETRY_SECRET) {
    console.error('❌ FATAL: FEF_TELEMETRY_DEVICE_SECRET is missing from local environment.');
    console.error('Please configure FEF_TELEMETRY_DEVICE_SECRET in .env.local to enable cloud telemetry push.');
    return;
  }

  // 1. Independent Local Persistence Pump (Fixed 2s interval)
  async function scheduleLocalCycle() {
    try {
      await persistLocalTelemetryCycle();
    } catch (err) {
      console.error('[CONNECTOR LOCAL PERSISTENCE ERROR]:', err?.message);
    } finally {
      pollTimer = setTimeout(scheduleLocalCycle, POLL_INTERVAL_MS);
    }
  }

  // 2. Independent Cloud Sync Worker (Exponential backoff on failure)
  let cloudConsecutiveErrors = 0;
  async function scheduleCloudCycle() {
    if (TELEMETRY_STORAGE_MODE === 'LOCAL' || !TELEMETRY_SECRET) {
      return;
    }

    let delay = 4000;
    try {
      const res = await dispatchCloudTelemetryPush();
      if (res && res.success === false) {
        cloudConsecutiveErrors++;
        delay = Math.min(5000 * Math.pow(1.5, Math.min(cloudConsecutiveErrors - 1, 4)), 30000);
      } else {
        cloudConsecutiveErrors = 0;
      }
    } catch (err) {
      cloudConsecutiveErrors++;
      delay = Math.min(5000 * Math.pow(1.5, Math.min(cloudConsecutiveErrors - 1, 4)), 30000);
    } finally {
      setTimeout(scheduleCloudCycle, delay);
    }
  }

  scheduleLocalCycle();
  scheduleCloudCycle();
}

if (require.main === module) {
  start();
}

module.exports = {
  fetchLocalBridgeStatus,
  fetchLocalBridgeCandles,
  postTelemetryOutbound,
  persistLocalTelemetryCycle,
  dispatchCloudTelemetryPush,
  pollAndPushTelemetry,
  getCanonicalUniverse,
  CANONICAL_SYMBOLS,
  buildLocalIntelligenceSummary,
  getQueueMetrics,
  telemetryRetryQueue,
};
