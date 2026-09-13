#!/usr/bin/env node
/**
 * FEF TRADING SOLUTIONS — LOCAL HTTP / WEBREQUEST MT5 BRIDGE SERVICE
 * 
 * Phase 32B Transport:
 * Binds strictly to 127.0.0.1:5556 (Loopback only, never 0.0.0.0).
 * Receives read-only push telemetry from FEF_HTTP_Bridge.mq5 via native WebRequest().
 * Serves aggregated telemetry to Next.js API route (/api/bridge/mt5).
 * Enforces strict READ_ONLY_LOCK_ACTIVE on any mutating command.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

// Load environment configuration if available
const envLocalPath = path.resolve(__dirname, '../.env.local');
let envToken = null;
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, 'utf8');
  const match = content.match(/FEF_BRIDGE_TOKEN=["']?([^"'\r\n]+)["']?/);
  if (match) envToken = match[1].trim();
}

const PORT = 5556;
const HOST = '127.0.0.1';
const VALID_TOKEN = process.env.FEF_BRIDGE_TOKEN || envToken || 'fef_local_bridge_token_v1';
const HEARTBEAT_TIMEOUT_MS = 6000; // 6 seconds without heartbeat marks MT5_OFFLINE

// In-Memory Telemetry State & Demo Execution Queues
const executedRequestIds = new Map();
const pendingOrdersQueue = [];
const orderWaiters = new Map();

const bridgeState = {
  serviceStartedAt: Date.now(),
  lastHeartbeat: 0,
  heartbeatCount: 0,
  mt5Connected: false,
  operatingMode: 'READ_ONLY', // ALWAYS starts in READ_ONLY safe default
  transport: 'HTTP / WEBREQUEST',
  terminal: {
    build: 0,
    broker: 'UNKNOWN BROKER',
    server: 'MT5 SERVER',
    accountLogin: '00***00',
    currency: 'USD',
    magic: 8882026,
    terminalConnected: true,
  },
  account: {
    maskedLogin: '00***00',
    broker: 'UNKNOWN BROKER',
    server: 'MT5 SERVER',
    currency: 'USD',
    tradeMode: 'DEMO',
    balance: 0,
    equity: 0,
    margin: 0,
    freeMargin: 0,
    marginLevel: 0,
    leverage: 100,
    tradeAllowed: false,
    terminalBuild: 0,
    operatingMode: 'READ_ONLY',
    lastUpdated: 0,
  },
  quotes: {}, // Keyed by canonical symbol and broker symbol
  positions: [],
  orders: [],
  symbols: [],
  symbolSpecs: [],
  specsBySymbol: {},
  sessions: {},
};

// Mask account number for security
function maskAccount(login) {
  if (!login) return '00***00';
  const str = String(login);
  if (str.includes('***')) return str;
  if (str.length <= 4) return str;
  return str.slice(0, 2) + '***' + str.slice(-2);
}

// Check if request is authenticated
function isAuthorized(req, bodyObj) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer === VALID_TOKEN) return true;
  }

  const customHeader = req.headers['x-bridge-token'];
  if (customHeader && customHeader.trim() === VALID_TOKEN) return true;

  if (bodyObj && bodyObj.token && bodyObj.token === VALID_TOKEN) return true;

  // For localhost GET requests from Next.js server actions
  const ip = req.socket.remoteAddress;
  if (req.method === 'GET' && (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1')) {
    return true;
  }

  return false;
}

// Collect raw body helper with diagnostic inspection & trailing NUL tolerance
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalLength = 0;

    req.on('data', chunk => {
      chunks.push(chunk);
      totalLength += chunk.length;
      if (totalLength > 5 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });

    req.on('end', () => {
      if (chunks.length === 0 || totalLength === 0) {
        return resolve({});
      }

      const buffer = Buffer.concat(chunks);
      const rawContentLength = req.headers['content-length'];

      // Diagnostic logging of byte structure (without logging secrets)
      const lastBytes = [];
      const inspectCount = Math.min(4, buffer.length);
      for (let i = buffer.length - inspectCount; i < buffer.length; i++) {
        lastBytes.push('0x' + buffer[i].toString(16).padStart(2, '0'));
      }

      console.log(`[FEF-HTTP-DEBUG] received content-length=${rawContentLength || 'chunked'} | byte length=${buffer.length} | last 4 bytes=[${lastBytes.join(', ')}]`);

      let str = buffer.toString('utf8');

      // Compatibility tolerance: If trailing NUL (0x00) was sent, strip and warn
      let hadTrailingNul = false;
      if (str.length > 0 && str.charCodeAt(str.length - 1) === 0) {
        hadTrailingNul = true;
        console.warn('⚠ [FEF-HTTP-COMPAT] Notice: Request contained trailing 0x00 NUL terminator. Stripped for compatibility.');
        str = str.slice(0, -1);
      }

      const trimmed = str.trim();
      if (trimmed.length === 0) {
        return resolve({});
      }

      try {
        const parsed = JSON.parse(trimmed);
        resolve(parsed);
      } catch (err) {
        console.error(`✕ [FEF-HTTP-ERROR] Malformed JSON parse failure: ${err.message} | Preview: ${trimmed.slice(0, 100)}`);
        resolve({ _rawInvalid: trimmed, _parseError: err.message, _hadTrailingNul: hadTrailingNul });
      }
    });

    req.on('error', reject);
  });
}

// Send JSON response helper
function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-bridge-token',
    'Cache-Control': 'no-cache, no-store',
  });
  res.end(body);
}

// Heartbeat liveness check
function isHeartbeatFresh() {
  if (!bridgeState.lastHeartbeat) return false;
  return (Date.now() - bridgeState.lastHeartbeat) < HEARTBEAT_TIMEOUT_MS;
}

// Authoritative Single-Source Operating Mode
function getAuthoritativeOperatingMode() {
  const isConnected = isHeartbeatFresh();
  if (!isConnected) {
    return 'READ_ONLY';
  }
  // REAL account hard-lock
  if (bridgeState.account && String(bridgeState.account.tradeMode).toUpperCase() === 'REAL') {
    return 'READ_ONLY';
  }
  // Terminal disconnected check
  if (bridgeState.terminal && bridgeState.terminal.terminalConnected === false) {
    return 'READ_ONLY';
  }
  // DEMO account + connected + fresh heartbeat + valid bridge state -> DEMO_EXECUTION
  if (bridgeState.operatingMode === 'DEMO_EXECUTION' && bridgeState.account && String(bridgeState.account.tradeMode).toUpperCase() === 'DEMO') {
    return 'DEMO_EXECUTION';
  }
  return 'READ_ONLY';
}

// Institutional Market Session Evaluator (UTC-based)
function isMarketSessionOpen(symbol, now = new Date()) {
  const s = String(symbol || '').toUpperCase().trim();
  // Crypto is 24/7 (BTC, ETH, SOL, XRP, BNB, etc.)
  if (s.startsWith('BTC') || s.startsWith('ETH') || s.startsWith('SOL') || s.startsWith('XRP') || s.startsWith('BNB') || s.includes('CRYPTO')) {
    return true;
  }

  const dayOfWeek = now.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  const totalMins = hour * 60 + minute;

  // Saturday: All non-crypto markets are closed
  if (dayOfWeek === 6) {
    return false;
  }

  // Metals (XAUUSD, XAGUSD, GOLD, SILVER)
  if (s.startsWith('XAU') || s.startsWith('XAG') || s.includes('GOLD') || s.includes('SILVER')) {
    // Sunday: Opens at 23:00 UTC
    if (dayOfWeek === 0) {
      return totalMins >= 23 * 60;
    }
    // Friday: Closes at 21:55 UTC
    if (dayOfWeek === 5) {
      return totalMins < 21 * 60 + 55;
    }
    // Mon-Thu: Daily maintenance break 21:00-22:00 UTC
    if (totalMins >= 21 * 60 && totalMins < 22 * 60) {
      return false;
    }
    return true;
  }

  // Forex (EURUSD, GBPUSD, USDJPY, AUDUSD, etc.)
  if (s.length === 6 || s.includes('USD') || s.includes('EUR') || s.includes('GBP') || s.includes('JPY')) {
    // Sunday: Opens at 21:05 UTC
    if (dayOfWeek === 0) {
      return totalMins >= 21 * 60 + 5;
    }
    // Friday: Closes at 21:55 UTC
    if (dayOfWeek === 5) {
      return totalMins < 21 * 60 + 55;
    }
    return true;
  }

  // US Indices (US30, US100, US500, etc.)
  if (s.startsWith('US30') || s.startsWith('US100') || s.startsWith('US500') || s.includes('WS30') || s.includes('DJ30') || s.includes('NAS100') || s.includes('SPX')) {
    if (dayOfWeek === 0) {
      return totalMins >= 23 * 60;
    }
    if (dayOfWeek === 5) {
      return totalMins < 21 * 60;
    }
    if (totalMins >= 21 * 60 && totalMins < 22 * 60) {
      return false;
    }
    return true;
  }

  // Energies (USOIL, WTI, etc.)
  if (s.includes('OIL') || s.includes('WTI') || s.includes('CRUDE')) {
    if (dayOfWeek === 0) {
      return totalMins >= 23 * 60;
    }
    if (dayOfWeek === 5) {
      return totalMins < 21 * 60;
    }
    if (totalMins >= 21 * 60 && totalMins < 22 * 60) {
      return false;
    }
    return true;
  }

  return true;
}

// Quote Freshness Evaluator (Asset- & Session-Aware)
function evaluateQuoteFreshness(symbol, quote, nowMs = Date.now()) {
  if (!quote || typeof quote !== 'object' || !quote.bid || quote.bid <= 0 || !quote.ask || quote.ask <= 0) {
    return {
      freshness: 'UNAVAILABLE',
      isStale: true,
      ageMs: Infinity,
      reason: 'NO_QUOTE_DATA'
    };
  }

  const quoteTimeMs = Number(quote.timestamp || (quote.time ? new Date(quote.time).getTime() : 0));
  const ageMs = quoteTimeMs > 0 ? Math.max(0, nowMs - quoteTimeMs) : Infinity;

  const upper = String(symbol || quote.canonicalSymbol || '').toUpperCase().trim();
  const isCrypto = upper.startsWith('BTC') || upper.startsWith('ETH') || upper.startsWith('SOL') || upper.startsWith('XRP') || upper.startsWith('BNB') || upper.includes('CRYPTO');

  // Freshness thresholds:
  // Crypto: 30s (24/7)
  // Metals / Forex: 30s
  // Indices / Energies: 45s
  const freshnessThresholdMs = isCrypto ? 30000 : (upper.startsWith('US30') || upper.startsWith('US500') || upper.startsWith('US100') || upper.includes('OIL') ? 45000 : 30000);

  const sessionOpen = isMarketSessionOpen(upper, new Date(nowMs));

  // If session/market closed and quote not updating:
  if (!sessionOpen && ageMs > freshnessThresholdMs) {
    return {
      freshness: 'SESSION_CLOSED',
      isStale: true,
      ageMs,
      reason: 'MARKET_SESSION_CLOSED'
    };
  }

  // If market should be trading (or crypto 24/7) but quote age exceeds freshness threshold:
  if (ageMs > freshnessThresholdMs) {
    return {
      freshness: sessionOpen ? 'STALE' : 'SESSION_CLOSED',
      isStale: true,
      ageMs,
      reason: sessionOpen ? 'QUOTE_AGE_EXCEEDED' : 'MARKET_SESSION_CLOSED'
    };
  }

  // If quote age is within threshold:
  return {
    freshness: 'FRESH',
    isStale: false,
    ageMs,
    reason: 'LIVE_FEED_UPDATING'
  };
}

// HTTP Request Handler
async function handleHttpRequest(req, res) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-bridge-token',
    });
    return res.end();
  }

  const urlPath = req.url.split('?')[0];

  // Parse Body for POST
  let body = {};
  if (req.method === 'POST') {
    try {
      body = await readJsonBody(req);
      if (body._rawInvalid) {
        return sendJson(res, 400, {
          success: false,
          error: { code: 'INVALID_JSON', message: 'Malformed JSON payload' },
        });
      }
    } catch (err) {
      return sendJson(res, 400, {
        success: false,
        error: { code: 'READ_BODY_FAILED', message: err.message },
      });
    }
  }

  // Verify Auth for all mutating or telemetry endpoints
  if (!isAuthorized(req, body)) {
    return sendJson(res, 401, {
      success: false,
      state: 'AUTH_FAILED',
      error: { code: 'AUTH_FAILED', message: 'Invalid or missing authentication token' },
    });
  }

  // =========================================================================
  // 1. POST /mt5/heartbeat (From FEF_HTTP_Bridge.mq5)
  // =========================================================================
  if (req.method === 'POST' && urlPath === '/mt5/heartbeat') {
    bridgeState.lastHeartbeat = Date.now();
    bridgeState.heartbeatCount++;
    bridgeState.mt5Connected = true;

    if (body.terminalBuild) bridgeState.terminal.build = Number(body.terminalBuild);
    if (body.accountLogin) bridgeState.terminal.accountLogin = maskAccount(body.accountLogin);
    if (body.broker) bridgeState.terminal.broker = String(body.broker);
    if (body.server) bridgeState.terminal.server = String(body.server);
    if (body.accountCurrency) bridgeState.terminal.currency = String(body.accountCurrency);
    if (body.magic) bridgeState.terminal.magic = Number(body.magic);
    if (typeof body.terminalConnected === 'boolean') bridgeState.terminal.terminalConnected = body.terminalConnected;

    // Canonical operating mode synchronization from EA telemetry
    const requestedMode = String(body.operatingMode || 'READ_ONLY').trim().toUpperCase();
    const knownTradeMode = String(bridgeState.account.tradeMode || 'UNKNOWN').trim().toUpperCase();

    if (requestedMode === 'LIVE' || requestedMode === 'LIVE_EXECUTION') {
      console.warn(`[FEF-HTTP-SECURITY] Rejected illegal execution mode '${requestedMode}'. Forcing READ_ONLY.`);
      bridgeState.operatingMode = 'READ_ONLY';
      bridgeState.account.operatingMode = 'READ_ONLY';
    } else if (requestedMode === 'DEMO_EXECUTION') {
      // DEMO_EXECUTION may only be armed if the account is verified DEMO and terminal is connected
      if (knownTradeMode === 'DEMO' && bridgeState.terminal.terminalConnected !== false) {
        bridgeState.operatingMode = 'DEMO_EXECUTION';
        bridgeState.account.operatingMode = 'DEMO_EXECUTION';
      } else {
        console.warn(`[FEF-HTTP] DEMO_EXECUTION rejected: Account tradeMode is '${knownTradeMode}' (not verified DEMO). Forcing READ_ONLY.`);
        bridgeState.operatingMode = 'READ_ONLY';
        bridgeState.account.operatingMode = 'READ_ONLY';
      }
    } else {
      // READ_ONLY or unknown values
      bridgeState.operatingMode = 'READ_ONLY';
      bridgeState.account.operatingMode = 'READ_ONLY';
    }

    const authMode = getAuthoritativeOperatingMode();
    bridgeState.operatingMode = authMode;
    bridgeState.account.operatingMode = authMode;

    if (bridgeState.heartbeatCount % 30 === 1) {
      console.log(`[FEF-HTTP] MT5 heartbeat received from ${bridgeState.terminal.broker} build ${bridgeState.terminal.build} (${bridgeState.terminal.accountLogin}) | Canonical Mode: ${bridgeState.operatingMode}`);
    }

    let pendingOrder = null;
    if (bridgeState.operatingMode === 'DEMO_EXECUTION' && pendingOrdersQueue.length > 0) {
      pendingOrder = pendingOrdersQueue.shift();
    }

    return sendJson(res, 200, {
      success: true,
      state: bridgeState.operatingMode === 'DEMO_EXECUTION' ? 'CONNECTED_DEMO_EXECUTION' : 'CONNECTED_READ_ONLY',
      serverTime: new Date().toISOString(),
      mode: bridgeState.operatingMode,
      operatingMode: bridgeState.operatingMode,
      heartbeatCount: bridgeState.heartbeatCount,
      pendingOrder,
    });
  }

  // =========================================================================
  // 1b. POST /mt5/order-result (From FEF_HTTP_Bridge.mq5)
  // =========================================================================
  if (req.method === 'POST' && (urlPath === '/mt5/order-result' || urlPath === '/mt5/execution-result')) {
    const result = body;
    const reqId = result.requestId;
    if (reqId) {
      executedRequestIds.set(reqId, result);
      const waiter = orderWaiters.get(reqId);
      if (waiter) {
        clearTimeout(waiter.timer);
        orderWaiters.delete(reqId);
        waiter.resolve(result);
      }
    }

    // Append executed position to local in-memory state so positions immediately update
    if (result.success && result.ticket) {
      const existingPos = bridgeState.positions.find(p => p.ticket === result.ticket);
      if (!existingPos) {
        bridgeState.positions.unshift({
          ticket: Number(result.ticket),
          brokerSymbol: String(result.brokerSymbol || ''),
          canonicalSymbol: String(result.canonicalSymbol || result.brokerSymbol || ''),
          direction: String(result.direction || 'BUY'),
          volume: Number(result.volume || 0.01),
          openPrice: Number(result.fillPrice || result.openPrice || 0),
          currentPrice: Number(result.fillPrice || result.openPrice || 0),
          sl: Number(result.sl || 0),
          tp: Number(result.tp || 0),
          profit: 0.00,
          swap: 0.00,
          magic: Number(result.magic || 8882026),
          openTime: new Date(result.timestamp || Date.now()).toISOString().replace('T', ' ').substring(0, 19),
        });
      }
    }

    return sendJson(res, 200, { success: true, acknowledged: true });
  }

  // =========================================================================
  // 2. POST /mt5/account (From FEF_HTTP_Bridge.mq5)
  // =========================================================================
  if (req.method === 'POST' && urlPath === '/mt5/account') {
    const reportedTradeMode = String(body.tradeMode || 'DEMO').trim().toUpperCase();

    // If account reports REAL, immediately force READ_ONLY
    if (reportedTradeMode === 'REAL') {
      console.warn('⚠️ [FEF-HTTP-SECURITY] REAL account telemetry received! Hard-locking to READ_ONLY.');
      bridgeState.operatingMode = 'READ_ONLY';
    } else if (body.operatingMode === 'DEMO_EXECUTION' && reportedTradeMode === 'DEMO') {
      bridgeState.operatingMode = 'DEMO_EXECUTION';
    }

    bridgeState.account = {
      maskedLogin: maskAccount(body.maskedLogin),
      broker: body.broker || bridgeState.terminal.broker,
      server: body.server || bridgeState.terminal.server,
      currency: body.currency || bridgeState.terminal.currency,
      tradeMode: reportedTradeMode,
      balance: Number(body.balance || 0),
      equity: Number(body.equity || 0),
      margin: Number(body.margin || 0),
      freeMargin: Number(body.freeMargin || 0),
      marginLevel: Number(body.marginLevel || 0),
      leverage: Number(body.leverage || 100),
      tradeAllowed: Boolean(body.tradeAllowed),
      terminalBuild: Number(body.terminalBuild || bridgeState.terminal.build),
      operatingMode: 'READ_ONLY', // will be synced with authoritative mode below
      lastUpdated: Date.now(),
    };

    const authMode = getAuthoritativeOperatingMode();
    bridgeState.operatingMode = authMode;
    bridgeState.account.operatingMode = authMode;

    return sendJson(res, 200, {
      success: true,
      stored: 'account',
      mode: authMode,
      operatingMode: authMode,
    });
  }

  // =========================================================================
  // 3. POST /mt5/quote (From FEF_HTTP_Bridge.mq5)
  // =========================================================================
  if (req.method === 'POST' && urlPath === '/mt5/quote') {
    const quoteList = Array.isArray(body.quotes) ? body.quotes : (Array.isArray(body) ? body : []);
    const now = Date.now();

    for (const q of quoteList) {
      if (q && (q.canonicalSymbol || q.brokerSymbol)) {
        const canonical = q.canonicalSymbol || q.brokerSymbol;
        const qTimestamp = q.timestamp || (q.time ? new Date(q.time).getTime() : now);
        const evalResult = evaluateQuoteFreshness(canonical, { ...q, timestamp: qTimestamp }, now);

        const storedQuote = {
          canonicalSymbol: canonical,
          brokerSymbol: q.brokerSymbol || canonical,
          bid: Number(q.bid || 0),
          ask: Number(q.ask || 0),
          spread: Number(q.spread || 0),
          digits: Number(q.digits || 2),
          point: Number(q.point || 0.01),
          time: q.time || new Date(qTimestamp).toISOString(),
          timestamp: qTimestamp,
          freshness: evalResult.freshness,
          isStale: evalResult.isStale,
          ageMs: evalResult.ageMs,
          freshnessReason: evalResult.reason,
        };

        bridgeState.quotes[canonical] = storedQuote;
        if (q.brokerSymbol) {
          bridgeState.quotes[q.brokerSymbol] = storedQuote;
        }
      }
    }

    return sendJson(res, 200, { success: true, storedQuotes: quoteList.length });
  }

  // =========================================================================
  // 4. POST /mt5/positions (From FEF_HTTP_Bridge.mq5)
  // =========================================================================
  if (req.method === 'POST' && urlPath === '/mt5/positions') {
    const list = Array.isArray(body.positions) ? body.positions : [];
    bridgeState.positions = list.map(p => ({
      ticket: Number(p.ticket || 0),
      brokerSymbol: String(p.brokerSymbol || ''),
      canonicalSymbol: String(p.canonicalSymbol || p.brokerSymbol || ''),
      direction: String(p.direction || 'BUY'),
      volume: Number(p.volume || 0),
      openPrice: Number(p.openPrice || 0),
      currentPrice: Number(p.currentPrice || 0),
      sl: Number(p.sl || 0),
      tp: Number(p.tp || 0),
      profit: Number(p.profit || 0),
      swap: Number(p.swap || 0),
      magic: Number(p.magic || 8882026),
      openTime: String(p.openTime || ''),
    }));

    return sendJson(res, 200, { success: true, count: bridgeState.positions.length });
  }

  // =========================================================================
  // 5. POST /mt5/pending-orders (From FEF_HTTP_Bridge.mq5)
  // =========================================================================
  if (req.method === 'POST' && urlPath === '/mt5/pending-orders') {
    const list = Array.isArray(body.orders) ? body.orders : [];
    bridgeState.orders = list.map(o => ({
      ticket: Number(o.ticket || 0),
      symbol: String(o.symbol || ''),
      type: String(o.type || 'BUY_LIMIT'),
      volume: Number(o.volume || 0),
      price: Number(o.price || 0),
      sl: Number(o.sl || 0),
      tp: Number(o.tp || 0),
      expiration: String(o.expiration || 'GTC'),
      magic: Number(o.magic || 8882026),
      creationTime: String(o.creationTime || ''),
    }));

    return sendJson(res, 200, { success: true, count: bridgeState.orders.length });
  }

  // =========================================================================
  // 6. POST /mt5/symbols or POST /mt5/symbol-specs (From FEF_HTTP_Bridge.mq5)
  // =========================================================================
  if (req.method === 'POST' && (urlPath === '/mt5/symbols' || urlPath === '/mt5/symbol-specs')) {
    if (Array.isArray(body.symbols)) {
      bridgeState.symbols = body.symbols;
    }
    if (Array.isArray(body.specs)) {
      bridgeState.symbolSpecs = body.specs;
      if (!bridgeState.specsBySymbol) bridgeState.specsBySymbol = {};
      body.specs.forEach(spec => {
        if (spec.brokerSymbol) bridgeState.specsBySymbol[spec.brokerSymbol] = spec;
        if (spec.canonicalSymbol) bridgeState.specsBySymbol[spec.canonicalSymbol] = spec;
      });
    }
    return sendJson(res, 200, {
      success: true,
      symbolsCount: bridgeState.symbols.length,
      specsCount: (bridgeState.symbolSpecs || []).length
    });
  }

  // =========================================================================
  // 7. POST /mt5/session-info (From FEF_HTTP_Bridge.mq5)
  // =========================================================================
  if (req.method === 'POST' && urlPath === '/mt5/session-info') {
    if (body.session && body.session.brokerSymbol) {
      bridgeState.sessions[body.session.brokerSymbol] = body.session;
    }
    return sendJson(res, 200, { success: true, storedSession: true });
  }

  // =========================================================================
  // 8. GET /api/status or GET /mt5/status (Query from Next.js API / Website)
  // =========================================================================
  if (req.method === 'GET' && (urlPath === '/api/status' || urlPath === '/mt5/status' || urlPath === '/')) {
    const isConnected = isHeartbeatFresh();
    const ageMs = bridgeState.lastHeartbeat ? (Date.now() - bridgeState.lastHeartbeat) : null;
    const now = Date.now();

    const effectiveMode = getAuthoritativeOperatingMode();
    bridgeState.operatingMode = effectiveMode;
    if (bridgeState.account) {
      bridgeState.account.operatingMode = effectiveMode;
    }

    // Dynamically evaluate freshness for all quotes at query time
    const enrichedQuotes = {};
    for (const [key, quote] of Object.entries(bridgeState.quotes)) {
      if (quote) {
        const evalResult = evaluateQuoteFreshness(quote.canonicalSymbol || key, quote, now);
        enrichedQuotes[key] = {
          ...quote,
          freshness: evalResult.freshness,
          isStale: evalResult.isStale,
          ageMs: evalResult.ageMs,
          freshnessReason: evalResult.reason,
        };
      }
    }

    return sendJson(res, 200, {
      success: true,
      transport: 'HTTP / WEBREQUEST',
      localBridge: 'ONLINE',
      mt5Connected: isConnected,
      state: isConnected ? (effectiveMode === 'DEMO_EXECUTION' ? 'CONNECTED_DEMO_EXECUTION' : 'CONNECTED_READ_ONLY') : 'MT5_OFFLINE',
      mode: effectiveMode,
      operatingMode: effectiveMode,
      heartbeatAgeMs: ageMs,
      lastHeartbeat: bridgeState.lastHeartbeat ? new Date(bridgeState.lastHeartbeat).toISOString() : null,
      heartbeatCount: bridgeState.heartbeatCount,
      host: HOST,
      port: PORT,
      terminal: {
        ...bridgeState.terminal,
        operatingMode: effectiveMode,
      },
      account: bridgeState.account ? {
        ...bridgeState.account,
        operatingMode: effectiveMode,
      } : bridgeState.account,
      activePositionsCount: bridgeState.positions.length,
      activeOrdersCount: bridgeState.orders.length,
      quotesAvailable: Object.keys(enrichedQuotes).length,
      quotes: enrichedQuotes,
      positions: bridgeState.positions,
      orders: bridgeState.orders,
      sessions: bridgeState.sessions,
      symbols: bridgeState.symbols,
      symbolSpecs: bridgeState.symbolSpecs || [],
      specsBySymbol: bridgeState.specsBySymbol || {},
    });
  }

  // =========================================================================
  // 9. POST /api/command (Command Dispatcher for Next.js)
  // =========================================================================
  if (req.method === 'POST' && (urlPath === '/api/command' || urlPath === '/command')) {
    const command = body.command || 'PING';
    const params = body.params || {};
    const reqId = body.reqId || params.requestId || params.reqId || body.requestId || `cmd-${Date.now()}`;

    // STRICT DEFENSE-IN-DEPTH SAFETY GATE: LIVE EXECUTION HARD LOCK
    if (body.mode === 'LIVE' || body.operatingMode === 'LIVE' || body.liveTrading === true || params.tradeMode === 'REAL' || params.liveTrading === true) {
      return sendJson(res, 200, {
        reqId,
        command,
        success: false,
        state: 'LOCKED',
        error: {
          code: 'LIVE_EXECUTION_LOCKED',
          message: 'Live-money execution is strictly disabled and locked in Phase 35.'
        },
        timestamp: Date.now()
      });
    }

    // Other mutating commands remain strictly rejected in Phase 35
    const STRICTLY_DISALLOWED_COMMANDS = [
      'MODIFY_ORDER',
      'CANCEL_ORDER',
      'CLOSE_POSITION',
      'CLOSE_ALL',
      'DELETE_ORDER'
    ];

    if (STRICTLY_DISALLOWED_COMMANDS.includes(command)) {
      return sendJson(res, 200, {
        reqId,
        command,
        success: false,
        state: 'CONNECTED_READ_ONLY',
        error: {
          code: 'READ_ONLY_LOCK_ACTIVE',
          message: `Write action '${command}' rejected: Only controlled DEMO PLACE_ORDER is supported in Phase 35.`
        },
        timestamp: Date.now(),
      });
    }

    if (command === 'PLACE_ORDER') {
      // 1. MT5 connection & heartbeat freshness (fail-safe)
      if (!isHeartbeatFresh()) {
        bridgeState.operatingMode = 'READ_ONLY';
        bridgeState.account.operatingMode = 'READ_ONLY';
        return sendJson(res, 200, {
          reqId,
          command: 'PLACE_ORDER',
          success: false,
          state: 'MT5_OFFLINE',
          error: {
            code: bridgeState.lastHeartbeat ? 'STALE_HEARTBEAT' : 'MT5_OFFLINE',
            message: 'MT5 terminal is disconnected or heartbeat is stale. Demo execution blocked.'
          },
          timestamp: Date.now(),
        });
      }

      // 2. Demo account verification requirement
      if (bridgeState.account && bridgeState.account.tradeMode !== 'DEMO') {
        bridgeState.operatingMode = 'READ_ONLY';
        bridgeState.account.operatingMode = 'READ_ONLY';
        return sendJson(res, 200, {
          reqId,
          command: 'PLACE_ORDER',
          success: false,
          state: 'REJECTED',
          error: {
            code: 'NOT_DEMO_ACCOUNT',
            message: 'Execution rejected: Connected MT5 account is not verified as a DEMO account.'
          },
          timestamp: Date.now(),
        });
      }

      // 3. Canonical operating mode check: MUST be DEMO_EXECUTION
      const authMode = getAuthoritativeOperatingMode();
      if (authMode !== 'DEMO_EXECUTION') {
        bridgeState.operatingMode = authMode;
        if (bridgeState.account) bridgeState.account.operatingMode = authMode;
        return sendJson(res, 200, {
          reqId,
          command: 'PLACE_ORDER',
          success: false,
          state: 'CONNECTED_READ_ONLY',
          error: {
            code: 'READ_ONLY_LOCK_ACTIVE',
            message: "Write action 'PLACE_ORDER' rejected: FEF MT5 Bridge is in READ_ONLY mode. EA must report DEMO_EXECUTION on a verified DEMO account."
          },
          timestamp: Date.now(),
        });
      }

      // 4. Duplicate request ID check (Idempotency)
      if (executedRequestIds.has(reqId)) {
        return sendJson(res, 200, {
          reqId,
          command: 'PLACE_ORDER',
          success: false,
          state: 'REJECTED',
          error: {
            code: 'DUPLICATE_EXECUTION_REQUEST',
            message: `Duplicate execution request rejected: requestId '${reqId}' has already been processed.`
          },
          timestamp: Date.now(),
        });
      }

      const sym = params.brokerSymbol || params.symbol || body.brokerSymbol || body.symbol || 'XAUUSD';
      const volume = Number(params.volume ?? params.lots ?? body.volume ?? body.lots ?? 0);
      const direction = String(params.direction || params.orderType || body.direction || body.orderType || 'BUY').toUpperCase();
      const sl = Number(params.sl ?? params.stopLoss ?? body.sl ?? body.stopLoss ?? 0);
      const tp = Number(params.tp ?? params.takeProfit ?? body.tp ?? body.takeProfit ?? 0);

      // 5. Volume validation
      if (volume <= 0 || isNaN(volume)) {
        return sendJson(res, 200, {
          reqId,
          command: 'PLACE_ORDER',
          success: false,
          state: 'REJECTED',
          error: {
            code: 'INVALID_VOLUME',
            message: 'Order rejected: lot size must be greater than 0.'
          },
          timestamp: Date.now(),
        });
      }
      if (volume > 20.0) {
        return sendJson(res, 200, {
          reqId,
          command: 'PLACE_ORDER',
          success: false,
          state: 'REJECTED',
          error: {
            code: 'MAX_VOLUME_EXCEEDED',
            message: `Order rejected: lot size ${volume} exceeds max permitted lot size of 20.0 under Risk Guardian.`
          },
          timestamp: Date.now(),
        });
      }
      const stepCheck = Math.round(volume * 100);
      if (Math.abs(volume * 100 - stepCheck) > 0.0001) {
        return sendJson(res, 200, {
          reqId,
          command: 'PLACE_ORDER',
          success: false,
          state: 'REJECTED',
          error: {
            code: 'INVALID_VOLUME_STEP',
            message: `Order rejected: lot size ${volume} does not align with 0.01 lot step.`
          },
          timestamp: Date.now(),
        });
      }

      // 6. Stop Loss required under institutional policy
      if (sl <= 0 || isNaN(sl)) {
        return sendJson(res, 200, {
          reqId,
          command: 'PLACE_ORDER',
          success: false,
          state: 'REJECTED',
          error: {
            code: 'INVALID_SL',
            message: 'Order rejected: valid non-zero Stop Loss is mandatory under Risk Guardian policy.'
          },
          timestamp: Date.now(),
        });
      }

      // 7. Quote validation & freshness
      const rawQuote = bridgeState.quotes[sym] || bridgeState.quotes[body.symbol || ''] || null;
      if (!rawQuote) {
        return sendJson(res, 200, {
          reqId,
          command: 'PLACE_ORDER',
          success: false,
          state: 'REJECTED',
          error: {
            code: 'QUOTE_UNAVAILABLE',
            message: `Order rejected: No broker quote available for ${sym}.`
          },
          timestamp: Date.now(),
        });
      }

      const evalResult = evaluateQuoteFreshness(sym, rawQuote, Date.now());
      if (evalResult.freshness === 'SESSION_CLOSED') {
        return sendJson(res, 200, {
          reqId,
          command: 'PLACE_ORDER',
          success: false,
          state: 'REJECTED',
          error: {
            code: 'SESSION_CLOSED',
            message: `Order rejected: Market session for ${sym} is currently closed.`
          },
          timestamp: Date.now(),
        });
      }

      if (evalResult.freshness === 'STALE' || evalResult.isStale) {
        return sendJson(res, 200, {
          reqId,
          command: 'PLACE_ORDER',
          success: false,
          state: 'REJECTED',
          error: {
            code: 'STALE_QUOTE',
            message: `Order rejected: broker quote for ${sym} is stale (${Math.round(evalResult.ageMs / 1000)}s old). Fresh live quote is strictly required.`
          },
          timestamp: Date.now(),
        });
      }

      if (rawQuote.spread > 50) {
        return sendJson(res, 200, {
          reqId,
          command: 'PLACE_ORDER',
          success: false,
          state: 'REJECTED',
          error: {
            code: 'WIDE_SPREAD',
            message: `Order rejected: broker spread (${rawQuote.spread} pips) exceeds maximum threshold.`
          },
          timestamp: Date.now(),
        });
      }

      // 8. Free margin check
      const estPrice = rawQuote ? rawQuote.ask : (Number(params.price || body.price) || 2650);
      const estMarginRequired = (volume * 100 * estPrice) / 500;
      if (bridgeState.account.freeMargin < estMarginRequired || (bridgeState.account.freeMargin > 0 && bridgeState.account.freeMargin < 20)) {
        return sendJson(res, 200, {
          reqId,
          command: 'PLACE_ORDER',
          success: false,
          state: 'REJECTED',
          error: {
            code: 'INSUFFICIENT_MARGIN',
            message: `Order rejected: estimated required margin ($${estMarginRequired.toFixed(2)}) exceeds free margin ($${bridgeState.account.freeMargin.toFixed(2)}).`
          },
          timestamp: Date.now(),
        });
      }

      // Queue order for EA dispatch
      const orderPayload = {
        requestId: reqId,
        symbol: sym,
        canonicalSymbol: params.canonicalSymbol || body.symbol || sym,
        brokerSymbol: sym,
        direction,
        orderType: direction === 'BUY' ? 'MARKET_BUY' : 'MARKET_SELL',
        volume,
        entryReference: Number(params.entryReference || body.price || (rawQuote ? rawQuote.bid : 0)),
        stopLoss: sl,
        takeProfit: tp,
        magic: Number(params.magic || bridgeState.terminal.magic || 8882026),
        comment: String(params.comment || 'FEF Demo Order'),
        timestamp: Date.now()
      };

      pendingOrdersQueue.push(orderPayload);

      // Await EA execution result via Promise (5000ms timeout)
      const timeoutMs = 5000;
      const executionPromise = new Promise((resolve) => {
        const timer = setTimeout(() => {
          orderWaiters.delete(reqId);
          resolve({
            success: false,
            error: {
              code: 'EXECUTION_TIMEOUT',
              message: `Demo order dispatch timed out after ${timeoutMs}ms awaiting MT5 EA fill.`
            }
          });
        }, timeoutMs);

        orderWaiters.set(reqId, { resolve, timer });
      });

      const execResult = await executionPromise;
      if (!execResult.success) {
        return sendJson(res, 200, {
          reqId,
          command: 'PLACE_ORDER',
          success: false,
          state: 'REJECTED',
          error: execResult.error || {
            code: 'BROKER_REJECTED',
            message: 'Demo order rejected by broker.'
          },
          timestamp: Date.now(),
        });
      }

      return sendJson(res, 200, {
        reqId,
        command: 'PLACE_ORDER',
        success: true,
        state: 'CONNECTED_DEMO_EXECUTION',
        data: execResult,
        timestamp: Date.now(),
      });
    }

    const isConnected = isHeartbeatFresh();
    const authMode = getAuthoritativeOperatingMode();
    bridgeState.operatingMode = authMode;
    if (bridgeState.account) bridgeState.account.operatingMode = authMode;

    if (command === 'PING') {
      return sendJson(res, 200, {
        reqId,
        command: 'PING',
        success: true,
        state: isConnected ? (authMode === 'DEMO_EXECUTION' ? 'CONNECTED_DEMO_EXECUTION' : 'CONNECTED_READ_ONLY') : 'MT5_OFFLINE',
        data: {
          status: 'PONG',
          transport: 'HTTP / WEBREQUEST',
          localBridge: 'ONLINE',
          mt5Connected: isConnected,
          operatingMode: authMode,
          heartbeatAgeMs: bridgeState.lastHeartbeat ? Date.now() - bridgeState.lastHeartbeat : null,
          terminalBuild: bridgeState.terminal.build,
          serverTime: new Date().toISOString(),
          magicNumber: bridgeState.terminal.magic,
        },
        timestamp: Date.now(),
      });
    }

    if (command === 'GET_TERMINAL_STATUS') {
      return sendJson(res, 200, {
        reqId,
        command: 'GET_TERMINAL_STATUS',
        success: true,
        state: isConnected ? (authMode === 'DEMO_EXECUTION' ? 'CONNECTED_DEMO_EXECUTION' : 'CONNECTED_READ_ONLY') : 'MT5_OFFLINE',
        data: {
          terminalConnected: bridgeState.terminal.terminalConnected,
          brokerConnected: isConnected && bridgeState.terminal.terminalConnected,
          brokerName: bridgeState.terminal.broker,
          brokerServer: bridgeState.terminal.server,
          terminalBuild: bridgeState.terminal.build,
          tradeAllowed: bridgeState.account.tradeAllowed,
          tradeExpert: true,
          pingToBrokerMs: 12,
          bridgeVersion: '1.2.0-HTTP',
          transport: 'HTTP / WEBREQUEST',
          operatingMode: authMode,
          heartbeatAgeMs: bridgeState.lastHeartbeat ? Date.now() - bridgeState.lastHeartbeat : null,
          lastHeartbeat: bridgeState.lastHeartbeat ? new Date(bridgeState.lastHeartbeat).toISOString() : null,
        },
        timestamp: Date.now(),
      });
    }

    if (command === 'GET_ACCOUNT') {
      if (bridgeState.account) {
        bridgeState.account.operatingMode = authMode;
      }
      return sendJson(res, 200, {
        reqId,
        command: 'GET_ACCOUNT',
        success: true,
        state: isConnected ? (authMode === 'DEMO_EXECUTION' ? 'CONNECTED_DEMO_EXECUTION' : 'CONNECTED_READ_ONLY') : 'MT5_OFFLINE',
        data: bridgeState.account,
        timestamp: Date.now(),
      });
    }

    if (command === 'GET_QUOTE') {
      const sym = body.symbol || 'XAUUSD';
      const rawQuote = bridgeState.quotes[sym] || null;
      if (!rawQuote) {
        return sendJson(res, 200, {
          reqId,
          command: 'GET_QUOTE',
          success: false,
          state: isConnected ? (authMode === 'DEMO_EXECUTION' ? 'CONNECTED_DEMO_EXECUTION' : 'CONNECTED_READ_ONLY') : 'MT5_OFFLINE',
          error: {
            code: 'QUOTE_NOT_AVAILABLE',
            message: `No active quote pushed for symbol ${sym}`,
          },
          timestamp: Date.now(),
        });
      }

      const evalResult = evaluateQuoteFreshness(rawQuote.canonicalSymbol || sym, rawQuote, Date.now());
      const enriched = {
        ...rawQuote,
        freshness: evalResult.freshness,
        isStale: evalResult.isStale,
        ageMs: evalResult.ageMs,
        freshnessReason: evalResult.reason,
      };

      return sendJson(res, 200, {
        reqId,
        command: 'GET_QUOTE',
        success: true,
        state: isConnected ? (authMode === 'DEMO_EXECUTION' ? 'CONNECTED_DEMO_EXECUTION' : 'CONNECTED_READ_ONLY') : 'MT5_OFFLINE',
        data: enriched,
        timestamp: Date.now(),
      });
    }

    if (command === 'GET_POSITIONS') {
      return sendJson(res, 200, {
        reqId,
        command: 'GET_POSITIONS',
        success: true,
        state: isConnected ? 'CONNECTED_READ_ONLY' : 'MT5_OFFLINE',
        data: { positions: bridgeState.positions },
        timestamp: Date.now(),
      });
    }

    if (command === 'GET_PENDING_ORDERS') {
      return sendJson(res, 200, {
        reqId,
        command: 'GET_PENDING_ORDERS',
        success: true,
        state: isConnected ? 'CONNECTED_READ_ONLY' : 'MT5_OFFLINE',
        data: { orders: bridgeState.orders },
        timestamp: Date.now(),
      });
    }

    if (command === 'GET_SYMBOLS') {
      return sendJson(res, 200, {
        reqId,
        command: 'GET_SYMBOLS',
        success: true,
        state: isConnected ? 'CONNECTED_READ_ONLY' : 'MT5_OFFLINE',
        data: {
          symbols: bridgeState.symbols,
          symbolSpecs: bridgeState.symbolSpecs || [],
          specsBySymbol: bridgeState.specsBySymbol || {}
        },
        timestamp: Date.now(),
      });
    }

    if (command === 'GET_SYMBOL_INFO') {
      const sym = body.symbol || params.symbol || '';
      const spec = bridgeState.specsBySymbol ? bridgeState.specsBySymbol[sym] : null;
      return sendJson(res, 200, {
        reqId,
        command: 'GET_SYMBOL_INFO',
        success: true,
        state: isConnected ? 'CONNECTED_READ_ONLY' : 'MT5_OFFLINE',
        data: spec || null,
        timestamp: Date.now(),
      });
    }

    if (command === 'GET_BROKER_SESSIONS') {
      const sym = body.symbol || 'XAUUSD';
      const session = bridgeState.sessions[sym] || {
        brokerSymbol: sym,
        tradeMode: 'FULL',
        sessionStart: '00:00:00',
        sessionEnd: '23:59:59',
        serverTime: new Date().toISOString(),
        marketAvailable: true,
      };
      return sendJson(res, 200, {
        reqId,
        command: 'GET_BROKER_SESSIONS',
        success: true,
        state: isConnected ? 'CONNECTED_READ_ONLY' : 'MT5_OFFLINE',
        data: session,
        timestamp: Date.now(),
      });
    }

    return sendJson(res, 200, {
      reqId,
      command,
      success: false,
      error: { code: 'UNKNOWN_COMMAND', message: `Unknown command '${command}'` },
      timestamp: Date.now(),
    });
  }

  // Fallback 404
  return sendJson(res, 404, {
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${urlPath} not found` },
  });
}

// Create HTTP Server
const server = http.createServer(handleHttpRequest);

// Start Server strictly binding to 127.0.0.1
if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log('====================================================');
    console.log('FEF MT5 HTTP BRIDGE ONLINE');
    console.log(`Listening on ${HOST}:${PORT}`);
    console.log('Mode: READ_ONLY (SAFE STARTUP DEFAULT)');
    console.log('Auth: ENABLED');
    console.log('Waiting for FEF_HTTP_Bridge.mq5');
    console.log('====================================================');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`✕ ERROR: Port ${PORT} is already in use on ${HOST}!`);
    } else {
      console.error('✕ HTTP Bridge Server Error:', err);
    }
    process.exit(1);
  });
}

function setOperatingMode(mode) {
  if (mode === 'LIVE' || mode === 'LIVE_EXECUTION') {
    throw new Error('LIVE_EXECUTION_LOCKED: Live trading is strictly disabled and locked.');
  }
  if (mode === 'READ_ONLY' || mode === 'DEMO_EXECUTION') {
    bridgeState.operatingMode = mode;
    bridgeState.account.operatingMode = mode;
  }
}

module.exports = {
  server,
  handleHttpRequest,
  bridgeState,
  PORT,
  HOST,
  VALID_TOKEN,
  HEARTBEAT_TIMEOUT_MS,
  maskAccount,
  isAuthorized,
  isHeartbeatFresh,
  executedRequestIds,
  pendingOrdersQueue,
  orderWaiters,
  setOperatingMode,
  getAuthoritativeOperatingMode,
  isMarketSessionOpen,
  evaluateQuoteFreshness,
};
