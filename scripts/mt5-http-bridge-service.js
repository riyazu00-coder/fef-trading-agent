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

// In-Memory Telemetry State
const bridgeState = {
  serviceStartedAt: Date.now(),
  lastHeartbeat: 0,
  heartbeatCount: 0,
  mt5Connected: false,
  operatingMode: 'READ_ONLY',
  transport: 'HTTP / WEBREQUEST',
  terminal: {
    build: 0,
    broker: 'Exness',
    server: 'Exness-Real',
    accountLogin: '00***00',
    currency: 'USD',
    magic: 8882026,
    terminalConnected: false,
  },
  account: {
    maskedLogin: '00***00',
    broker: 'Exness',
    server: 'Exness-Real',
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

    if (bridgeState.heartbeatCount % 30 === 1) {
      console.log(`[FEF-HTTP] MT5 heartbeat received from ${bridgeState.terminal.broker} build ${bridgeState.terminal.build} (${bridgeState.terminal.accountLogin})`);
    }

    return sendJson(res, 200, {
      success: true,
      state: 'CONNECTED_READ_ONLY',
      serverTime: new Date().toISOString(),
      mode: 'READ_ONLY',
      heartbeatCount: bridgeState.heartbeatCount,
    });
  }

  // =========================================================================
  // 2. POST /mt5/account (From FEF_HTTP_Bridge.mq5)
  // =========================================================================
  if (req.method === 'POST' && urlPath === '/mt5/account') {
    bridgeState.account = {
      maskedLogin: maskAccount(body.maskedLogin),
      broker: body.broker || bridgeState.terminal.broker,
      server: body.server || bridgeState.terminal.server,
      currency: body.currency || bridgeState.terminal.currency,
      tradeMode: body.tradeMode || 'DEMO',
      balance: Number(body.balance || 0),
      equity: Number(body.equity || 0),
      margin: Number(body.margin || 0),
      freeMargin: Number(body.freeMargin || 0),
      marginLevel: Number(body.marginLevel || 0),
      leverage: Number(body.leverage || 100),
      tradeAllowed: Boolean(body.tradeAllowed),
      terminalBuild: Number(body.terminalBuild || bridgeState.terminal.build),
      operatingMode: 'READ_ONLY',
      lastUpdated: Date.now(),
    };

    return sendJson(res, 200, { success: true, stored: 'account' });
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
        bridgeState.quotes[canonical] = {
          canonicalSymbol: canonical,
          brokerSymbol: q.brokerSymbol || canonical,
          bid: Number(q.bid || 0),
          ask: Number(q.ask || 0),
          spread: Number(q.spread || 0),
          digits: Number(q.digits || 2),
          point: Number(q.point || 0.01),
          time: q.time || new Date().toISOString(),
          timestamp: q.timestamp || now,
          freshness: 'FRESH',
        };
        if (q.brokerSymbol) {
          bridgeState.quotes[q.brokerSymbol] = bridgeState.quotes[canonical];
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
  // 6. POST /mt5/symbols (From FEF_HTTP_Bridge.mq5)
  // =========================================================================
  if (req.method === 'POST' && urlPath === '/mt5/symbols') {
    if (Array.isArray(body.symbols)) {
      bridgeState.symbols = body.symbols;
    }
    return sendJson(res, 200, { success: true, symbolsCount: bridgeState.symbols.length });
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

    return sendJson(res, 200, {
      success: true,
      transport: 'HTTP / WEBREQUEST',
      localBridge: 'ONLINE',
      mt5Connected: isConnected,
      state: isConnected ? 'CONNECTED_READ_ONLY' : 'MT5_OFFLINE',
      mode: 'READ_ONLY',
      heartbeatAgeMs: ageMs,
      lastHeartbeat: bridgeState.lastHeartbeat ? new Date(bridgeState.lastHeartbeat).toISOString() : null,
      heartbeatCount: bridgeState.heartbeatCount,
      host: HOST,
      port: PORT,
      terminal: bridgeState.terminal,
      account: bridgeState.account,
      activePositionsCount: bridgeState.positions.length,
      activeOrdersCount: bridgeState.orders.length,
      quotesAvailable: Object.keys(bridgeState.quotes).length,
      quotes: bridgeState.quotes,
      positions: bridgeState.positions,
      orders: bridgeState.orders,
      sessions: bridgeState.sessions,
      symbols: bridgeState.symbols,
    });
  }

  // =========================================================================
  // 9. POST /api/command (Command Dispatcher for Next.js)
  // =========================================================================
  if (req.method === 'POST' && (urlPath === '/api/command' || urlPath === '/command')) {
    const command = body.command || 'PING';
    const reqId = body.reqId || `cmd-${Date.now()}`;

    // STRICT DEFENSE-IN-DEPTH SAFETY GATE: REJECT ALL MUTATING COMMANDS
    const RESTRICTED_EXECUTION_COMMANDS = [
      'PLACE_ORDER',
      'MODIFY_ORDER',
      'CANCEL_ORDER',
      'CLOSE_POSITION',
      'CLOSE_ALL',
      'DELETE_ORDER'
    ];

    if (RESTRICTED_EXECUTION_COMMANDS.includes(command)) {
      return sendJson(res, 200, {
        reqId,
        command,
        success: false,
        state: 'CONNECTED_READ_ONLY',
        error: {
          code: 'READ_ONLY_LOCK_ACTIVE',
          message: `Write action '${command}' rejected: FEF MT5 Bridge is locked in READ_ONLY safety mode. Real execution is blocked.`
        },
        timestamp: Date.now(),
      });
    }

    const isConnected = isHeartbeatFresh();

    if (command === 'PING') {
      return sendJson(res, 200, {
        reqId,
        command: 'PING',
        success: true,
        state: isConnected ? 'CONNECTED_READ_ONLY' : 'MT5_OFFLINE',
        data: {
          status: 'PONG',
          transport: 'HTTP / WEBREQUEST',
          localBridge: 'ONLINE',
          mt5Connected: isConnected,
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
        state: isConnected ? 'CONNECTED_READ_ONLY' : 'MT5_OFFLINE',
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
          operatingMode: 'READ_ONLY',
          heartbeatAgeMs: bridgeState.lastHeartbeat ? Date.now() - bridgeState.lastHeartbeat : null,
          lastHeartbeat: bridgeState.lastHeartbeat ? new Date(bridgeState.lastHeartbeat).toISOString() : null,
        },
        timestamp: Date.now(),
      });
    }

    if (command === 'GET_ACCOUNT') {
      return sendJson(res, 200, {
        reqId,
        command: 'GET_ACCOUNT',
        success: true,
        state: isConnected ? 'CONNECTED_READ_ONLY' : 'MT5_OFFLINE',
        data: bridgeState.account,
        timestamp: Date.now(),
      });
    }

    if (command === 'GET_QUOTE') {
      const sym = body.symbol || 'XAUUSD';
      const quote = bridgeState.quotes[sym] || null;
      if (!quote) {
        return sendJson(res, 200, {
          reqId,
          command: 'GET_QUOTE',
          success: false,
          state: isConnected ? 'CONNECTED_READ_ONLY' : 'MT5_OFFLINE',
          error: {
            code: 'QUOTE_NOT_AVAILABLE',
            message: `No active quote pushed for symbol ${sym}`,
          },
          timestamp: Date.now(),
        });
      }
      return sendJson(res, 200, {
        reqId,
        command: 'GET_QUOTE',
        success: true,
        state: isConnected ? 'CONNECTED_READ_ONLY' : 'MT5_OFFLINE',
        data: quote,
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
        data: { symbols: bridgeState.symbols },
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
    console.log('Mode: READ_ONLY');
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
};
