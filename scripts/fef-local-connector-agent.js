#!/usr/bin/env node
/**
 * FEF TRADING SOLUTIONS — OUTBOUND LOCAL MT5 CONNECTOR AGENT
 * 
 * Runs locally on the user's workstation alongside MetaTrader 5:
 * 1. Connects strictly OUTBOUND to the FEF Secure Remote Relay via WSS.
 * 2. Opens NO public inbound listening ports (Zero attack surface).
 * 3. Polls the local MT5 bridge (127.0.0.1:5556) for live telemetry.
 * 4. Pushes authenticated snapshots to the cloud control plane.
 * 5. Reconnects automatically and safely on network interruption.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

// Load .env.local if present
const envLocalPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, 'utf8');
  content.split('\n').forEach(line => {
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

const LOCAL_BRIDGE_URL = process.env.FEF_LOCAL_BRIDGE_URL || 'http://127.0.0.1:5556';
const LOCAL_BRIDGE_TOKEN = process.env.FEF_BRIDGE_TOKEN || 'fef_local_bridge_token_v1';
const RELAY_URL = process.env.FEF_REMOTE_RELAY_URL || 'http://127.0.0.1:5557';
const DEVICE_ID = process.env.FEF_REMOTE_DEVICE_ID || 'fef-connector-primary-01';
const KEY_ID = process.env.FEF_REMOTE_KEY_ID || 'key-v1-primary';
const DEVICE_SECRET = (process.env.FEF_REMOTE_DEVICE_SECRET || '').trim();
const POLL_INTERVAL_MS = 1000;

let ws = null;
let pollTimer = null;
let reconnectTimer = null;
let reconnectDelayMs = 1000;
let isConnectedToRelay = false;

function toWebSocketUrl(httpUrl) {
  const url = new URL(httpUrl);
  const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${url.host}/connector`;
}

function fetchLocalBridgeStatus() {
  return new Promise((resolve) => {
    const url = new URL('/api/status', LOCAL_BRIDGE_URL);
    const req = http.request(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${LOCAL_BRIDGE_TOKEN}`,
        'x-bridge-token': LOCAL_BRIDGE_TOKEN,
      },
      timeout: 2000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

function fetchLocalBridgeCandles(symbol = 'XAUUSD', timeframe = 'H1') {
  return new Promise((resolve) => {
    const url = new URL(`/mt5/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`, LOCAL_BRIDGE_URL);
    const req = http.request(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${LOCAL_BRIDGE_TOKEN}`,
        'x-bridge-token': LOCAL_BRIDGE_TOKEN,
      },
      timeout: 2500,
    }, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

const lastCandleFingerprint = new Map();

async function syncCandlesForTimeframe(symbol = 'XAUUSD', timeframe = 'H1', force = false) {
  if (!isConnectedToRelay || !ws || ws.readyState !== WebSocket.OPEN) return;

  const res = await fetchLocalBridgeCandles(symbol, timeframe);
  if (!res || !res.success || !Array.isArray(res.candles) || res.candles.length === 0) return;

  const lastCandle = res.candles[res.candles.length - 1];
  const fp = `${lastCandle.timestamp}:${lastCandle.close}:${res.candles.length}`;
  const key = `${symbol}:${timeframe}`;

  if (!force && lastCandleFingerprint.get(key) === fp) {
    return; // Deduplicated
  }

  lastCandleFingerprint.set(key, fp);

  const payload = {
    deviceId: DEVICE_ID,
    broker: 'Exness Technologies Ltd',
    server: 'Exness-MT5Trial16',
    symbol,
    timeframe,
    candles: res.candles,
    generatedAt: Date.now(),
    sourceTimestamp: res.updatedAt || Date.now(),
    schemaVersion: '1.0',
  };

  try {
    ws.send(JSON.stringify({
      type: 'CANDLES_SNAPSHOT',
      payload,
    }));
  } catch (err) {
    console.error(`[FEF-CONNECTOR] Error sending ${symbol} ${timeframe} candles:`, err.message);
  }
}

async function syncAllCandles(force = false) {
  const symbols = ['XAUUSD', 'EURUSD', 'BTCUSD', 'US100', 'USOIL'];
  const tfs = ['M5', 'M15', 'H1', 'H4', 'D1'];
  for (const sym of symbols) {
    for (const tf of tfs) {
      await syncCandlesForTimeframe(sym, tf, force);
    }
  }
}

function dispatchLocalBridgeCommand(payload) {
  return new Promise((resolve) => {
    const url = new URL('/api/command', LOCAL_BRIDGE_URL);
    const bodyStr = JSON.stringify(payload);
    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        'Authorization': `Bearer ${LOCAL_BRIDGE_TOKEN}`,
        'x-bridge-token': LOCAL_BRIDGE_TOKEN,
      },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ success: false, error: { code: 'PARSE_ERROR', message: 'Failed to parse bridge response.' } });
        }
      });
    });

    req.on('error', (err) => resolve({ success: false, error: { code: 'BRIDGE_REQUEST_FAILED', message: err.message } }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: { code: 'BRIDGE_TIMEOUT', message: 'Local bridge timed out.' } });
    });
    req.write(bodyStr);
    req.end();
  });
}

async function registerDeviceWithRelay() {
  return new Promise((resolve) => {
    const url = new URL('/device/register', RELAY_URL);
    const payload = JSON.stringify({
      deviceId: DEVICE_ID,
      deviceName: 'Local MT5 Workstation',
      connectorVersion: '2.0.0',
      keyId: KEY_ID,
      authToken: DEVICE_SECRET,
      tradeMode: 'DEMO',
      operatingMode: 'DEMO_EXECUTION',
    });

    const isHttps = url.protocol === 'https:';
    const client = isHttps ? require('https') : require('http');

    const req = client.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 3000,
    }, (res) => {
      let raw = '';
      res.on('data', chunk => (raw += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch {
          resolve({ success: false });
        }
      });
    });

    req.on('error', () => resolve({ success: false }));
    req.write(payload);
    req.end();
  });
}

function connectToRelay() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const wsUrl = toWebSocketUrl(RELAY_URL);
  console.log(`[FEF-CONNECTOR] Initiating OUTBOUND connection to relay: ${wsUrl}`);

  ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    console.log('[FEF-CONNECTOR] Connected to relay. Authenticating device...');
    reconnectDelayMs = 1000; // Reset backoff

    // Send authentication handshake
    ws.send(JSON.stringify({
      type: 'AUTH',
      deviceId: DEVICE_ID,
      keyId: KEY_ID,
      authToken: DEVICE_SECRET,
    }));
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString('utf8'));

      if (msg.type === 'AUTH_OK') {
        isConnectedToRelay = true;
        console.log(`✓ [FEF-CONNECTOR] Authenticated with relay (Device: ${msg.publicDeviceId || DEVICE_ID})`);
        startTelemetryStream();
        // Bootstrap candle snapshot across all 5 timeframes immediately upon authentication
        syncAllCandles(true).catch((err) => {
          console.error('[FEF-CONNECTOR] Error in initial candle bootstrap:', err.message);
        });
        return;
      }

      if (msg.type === 'AUTH_FAILED') {
        console.error(`✕ [FEF-CONNECTOR] Authentication rejected by relay: ${msg.message}`);
        isConnectedToRelay = false;
        ws.close();
        return;
      }

      if (msg.type === 'TELEMETRY_ACK' || msg.type === 'HEARTBEAT_ACK') {
        // Telemetry acknowledged
        return;
      }

      if (msg.type === 'CANDLES_ACK') {
        // Candles acknowledged by relay
        return;
      }

      if (msg.type === 'CANDLES_REJECTED') {
        console.warn(`[FEF-CONNECTOR] Relay rejected candles for ${msg.symbol} ${msg.timeframe}: ${msg.message}`);
        return;
      }

      // 4. Remote Execution Command (Phase 2C Controlled Remote DEMO Execution)
      if (msg.type === 'EXECUTE_ORDER' || msg.type === 'COMMAND') {
        const cmd = msg.command;
        handleExecuteOrder(cmd);
        return;
      }
    } catch (err) {
      console.error('[FEF-CONNECTOR] Error processing message:', err.message);
    }
  });

async function handleExecuteOrder(cmd) {
  if (!cmd || !cmd.requestId) return;

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'COMMAND_ACK',
      ack: {
        requestId: cmd.requestId,
        deviceId: DEVICE_ID,
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

  console.log(`[FEF-CONNECTOR] Received remote execution command '${cmd.requestId}' for ${cmd.symbol} ${cmd.direction} ${cmd.volume} lots.`);

  // 1. Layer 3 DEMO Check: command level
  if (cmd.accountMode === 'REAL') {
    console.warn(`[FEF-CONNECTOR-SECURITY] Rejected REAL execution command '${cmd.requestId}'.`);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'COMMAND_ACK',
        ack: {
          requestId: cmd.requestId,
          deviceId: DEVICE_ID,
          status: 'REJECTED',
          success: false,
          error: { code: 'REAL_EXECUTION_LOCKED', message: 'REAL account execution strictly locked across all layers.' },
          timestamp: Date.now(),
        }
      }));
    }
    return;
  }

  // 2. Layer 3 DEMO Check: local terminal level
  const localStatus = await fetchLocalBridgeStatus();
  if (!localStatus || !localStatus.success) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'COMMAND_ACK',
        ack: {
          requestId: cmd.requestId,
          deviceId: DEVICE_ID,
          status: 'FAILED',
          success: false,
          error: { code: 'MT5_OFFLINE', message: 'Local MT5 HTTP bridge is offline or unreachable.' },
          timestamp: Date.now(),
        }
      }));
    }
    return;
  }

  if (localStatus.account && localStatus.account.tradeMode === 'REAL') {
    console.warn(`[FEF-CONNECTOR-SECURITY] Connected account is REAL. Execution locked fail-closed.`);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'COMMAND_ACK',
        ack: {
          requestId: cmd.requestId,
          deviceId: DEVICE_ID,
          status: 'REJECTED',
          success: false,
          error: { code: 'REAL_EXECUTION_LOCKED', message: 'Connected local MT5 account is a REAL account. Execution strictly prohibited.' },
          timestamp: Date.now(),
        }
      }));
    }
    return;
  }

  // 3. Mandatory Protection Validation
  if (cmd.testType !== 'ENGINEERING_DEMO_TEST') {
    if (!cmd.sl || cmd.sl <= 0) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'COMMAND_ACK',
          ack: {
            requestId: cmd.requestId,
            deviceId: DEVICE_ID,
            status: 'REJECTED',
            success: false,
            error: { code: 'MISSING_SL', message: 'Stop Loss is mandatory under institutional protection policy.' },
            timestamp: Date.now(),
          }
        }));
      }
      return;
    }

    if (!cmd.tp1 || cmd.tp1 <= 0) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'COMMAND_ACK',
          ack: {
            requestId: cmd.requestId,
            deviceId: DEVICE_ID,
            status: 'REJECTED',
            success: false,
            error: { code: 'MISSING_TP1', message: 'Take Profit 1 is mandatory under institutional protection policy.' },
            timestamp: Date.now(),
          }
        }));
      }
      return;
    }
  }

  // 4. Dispatch to Local MT5 Bridge
  const bridgePayload = {
    command: 'PLACE_ORDER',
    params: {
      requestId: cmd.requestId,
      symbol: cmd.canonicalSymbol || cmd.symbol,
      brokerSymbol: cmd.brokerSymbol || cmd.symbol,
      direction: cmd.direction,
      orderType: cmd.orderType || cmd.direction,
      volume: cmd.volume,
      price: cmd.priceBasis,
      sl: cmd.sl,
      tp: cmd.tp1 || cmd.tp,
      tp1: cmd.tp1,
      tp2: cmd.tp2,
      tp3: cmd.tp3,
      humanApproved: true,
      comment: cmd.comment || 'FEF REMOTE DEMO 2C',
      magic: cmd.magic || 8882026,
    }
  };

  const bridgeRes = await dispatchLocalBridgeCommand(bridgePayload);
  const success = Boolean(bridgeRes && bridgeRes.success);

  console.log(`[FEF-CONNECTOR] Bridge dispatch result for '${cmd.requestId}': success=${success} ticket=${bridgeRes?.ticket || bridgeRes?.data?.ticket || 'N/A'}`);

  // 5. Transmit COMMAND_ACK back to Relay
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'COMMAND_ACK',
      ack: {
        requestId: cmd.requestId,
        deviceId: DEVICE_ID,
        status: success ? 'EXECUTED' : 'FAILED',
        success,
        ticket: bridgeRes?.ticket || bridgeRes?.data?.ticket,
        deal: bridgeRes?.deal || bridgeRes?.data?.deal,
        fillPrice: bridgeRes?.fillPrice || bridgeRes?.data?.fillPrice,
        volume: cmd.volume,
        symbol: cmd.symbol,
        direction: cmd.direction,
        sl: cmd.sl,
        tp: cmd.tp1,
        retcode: bridgeRes?.retcode || bridgeRes?.data?.retcode,
        retcodeDescription: bridgeRes?.retcodeDescription || bridgeRes?.data?.retcodeDescription,
        error: bridgeRes?.error,
        timestamp: Date.now(),
      }
    }));
  }
}

  ws.on('close', (code, reason) => {
    isConnectedToRelay = false;
    stopTelemetryStream();
    console.warn(`⚠ [FEF-CONNECTOR] Disconnected from relay (Code: ${code}). Reconnecting in ${Math.round(reconnectDelayMs / 1000)}s...`);
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error(`✕ [FEF-CONNECTOR] Relay socket error: ${err.message}`);
  });
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectDelayMs = Math.min(10000, reconnectDelayMs * 1.5);
    connectToRelay();
  }, reconnectDelayMs);
}

function startTelemetryStream() {
  if (pollTimer) clearInterval(pollTimer);

  pollTimer = setInterval(async () => {
    if (!isConnectedToRelay || !ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const localStatus = await fetchLocalBridgeStatus();
    if (!localStatus || !localStatus.success) {
      // Local bridge is offline; send heartbeat indicating bridge disconnected
      ws.send(JSON.stringify({
        type: 'TELEMETRY',
        snapshot: {
          terminalConnected: false,
          bridgeConnected: false,
          heartbeatAgeMs: 99999,
          broker: 'UNKNOWN',
          server: 'UNKNOWN',
          maskedAccount: '00***00',
          tradeMode: 'DEMO',
          operatingMode: 'READ_ONLY',
          quotes: {},
          symbolSpecs: {},
          positions: [],
          pendingOrders: [],
          sessions: {},
        }
      }));
      return;
    }

    // Stream rich local bridge telemetry to relay
    const snapshot = {
      terminalConnected: Boolean(localStatus.terminal?.terminalConnected),
      bridgeConnected: localStatus.localBridge === 'ONLINE',
      heartbeatAgeMs: localStatus.lastHeartbeat ? Math.max(0, Date.now() - localStatus.lastHeartbeat) : 0,
      broker: localStatus.terminal?.broker || localStatus.account?.broker || 'Exness Technologies Ltd',
      server: localStatus.terminal?.server || localStatus.account?.server || 'Exness-MT5Trial16',
      maskedAccount: localStatus.account?.maskedLogin || '26***84',
      tradeMode: localStatus.account?.tradeMode || 'DEMO',
      operatingMode: localStatus.operatingMode || 'DEMO_EXECUTION',
      quotes: localStatus.quotes || {},
      symbolSpecs: localStatus.specsBySymbol || {},
      positions: localStatus.positions || [],
      pendingOrders: localStatus.orders || [],
      sessions: localStatus.sessions || {},
    };

    ws.send(JSON.stringify({
      type: 'TELEMETRY',
      snapshot,
    }));

    // Timeframe-aware periodic candle synchronization across priority symbols
    candleTickCount++;
    const prioritySymbols = ['XAUUSD', 'EURUSD', 'BTCUSD', 'US100', 'USOIL'];
    if (candleTickCount % 4 === 0) {
      for (const sym of prioritySymbols) {
        syncCandlesForTimeframe(sym, 'M5', false).catch(() => {});
        syncCandlesForTimeframe(sym, 'M15', false).catch(() => {});
      }
    }
    if (candleTickCount % 16 === 0) {
      for (const sym of prioritySymbols) {
        syncCandlesForTimeframe(sym, 'H1', false).catch(() => {});
        syncCandlesForTimeframe(sym, 'H4', false).catch(() => {});
        syncCandlesForTimeframe(sym, 'D1', false).catch(() => {});
      }
    }
  }, POLL_INTERVAL_MS);
}

let candleTickCount = 0;

function stopTelemetryStream() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function main() {
  if (!DEVICE_SECRET) {
    throw new Error('FEF_REMOTE_DEVICE_SECRET_REQUIRED');
  }
  console.log('================================================================');
  console.log('FEF TRADING SOLUTIONS: LOCAL OUTBOUND MT5 CONNECTOR AGENT');
  console.log('================================================================');
  console.log(`- Local MT5 Bridge: ${LOCAL_BRIDGE_URL}`);
  console.log(`- Remote Relay URL: ${RELAY_URL}`);
  console.log(`- Device ID: ${DEVICE_ID}`);
  console.log(`- Key ID: ${KEY_ID}`);
  console.log('- Transport: Outbound-Only Persistent WSS (Zero Inbound Ports)');
  console.log('================================================================\n');

  // 1. Ensure device is registered with relay
  console.log('[STEP 1] Ensuring device registration on relay...');
  const regResult = await registerDeviceWithRelay();
  if (regResult && regResult.success) {
    console.log('✓ [STEP 1] Device registered / verified on relay');
  } else {
    console.log('ℹ [STEP 1] Device registration note: Proceeding with connector handshake...');
  }

  // 2. Connect outbound to relay
  connectToRelay();
}

if (require.main === module) {
  main();
}

module.exports = {
  connectToRelay,
  fetchLocalBridgeStatus,
  registerDeviceWithRelay,
};
