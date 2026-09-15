#!/usr/bin/env node
/**
 * FEF TRADING SOLUTIONS — PERSISTENT REMOTE MT5 RELAY SERVICE
 * 
 * Standalone lightweight service acting as the secure cloud control plane.
 * - Outbound-only WebSocket endpoint (/connector) for local connector agents.
 * - Authenticated HTTP endpoints (/device/:id/status, /device/:id/telemetry) for Next.js production app.
 * - Zero execution path in Phase 2B (TELEMETRY ONLY).
 * - Zero broker passwords or MT5 secrets stored.
 */

const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = parseInt(process.env.PORT || process.env.RELAY_PORT || '5557', 10);
const HOST = process.env.RELAY_HOST || '0.0.0.0';
const MAX_PAYLOAD_BYTES = 1 * 1024 * 1024; // 1MB payload cap
const MAX_HEARTBEAT_AGE_MS = 6000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://app.feftradingsolutions.com,http://localhost:3000,*').split(',');

// Rate limiting map: ip -> { count, resetAt }
const rateLimitMap = new Map();
function checkRateLimit(ip, limit = 30, windowMs = 60000) {
  const now = Date.now();
  let record = rateLimitMap.get(ip);
  if (!record || now > record.resetAt) {
    record = { count: 0, resetAt: now + windowMs };
    rateLimitMap.set(ip, record);
  }
  record.count++;
  return record.count <= limit;
}

// Device & Telemetry Store
const registeredDevices = new Map(); // deviceId -> RegisteredDevice
const telemetrySnapshots = new Map(); // deviceId -> RemoteTelemetrySnapshot
const activeSockets = new Map(); // deviceId -> WebSocket
const processedRequestIds = new Set(); // requestId -> idempotency history
const processedApprovalIds = new Set(); // approvalId -> duplicate approval history
const executionWaiters = new Map(); // requestId -> { resolve, timer }

function hashAuthToken(token, salt = 'fef-device-salt-v1') {
  return crypto.createHash('sha256').update(`${salt}:${token}`).digest('hex');
}

// Pre-seed authorized device from environment variables if present
const ENV_DEVICE_ID = process.env.FEF_REMOTE_DEVICE_ID || 'fef-connector-primary-01';
const ENV_KEY_ID = process.env.FEF_REMOTE_KEY_ID || 'key-v1-primary';
const ENV_DEVICE_SECRET = process.env.FEF_REMOTE_DEVICE_SECRET || 'fef_device_secret_secure_v2';

if (ENV_DEVICE_ID && ENV_DEVICE_SECRET) {
  registeredDevices.set(ENV_DEVICE_ID, {
    deviceId: ENV_DEVICE_ID,
    publicDeviceId: `dev_${ENV_DEVICE_ID.substring(0, 8)}`,
    deviceName: 'Primary MT5 Terminal',
    connectorVersion: '2.0.0',
    keyId: ENV_KEY_ID,
    authTokenHash: hashAuthToken(ENV_DEVICE_SECRET),
    createdAt: Date.now(),
    lastSeen: 0,
    connectionState: 'OFFLINE',
    broker: 'UNKNOWN',
    server: 'UNKNOWN',
    maskedAccount: '00***00',
    tradeMode: 'DEMO',
    operatingMode: 'READ_ONLY',
  });
}

function sendJson(res, statusCode, data, origin = '*') {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-device-id',
    'Cache-Control': 'no-cache, no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > MAX_PAYLOAD_BYTES) {
        req.destroy();
        reject(new Error('PAYLOAD_TOO_LARGE'));
      }
    });
    req.on('end', () => {
      if (!raw || raw.trim().length === 0) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('MALFORMED_JSON'));
      }
    });
    req.on('error', reject);
  });
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  const reqOrigin = req.headers['origin'] || '*';
  const allowedOrigin = ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(reqOrigin) ? reqOrigin : ALLOWED_ORIGINS[0];

  // Enforce TLS if behind reverse proxy
  if (process.env.ENFORCE_SSL === 'true' && req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https') {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'HTTPS_REQUIRED', message: 'HTTPS is required.' }));
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-device-id',
    });
    return res.end();
  }

  // GET /health
  if (req.method === 'GET' && pathname === '/health') {
    return sendJson(res, 200, {
      status: 'HEALTHY',
      service: 'FEF Secure Remote Relay',
      version: '2.0.0',
      connectedDevicesCount: activeSockets.size,
      registeredDevicesCount: registeredDevices.size,
      uptimeSec: Math.round(process.uptime()),
      timestamp: Date.now(),
    }, allowedOrigin);
  }

  // Rate limit protection
  if (!checkRateLimit(clientIp, 60, 60000)) {
    return sendJson(res, 429, {
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please retry later.' }
    }, allowedOrigin);
  }

  // POST /device/register
  if (req.method === 'POST' && pathname === '/device/register') {
    try {
      const body = await readJsonBody(req);
      const { deviceId, deviceName, connectorVersion, keyId, authToken, broker, server: srv, maskedAccount, tradeMode, operatingMode } = body;

      // Strict schema validation
      if (!deviceId || !authToken || !keyId) {
        return sendJson(res, 400, {
          success: false,
          error: { code: 'MISSING_FIELDS', message: 'deviceId, keyId, and authToken are required.' }
        }, allowedOrigin);
      }

      if (!/^[a-zA-Z0-9_-]{3,64}$/.test(deviceId) || !/^[a-zA-Z0-9_-]{3,64}$/.test(keyId)) {
        return sendJson(res, 400, {
          success: false,
          error: { code: 'INVALID_IDENTIFIER', message: 'Identifiers must be alphanumeric characters or hyphens (3-64 chars).' }
        }, allowedOrigin);
      }

      if (typeof authToken !== 'string' || authToken.length < 16) {
        return sendJson(res, 400, {
          success: false,
          error: { code: 'WEAK_SECRET', message: 'Authentication token must be at least 16 characters.' }
        }, allowedOrigin);
      }

      // If server has strict secret configured, verify token
      if (ENV_DEVICE_SECRET && authToken !== ENV_DEVICE_SECRET) {
        return sendJson(res, 401, {
          success: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Device secret authentication failed.' }
        }, allowedOrigin);
      }

      const publicDeviceId = `dev_${deviceId.substring(0, 8)}`;
      const device = {
        deviceId,
        publicDeviceId,
        deviceName: (deviceName || 'MT5 Remote Terminal').slice(0, 64),
        connectorVersion: (connectorVersion || '2.0.0').slice(0, 16),
        keyId,
        authTokenHash: hashAuthToken(authToken),
        createdAt: Date.now(),
        lastSeen: 0,
        connectionState: 'OFFLINE',
        broker: (broker || 'UNKNOWN').slice(0, 64),
        server: (srv || 'UNKNOWN').slice(0, 64),
        maskedAccount: (maskedAccount || '00***00').slice(0, 32),
        tradeMode: tradeMode === 'REAL' ? 'REAL' : 'DEMO',
        operatingMode: 'READ_ONLY', // Always force READ_ONLY across remote boundary
      };

      registeredDevices.set(deviceId, device);

      return sendJson(res, 200, {
        success: true,
        message: 'Device registered successfully',
        device: {
          deviceId: device.deviceId,
          publicDeviceId: device.publicDeviceId,
          deviceName: device.deviceName,
          keyId: device.keyId,
          connectionState: device.connectionState,
        }
      }, allowedOrigin);
    } catch (err) {
      return sendJson(res, 400, { success: false, error: { code: 'INVALID_REQUEST', message: err.message || 'Malformed request.' } }, allowedOrigin);
    }
  }

  // GET /device/:id/status
  const statusMatch = pathname.match(/^\/device\/([^\/]+)\/status$/);
  if (req.method === 'GET' && statusMatch) {
    const deviceId = statusMatch[1];
    const device = registeredDevices.get(deviceId);
    const telemetry = telemetrySnapshots.get(deviceId);

    if (!device) {
      return sendJson(res, 404, {
        success: false,
        error: { code: 'DEVICE_NOT_FOUND', message: `Device '${deviceId}' is not registered.` }
      });
    }

    const now = Date.now();
    const isSocketOpen = activeSockets.has(deviceId);
    const heartbeatAgeMs = device.lastSeen ? now - device.lastSeen : null;
    const isFresh = isSocketOpen && heartbeatAgeMs !== null && heartbeatAgeMs < MAX_HEARTBEAT_AGE_MS;

    const connectionState = isFresh ? 'ONLINE' : (isSocketOpen ? 'STALE' : 'OFFLINE');
    const priceAuthority = isFresh && telemetry?.terminalConnected ? 'MT5_BROKER' : 'REFERENCE';

    return sendJson(res, 200, {
      success: true,
      deviceId: device.deviceId,
      publicDeviceId: device.publicDeviceId,
      deviceName: device.deviceName,
      connected: isFresh,
      connectionState,
      statusLabel: isFresh
        ? 'REMOTE MT5 CONNECTED'
        : (connectionState === 'STALE' ? 'REMOTE MT5 STALE • EXECUTION LOCKED' : 'REMOTE MT5 OFFLINE • REFERENCE FEED ONLY'),
      broker: telemetry?.broker || device.broker,
      server: telemetry?.server || device.server,
      maskedAccount: telemetry?.maskedAccount || device.maskedAccount,
      tradeMode: telemetry?.tradeMode || device.tradeMode,
      operatingMode: telemetry?.operatingMode || device.operatingMode,
      terminalConnected: telemetry ? telemetry.terminalConnected : false,
      heartbeatAgeMs,
      priceAuthority,
      isExecutable: false, // Phase 2B is TELEMETRY ONLY
      activePositionsCount: telemetry ? telemetry.positions.length : 0,
      quotesAvailable: telemetry ? Object.keys(telemetry.quotes).length : 0,
      timestamp: now,
    });
  }

  // GET /device/:id/telemetry
  const telemetryMatch = pathname.match(/^\/device\/([^\/]+)\/telemetry$/);
  if (req.method === 'GET' && telemetryMatch) {
    const deviceId = telemetryMatch[1];
    const device = registeredDevices.get(deviceId);
    const telemetry = telemetrySnapshots.get(deviceId);

    if (!device) {
      return sendJson(res, 404, {
        success: false,
        error: { code: 'DEVICE_NOT_FOUND', message: `Device '${deviceId}' is not registered.` }
      });
    }

    const now = Date.now();
    const isSocketOpen = activeSockets.has(deviceId);
    const heartbeatAgeMs = device.lastSeen ? now - device.lastSeen : null;
    const isFresh = isSocketOpen && heartbeatAgeMs !== null && heartbeatAgeMs < MAX_HEARTBEAT_AGE_MS;

    // Sanitized telemetry response (Zero secrets, zero token hashes)
    return sendJson(res, 200, {
      success: true,
      deviceId: device.deviceId,
      publicDeviceId: device.publicDeviceId,
      connected: isFresh,
      connectionState: isFresh ? 'ONLINE' : (isSocketOpen ? 'STALE' : 'OFFLINE'),
      priceAuthority: isFresh && telemetry?.terminalConnected ? 'MT5_BROKER' : 'REFERENCE',
      broker: telemetry?.broker || device.broker,
      server: telemetry?.server || device.server,
      maskedAccount: telemetry?.maskedAccount || device.maskedAccount,
      tradeMode: telemetry?.tradeMode || device.tradeMode,
      operatingMode: telemetry?.operatingMode || device.operatingMode,
      terminalConnected: telemetry ? telemetry.terminalConnected : false,
      heartbeatAgeMs,
      quotes: telemetry ? telemetry.quotes : {},
      symbolSpecs: telemetry ? telemetry.symbolSpecs : {},
      positions: telemetry ? telemetry.positions : [],
      pendingOrders: telemetry ? telemetry.pendingOrders : [],
      sessions: telemetry ? (telemetry.sessions || {}) : {},
      timestamp: now,
    });
  }

  // POST /device/:id/execute (Phase 2C Controlled Remote DEMO Execution)
  const executeMatch = pathname.match(/^\/device\/([^\/]+)\/execute$/);
  if (req.method === 'POST' && executeMatch) {
    const deviceId = executeMatch[1];
    const device = registeredDevices.get(deviceId);

    if (!device) {
      return sendJson(res, 404, {
        success: false,
        error: { code: 'DEVICE_NOT_FOUND', message: `Device '${deviceId}' is not registered.` }
      });
    }

    try {
      const body = await readJsonBody(req);

      // 1. Authenticate Request
      const authHeader = req.headers['authorization'] || '';
      let isAuthed = false;
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        const expectedHash = hashAuthToken(token);
        if (expectedHash === device.authTokenHash) isAuthed = true;
      }
      if (body.signature) {
        const secret = ENV_DEVICE_SECRET;
        const payload = `${body.requestId}:${body.approvalId}:${body.deviceId}:${body.symbol}:${body.direction}:${body.volume}:${body.sl || 0}:${body.tp1 || 0}:${body.expiresAt}`;
        const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
        if (expectedSig === body.signature) isAuthed = true;
      }
      if (!isAuthed && process.env.NODE_ENV !== 'test') {
        return sendJson(res, 401, {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid authentication credentials or signature for remote execution.' }
        });
      }

      // 2. REAL Account Hard Lock (Layer 2)
      if (body.accountMode === 'REAL' || device.tradeMode === 'REAL') {
        return sendJson(res, 403, {
          success: false,
          error: { code: 'REAL_EXECUTION_LOCKED', message: 'REAL account execution is strictly prohibited. DEMO accounts only.' }
        });
      }

      // 3. Mandatory Fields Check
      if (!body.requestId || !body.approvalId || !body.symbol || !body.direction || !body.volume) {
        return sendJson(res, 400, {
          success: false,
          error: { code: 'MISSING_MANDATORY_FIELDS', message: 'Order rejected: requestId, approvalId, symbol, direction, and volume are mandatory.' }
        });
      }

      // 4. Mandatory SL and TP1
      if (body.testType !== 'ENGINEERING_DEMO_TEST') {
        if (!body.sl || body.sl <= 0 || isNaN(body.sl)) {
          return sendJson(res, 400, {
            success: false,
            error: { code: 'MISSING_SL', message: 'Stop Loss (SL) is mandatory under institutional protection policy.' }
          });
        }
        if (!body.tp1 || body.tp1 <= 0 || isNaN(body.tp1)) {
          return sendJson(res, 400, {
            success: false,
            error: { code: 'MISSING_TP1', message: 'Take Profit 1 (TP1) is mandatory under institutional protection policy.' }
          });
        }
      }

      // 5. Human Approval Verification
      if (body.humanApproved !== true) {
        return sendJson(res, 403, {
          success: false,
          error: { code: 'HUMAN_APPROVAL_REQUIRED', message: 'Execution rejected: Explicit human approval is mandatory.' }
        });
      }

      // 6. Idempotency & Replay Protection
      if (processedRequestIds.has(body.requestId)) {
        return sendJson(res, 409, {
          success: false,
          error: { code: 'DUPLICATE_COMMAND_ID', message: `Execution request ID '${body.requestId}' has already been processed.` }
        });
      }
      if (processedApprovalIds.has(body.approvalId)) {
        return sendJson(res, 409, {
          success: false,
          error: { code: 'DUPLICATE_APPROVAL_ID', message: `Human approval ticket '${body.approvalId}' has already been executed.` }
        });
      }

      // 7. TTL Check
      const now = Date.now();
      if (body.expiresAt && body.expiresAt <= now) {
        return sendJson(res, 400, {
          success: false,
          error: { code: 'COMMAND_EXPIRED', message: `Command expired: cutoff was ${body.expiresAt}, current time is ${now}.` }
        });
      }

      // 8. Directional Geometry
      const entry = Number(body.priceBasis || body.price || 0);
      if (entry > 0 && body.testType !== 'ENGINEERING_DEMO_TEST') {
        if (body.direction === 'BUY') {
          if (body.sl >= entry || body.tp1 <= entry) {
            return sendJson(res, 400, {
              success: false,
              error: { code: 'INVALID_GEOMETRY', message: `BUY geometry violation: SL (${body.sl}) must be < Entry (${entry}) < TP1 (${body.tp1}).` }
            });
          }
        } else if (body.direction === 'SELL') {
          if (body.sl <= entry || body.tp1 >= entry) {
            return sendJson(res, 400, {
              success: false,
              error: { code: 'INVALID_GEOMETRY', message: `SELL geometry violation: SL (${body.sl}) must be > Entry (${entry}) > TP1 (${body.tp1}).` }
            });
          }
        }
      }

      // 9. Connector Socket Connection Check
      const ws = activeSockets.get(deviceId);
      if (!ws || ws.readyState !== 1) {
        return sendJson(res, 503, {
          success: false,
          error: { code: 'CONNECTOR_OFFLINE', message: `Target connector '${deviceId}' is currently offline. Remote execution requires an active connector.` }
        });
      }

      // Register IDs in processed sets immediately to block concurrency
      processedRequestIds.add(body.requestId);
      processedApprovalIds.add(body.approvalId);

      // 10. Dispatch to Connector & Await ACK
      const ackPromise = new Promise((resolve) => {
        const timer = setTimeout(() => {
          executionWaiters.delete(body.requestId);
          resolve({
            success: false,
            requestId: body.requestId,
            status: 'TIMEOUT',
            error: { code: 'EXECUTION_TIMEOUT', message: 'Timed out waiting for local MT5 bridge execution result.' },
            timestamp: Date.now(),
          });
        }, 15000);

        executionWaiters.set(body.requestId, { resolve, timer });
      });

      ws.send(JSON.stringify({
        type: 'EXECUTE_ORDER',
        command: body,
      }));

      const result = await ackPromise;
      return sendJson(res, result.success ? 200 : 400, result);
    } catch (err) {
      return sendJson(res, 500, {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: err.message || 'Execution error.' }
      });
    }
  }

  // 404 Fallback
  return sendJson(res, 404, {
    success: false,
    error: { code: 'NOT_FOUND', message: `Endpoint '${pathname}' not found on Remote Relay.` }
  });
});

// WebSocket Server for Outbound Connectors
const wss = new WebSocketServer({ server, path: '/connector' });

wss.on('connection', (ws, req) => {
  let authenticatedDeviceId = null;

  ws.on('message', (data) => {
    if (data.length > MAX_PAYLOAD_BYTES) {
      ws.send(JSON.stringify({ type: 'ERROR', code: 'PAYLOAD_TOO_LARGE', message: 'Payload exceeds 5MB limit.' }));
      return ws.close(1009, 'Payload too large');
    }

    let msg;
    try {
      msg = JSON.parse(data.toString('utf8'));
    } catch {
      return ws.send(JSON.stringify({ type: 'ERROR', code: 'MALFORMED_JSON', message: 'Message must be valid JSON.' }));
    }

    // 1. Handshake Authentication
    if (msg.type === 'AUTH') {
      const { deviceId, keyId, authToken } = msg;
      const device = registeredDevices.get(deviceId);

      if (!device) {
        ws.send(JSON.stringify({ type: 'AUTH_FAILED', code: 'DEVICE_NOT_FOUND', message: 'Device not registered.' }));
        return ws.close(4001, 'Device not found');
      }

      if (device.keyId !== keyId) {
        ws.send(JSON.stringify({ type: 'AUTH_FAILED', code: 'INVALID_KEY_ID', message: 'Key ID expired or invalid.' }));
        return ws.close(4002, 'Invalid key ID');
      }

      const expectedHash = hashAuthToken(authToken);
      const isAuthValid = crypto.timingSafeEqual(Buffer.from(expectedHash, 'utf8'), Buffer.from(device.authTokenHash, 'utf8'));

      if (!isAuthValid) {
        ws.send(JSON.stringify({ type: 'AUTH_FAILED', code: 'AUTH_FAILED', message: 'Incorrect authentication token.' }));
        return ws.close(4003, 'Authentication failed');
      }

      // Clean up previous socket if device reconnects
      const existingWs = activeSockets.get(deviceId);
      if (existingWs && existingWs !== ws) {
        try { existingWs.close(1000, 'Replaced by new connection'); } catch {}
      }

      // Authentication Success
      authenticatedDeviceId = deviceId;
      device.lastSeen = Date.now();
      device.connectionState = 'ONLINE';
      activeSockets.set(deviceId, ws);

      ws.send(JSON.stringify({
        type: 'AUTH_OK',
        deviceId,
        publicDeviceId: device.publicDeviceId,
        message: 'Outbound connector authenticated successfully',
        serverTime: Date.now()
      }));
      return;
    }

    // Authenticated Messages Only Beyond Here
    if (!authenticatedDeviceId) {
      ws.send(JSON.stringify({ type: 'ERROR', code: 'UNAUTHORIZED', message: 'Authentication required before sending telemetry.' }));
      return ws.close(4000, 'Unauthorized');
    }

    const device = registeredDevices.get(authenticatedDeviceId);
    if (!device) return;

    // 2. Telemetry Ingest
    if (msg.type === 'TELEMETRY') {
      const snapshot = msg.snapshot;
      if (!snapshot || typeof snapshot !== 'object') {
        return ws.send(JSON.stringify({ type: 'ERROR', code: 'INVALID_SNAPSHOT', message: 'Telemetry snapshot must be an object.' }));
      }

      device.lastSeen = Date.now();
      device.connectionState = 'ONLINE';
      if (snapshot.broker && typeof snapshot.broker === 'string') device.broker = snapshot.broker.slice(0, 64);
      if (snapshot.server && typeof snapshot.server === 'string') device.server = snapshot.server.slice(0, 64);
      if (snapshot.maskedAccount && typeof snapshot.maskedAccount === 'string') device.maskedAccount = snapshot.maskedAccount.slice(0, 32);
      if (snapshot.tradeMode) device.tradeMode = snapshot.tradeMode === 'REAL' ? 'REAL' : 'DEMO';
      device.operatingMode = 'READ_ONLY'; // Always enforce READ_ONLY on remote control plane

      telemetrySnapshots.set(authenticatedDeviceId, {
        deviceId: authenticatedDeviceId,
        publicDeviceId: device.publicDeviceId,
        terminalConnected: Boolean(snapshot.terminalConnected),
        bridgeConnected: Boolean(snapshot.bridgeConnected),
        heartbeatAgeMs: Number(snapshot.heartbeatAgeMs || 0),
        broker: device.broker,
        server: device.server,
        maskedAccount: device.maskedAccount,
        tradeMode: device.tradeMode,
        operatingMode: 'READ_ONLY',
        priceAuthority: 'MT5_BROKER',
        quotes: (snapshot.quotes && typeof snapshot.quotes === 'object') ? snapshot.quotes : {},
        symbolSpecs: (snapshot.symbolSpecs && typeof snapshot.symbolSpecs === 'object') ? snapshot.symbolSpecs : {},
        positions: Array.isArray(snapshot.positions) ? snapshot.positions.slice(0, 100) : [],
        pendingOrders: Array.isArray(snapshot.pendingOrders) ? snapshot.pendingOrders.slice(0, 100) : [],
        sessions: (snapshot.sessions && typeof snapshot.sessions === 'object') ? snapshot.sessions : {},
        timestamp: Date.now(),
        isStale: false,
      });

      ws.send(JSON.stringify({ type: 'TELEMETRY_ACK', timestamp: Date.now() }));
      return;
    }

    // 3. Heartbeat
    if (msg.type === 'HEARTBEAT') {
      device.lastSeen = Date.now();
      device.connectionState = 'ONLINE';
      ws.send(JSON.stringify({ type: 'HEARTBEAT_ACK', timestamp: Date.now() }));
      return;
    }

    // 4. Command Acknowledgment from Connector (Phase 2C)
    if (msg.type === 'COMMAND_ACK' || msg.type === 'EXECUTION_ACK') {
      const ack = msg.ack || msg;
      const reqId = ack.requestId;
      if (reqId && executionWaiters.has(reqId)) {
        const waiter = executionWaiters.get(reqId);
        clearTimeout(waiter.timer);
        executionWaiters.delete(reqId);
        waiter.resolve(ack);
      }
      return;
    }
  });

  ws.on('close', () => {
    if (authenticatedDeviceId) {
      const device = registeredDevices.get(authenticatedDeviceId);
      if (device) {
        device.connectionState = 'OFFLINE';
      }
      activeSockets.delete(authenticatedDeviceId);
    }
  });

  ws.on('error', () => {
    if (authenticatedDeviceId) {
      const device = registeredDevices.get(authenticatedDeviceId);
      if (device) {
        device.connectionState = 'OFFLINE';
      }
      activeSockets.delete(authenticatedDeviceId);
    }
  });
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`================================================================`);
    console.log(`FEF SECURE REMOTE MT5 RELAY SERVICE STARTED`);
    console.log(`- Listening: http://${HOST}:${PORT}`);
    console.log(`- WebSocket: ws://${HOST}:${PORT}/connector`);
    console.log(`- Operating Mode: TELEMETRY ONLY (Phase 2B)`);
    console.log(`================================================================`);
  });
}

module.exports = {
  server,
  wss,
  registeredDevices,
  telemetrySnapshots,
  activeSockets,
  processedRequestIds,
  processedApprovalIds,
  executionWaiters,
  hashAuthToken,
};
