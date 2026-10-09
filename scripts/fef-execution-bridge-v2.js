#!/usr/bin/env node
/**
 * FEF CORTEX — EXECUTION BRIDGE V2 SERVICE
 * Master Consolidation V2: Clean Protocol Separation, Explicit Envelopes, Fail-Closed Security
 *
 * Runs on Port 5560 (BRIDGE_V2_PORT) alongside the legacy bridge.
 * REAL / LIVE execution is strictly HARD-LOCKED.
 */

const http = require('http');
const url = require('url');

const PORT = parseInt(process.env.BRIDGE_V2_PORT || '5560', 10);
const HOST = process.env.BRIDGE_V2_HOST || '0.0.0.0';

// Global Storage
const executionRecords = new Map(); // executionId -> record
const commandQueue = []; // Array of executionId
const specRegistry = new Map(); // symbol -> spec
const quotesRegistry = new Map(); // symbol -> quote
const positionsRegistry = new Map(); // ticket -> position
let latestAccount = null;
let lastTerminalPollAt = null;
let isTerminalConnected = false;
const startTime = Date.now();

// State Machine Transitions
const ALLOWED_TRANSITIONS = {
  CREATED: new Set(['VALIDATED', 'REJECTED']),
  VALIDATED: new Set(['QUEUED', 'REJECTED']),
  QUEUED: new Set(['DELIVERED_TO_EA', 'EXPIRED', 'REJECTED']),
  DELIVERED_TO_EA: new Set(['ACKNOWLEDGED', 'EXPIRED', 'REJECTED']),
  ACKNOWLEDGED: new Set(['SUBMITTED_TO_BROKER', 'REJECTED', 'EXPIRED']),
  SUBMITTED_TO_BROKER: new Set(['FILLED', 'REJECTED', 'EXPIRED']),
  FILLED: new Set(),
  REJECTED: new Set(),
  EXPIRED: new Set(),
};

function transitionState(record, toState, reason, metadata) {
  const fromState = record.currentState;
  const allowed = ALLOWED_TRANSITIONS[fromState];
  if (!allowed || !allowed.has(toState)) {
    throw new Error(`Illegal state transition: ${fromState} -> ${toState} for ${record.command.executionId}`);
  }

  record.currentState = toState;
  record.transitions.push({
    fromState,
    toState,
    timestamp: Date.now(),
    reason: reason || null,
    metadata: metadata || null,
  });

  if (toState === 'REJECTED') {
    record.failureReasonCode = reason || 'REJECTED_UNKNOWN';
  } else if (toState === 'EXPIRED') {
    record.failureReasonCode = reason || 'EXPIRED_TIMEOUT';
  }
}

// Background sweep for expired commands
setInterval(() => {
  const now = Date.now();
  for (const [id, record] of executionRecords.entries()) {
    if (
      (record.currentState === 'QUEUED' || record.currentState === 'DELIVERED_TO_EA') &&
      record.command.expiresAt &&
      record.command.expiresAt <= now
    ) {
      try {
        transitionState(record, 'EXPIRED', 'Command expired before fill');
        // Remove from queue if present
        const qIdx = commandQueue.indexOf(id);
        if (qIdx !== -1) commandQueue.splice(qIdx, 1);
      } catch (e) {
        // Already terminal
      }
    }
  }

  // Update terminal connectivity
  if (lastTerminalPollAt && now - lastTerminalPollAt > 15000) {
    isTerminalConnected = false;
  }
}, 1000);

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(payload);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      // Strip null bytes and whitespace
      const cleanBody = body.replace(/[\x00\0]/g, '').trim();
      if (!cleanBody) return resolve({});
      try {
        resolve(JSON.parse(cleanBody));
      } catch (err) {
        console.error(`[BRIDGE V2 JSON ERR] Failed to parse JSON: ${err.message}. Raw bytes: ${body.length}`);
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

// Request Handler
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  try {
    // 1. Health Status
    if (method === 'GET' && pathname === '/v2/health') {
      const isReal = latestAccount?.tradeMode === 'REAL';
      return sendJson(res, 200, {
        status: isTerminalConnected ? 'HEALTHY' : 'DEGRADED',
        uptimeSec: Math.floor((Date.now() - startTime) / 1000),
        terminalConnected: isTerminalConnected,
        lastTerminalPollAt,
        accountMode: latestAccount?.tradeMode || 'UNKNOWN',
        realExecutionLocked: true, // HARD LOCKED
        activeCommandsQueued: commandQueue.length,
        specsAvailable: specRegistry.size,
        quotesAvailable: quotesRegistry.size,
        positionsAvailable: positionsRegistry.size,
        port: PORT,
      });
    }

    // 2. Account Telemetry
    if (method === 'GET' && pathname === '/v2/account') {
      return sendJson(res, 200, { success: true, account: latestAccount });
    }

    if (method === 'POST' && pathname === '/v2/telemetry/account') {
      const data = await parseJsonBody(req);
      const rawMode = (data.tradeMode || '').toUpperCase();
      const isReal = rawMode === 'REAL' || data.accountTradeMode === 2;
      latestAccount = {
        accountNumber: data.accountNumber || 0,
        broker: data.broker || data.company || 'Unknown Broker',
        currency: data.currency || 'USD',
        balance: parseFloat(data.balance) || 0,
        equity: parseFloat(data.equity) || 0,
        margin: parseFloat(data.margin) || 0,
        freeMargin: parseFloat(data.freeMargin) || 0,
        marginLevel: parseFloat(data.marginLevel) || 0,
        tradeMode: isReal ? 'REAL' : 'DEMO',
        tradeAllowed: Boolean(data.tradeAllowed !== false && !isReal),
        updatedAt: Date.now(),
      };
      isTerminalConnected = true;
      lastTerminalPollAt = Date.now();
      console.log(`[BRIDGE V2] Account updated: ${latestAccount.broker} #${latestAccount.accountNumber} [${latestAccount.tradeMode}] Bal: ${latestAccount.balance} Eq: ${latestAccount.equity}`);
      return sendJson(res, 200, { success: true, received: true });
    }

    // 3. Contract Specs Telemetry & Registry
    if (method === 'GET' && pathname === '/v2/specs') {
      return sendJson(res, 200, { success: true, specs: Array.from(specRegistry.values()) });
    }

    if (method === 'GET' && pathname.startsWith('/v2/specs/')) {
      const sym = pathname.slice('/v2/specs/'.length).trim().toUpperCase();
      const spec = specRegistry.get(sym);
      if (!spec) return sendJson(res, 404, { success: false, error: `Spec not found for ${sym}` });
      return sendJson(res, 200, { success: true, spec });
    }

    if (method === 'POST' && pathname === '/v2/telemetry/specs') {
      const data = await parseJsonBody(req);
      const list = Array.isArray(data.specs) ? data.specs : [data];
      let updatedCount = 0;
      for (const item of list) {
        if (item && item.symbol && typeof item.digits === 'number') {
          const sym = item.symbol.trim().toUpperCase();
          specRegistry.set(sym, {
            symbol: sym,
            digits: item.digits,
            point: item.point || 0.00001,
            contractSize: item.contractSize || 100000,
            volumeMin: item.volumeMin || 0.01,
            volumeMax: item.volumeMax || 100.0,
            volumeStep: item.volumeStep || 0.01,
            stopsLevel: item.stopsLevel || 0,
            freezeLevel: item.freezeLevel || 0,
            marginInitial: item.marginInitial,
            currencyBase: item.currencyBase || '',
            currencyProfit: item.currencyProfit || 'USD',
            tradeMode: item.tradeMode,
            updatedAt: Date.now(),
          });
          updatedCount++;
        }
      }
      isTerminalConnected = true;
      lastTerminalPollAt = Date.now();
      console.log(`[BRIDGE V2] Specs updated: ${updatedCount} symbols`);
      return sendJson(res, 200, { success: true, updatedCount });
    }

    // 4. Quotes Telemetry
    if (method === 'GET' && pathname === '/v2/quotes') {
      return sendJson(res, 200, { success: true, quotes: Array.from(quotesRegistry.values()) });
    }

    if (method === 'GET' && pathname.startsWith('/v2/quotes/')) {
      const sym = pathname.slice('/v2/quotes/'.length).trim().toUpperCase();
      const quote = quotesRegistry.get(sym);
      if (!quote) return sendJson(res, 404, { success: false, error: `Quote not found for ${sym}` });
      return sendJson(res, 200, { success: true, quote });
    }

    if (method === 'POST' && pathname === '/v2/telemetry/quotes') {
      const data = await parseJsonBody(req);
      const list = Array.isArray(data.quotes) ? data.quotes : [data];
      let updatedCount = 0;
      for (const item of list) {
        if (item && item.symbol && typeof item.bid === 'number' && typeof item.ask === 'number') {
          const sym = item.symbol.trim().toUpperCase();
          quotesRegistry.set(sym, {
            symbol: sym,
            bid: item.bid,
            ask: item.ask,
            spreadPoints: item.spreadPoints || Math.round((item.ask - item.bid) / (item.point || 0.00001)),
            timestamp: item.timestamp || Date.now(),
            ageMs: 0,
          });
          updatedCount++;
        }
      }
      isTerminalConnected = true;
      lastTerminalPollAt = Date.now();
      return sendJson(res, 200, { success: true, updatedCount });
    }

    // 4.1 Positions Telemetry
    if (method === 'GET' && pathname === '/v2/positions') {
      return sendJson(res, 200, { success: true, positions: Array.from(positionsRegistry.values()) });
    }

    if (method === 'POST' && pathname === '/v2/telemetry/positions') {
      const data = await parseJsonBody(req);
      const list = Array.isArray(data.positions) ? data.positions : (data.positions ? [data.positions] : []);
      positionsRegistry.clear();
      for (const item of list) {
        if (item && (item.ticket || item.id)) {
          const id = String(item.ticket || item.id);
          positionsRegistry.set(id, {
            ticket: parseInt(item.ticket || item.id, 10),
            symbol: (item.symbol || '').toUpperCase(),
            type: (item.type || '').toUpperCase(),
            volume: parseFloat(item.volume) || 0,
            openPrice: parseFloat(item.openPrice || item.priceOpen) || 0,
            currentPrice: parseFloat(item.currentPrice || item.priceCurrent) || 0,
            sl: parseFloat(item.sl) || 0,
            tp: parseFloat(item.tp) || 0,
            profit: parseFloat(item.profit) || 0,
            swap: parseFloat(item.swap) || 0,
            comment: item.comment || '',
            magic: parseInt(item.magic, 10) || 0,
            openTime: item.openTime || item.time || Date.now(),
            updatedAt: Date.now(),
          });
        }
      }
      isTerminalConnected = true;
      lastTerminalPollAt = Date.now();
      console.log(`[BRIDGE V2] Positions updated: ${positionsRegistry.size} open positions`);
      return sendJson(res, 200, { success: true, count: positionsRegistry.size });
    }

    // 5. Heartbeat
    if (method === 'POST' && pathname === '/v2/telemetry/heartbeat') {
      isTerminalConnected = true;
      lastTerminalPollAt = Date.now();
      return sendJson(res, 200, { success: true, time: Date.now() });
    }

    // 6. Explicit Execution Command Polling (EA poll)
    if (method === 'GET' && pathname === '/v2/execution/poll') {
      isTerminalConnected = true;
      lastTerminalPollAt = Date.now();

      // Check real account safety
      if (latestAccount && latestAccount.tradeMode === 'REAL') {
        return sendJson(res, 200, {
          hasCommand: false,
          command: null,
          serverTime: Date.now(),
          lockReason: 'REAL_ACCOUNT_LOCKED',
        });
      }

      // Check if we have an active queued command
      while (commandQueue.length > 0) {
        const nextId = commandQueue.shift();
        const record = executionRecords.get(nextId);
        if (record && record.currentState === 'QUEUED') {
          // Check if expired
          if (record.command.expiresAt && record.command.expiresAt <= Date.now()) {
            transitionState(record, 'EXPIRED', 'Expired in dispatch queue');
            continue;
          }

          transitionState(record, 'DELIVERED_TO_EA', 'Delivered to MT5 EA during poll');
          return sendJson(res, 200, {
            hasCommand: true,
            command: record.command,
            serverTime: Date.now(),
          });
        }
      }

      // Empty envelope
      return sendJson(res, 200, {
        hasCommand: false,
        command: null,
        serverTime: Date.now(),
      });
    }

    // 7. Execution ACK (from EA)
    if (method === 'POST' && pathname === '/v2/execution/ack') {
      const data = await parseJsonBody(req);
      const executionId = data.executionId;
      if (!executionId) {
        return sendJson(res, 400, { success: false, error: 'executionId is required for ACK' });
      }

      const record = executionRecords.get(executionId);
      if (!record) {
        return sendJson(res, 404, { success: false, error: `Execution ${executionId} not found` });
      }

      if (record.currentState === 'DELIVERED_TO_EA' || record.currentState === 'QUEUED') {
        transitionState(record, 'ACKNOWLEDGED', 'Acknowledged by MT5 EA', { terminalId: data.terminalId });
        record.ack = {
          executionId,
          terminalId: data.terminalId,
          receivedAt: data.receivedAt || Date.now(),
        };
      }

      return sendJson(res, 200, {
        success: true,
        executionId,
        state: record.currentState,
      });
    }

    // 8. Execution Result (from EA)
    if (method === 'POST' && pathname === '/v2/execution/result') {
      const data = await parseJsonBody(req);
      const executionId = data.executionId;
      if (!executionId) {
        return sendJson(res, 400, { success: false, error: 'executionId is required for result' });
      }

      const record = executionRecords.get(executionId);
      if (!record) {
        return sendJson(res, 404, { success: false, error: `Execution ${executionId} not found` });
      }

      const status = (data.status || '').toUpperCase();
      if (status === 'FILLED') {
        if (record.currentState !== 'FILLED') {
          // Transition through SUBMITTED_TO_BROKER if needed
          if (record.currentState === 'ACKNOWLEDGED') {
            transitionState(record, 'SUBMITTED_TO_BROKER', 'Order sent to broker');
          }
          transitionState(record, 'FILLED', data.comment || 'Filled by broker', {
            ticket: data.ticket,
            fillPrice: data.fillPrice,
            filledVolume: data.filledVolume,
            retcode: data.retcode,
          });
        }
      } else if (status === 'REJECTED') {
        if (record.currentState !== 'REJECTED') {
          transitionState(record, 'REJECTED', data.failureReasonCode || data.comment || 'Order rejected by MT5', {
            retcode: data.retcode,
          });
        }
      } else if (status === 'EXPIRED') {
        if (record.currentState !== 'EXPIRED') {
          transitionState(record, 'EXPIRED', data.comment || 'Order expired on terminal');
        }
      }

      record.result = {
        executionId,
        status: record.currentState,
        ticket: data.ticket,
        fillPrice: data.fillPrice,
        filledVolume: data.filledVolume,
        retcode: data.retcode,
        comment: data.comment,
        executedAt: data.executedAt || Date.now(),
        failureReasonCode: record.failureReasonCode,
      };

      return sendJson(res, 200, {
        success: true,
        executionId,
        state: record.currentState,
      });
    }

    // 9. Dispatch Command (from Cortex client)
    if (method === 'POST' && pathname === '/v2/execution/dispatch') {
      const command = await parseJsonBody(req);
      const executionId = command.executionId;

      if (!executionId) {
        return sendJson(res, 400, { success: false, error: 'executionId is mandatory' });
      }

      // Replay / Idempotency Protection: duplicate executionId check
      if (executionRecords.has(executionId)) {
        return sendJson(res, 409, {
          success: false,
          error: 'DUPLICATE_EXECUTION_ID',
          message: `Execution ID ${executionId} has already been registered.`,
          record: executionRecords.get(executionId),
        });
      }

      // Create record
      const record = {
        command: { ...command },
        currentState: 'CREATED',
        transitions: [
          {
            fromState: 'CREATED',
            toState: 'CREATED',
            timestamp: Date.now(),
            reason: 'Received by Bridge V2',
          },
        ],
      };
      executionRecords.set(executionId, record);

      // Real Account Hard-Lock Check
      if (latestAccount && latestAccount.tradeMode === 'REAL') {
        transitionState(record, 'REJECTED', 'REAL_ACCOUNT_HARD_LOCKED');
        return sendJson(res, 403, {
          success: false,
          error: 'REAL_ACCOUNT_HARD_LOCKED',
          record,
        });
      }

      // Validate command
      const sym = (command.symbol || '').trim().toUpperCase();
      const spec = specRegistry.get(sym);
      if (!spec) {
        transitionState(record, 'REJECTED', 'CONTRACT_SPEC_UNAVAILABLE');
        return sendJson(res, 400, {
          success: false,
          error: 'CONTRACT_SPEC_UNAVAILABLE',
          message: `Contract spec for ${sym} is not published by MT5.`,
          record,
        });
      }

      // Validate volume
      const vol = command.volume;
      if (typeof vol !== 'number' || vol < spec.volumeMin || vol > spec.volumeMax) {
        transitionState(record, 'REJECTED', 'INVALID_VOLUME');
        return sendJson(res, 400, {
          success: false,
          error: 'INVALID_VOLUME',
          message: `Volume ${vol} outside allowed bounds [${spec.volumeMin}, ${spec.volumeMax}]`,
          record,
        });
      }

      // Enqueue
      transitionState(record, 'VALIDATED', 'Pre-flight checks passed');
      transitionState(record, 'QUEUED', 'Added to execution dispatch queue');
      commandQueue.push(executionId);

      return sendJson(res, 200, {
        success: true,
        executionId,
        state: record.currentState,
        record,
      });
    }

    // 10. Status Query (from Cortex client)
    if (method === 'GET' && pathname.startsWith('/v2/execution/status/')) {
      const executionId = pathname.slice('/v2/execution/status/'.length).trim();
      const record = executionRecords.get(executionId);
      if (!record) {
        return sendJson(res, 404, { success: false, error: `Execution ${executionId} not found` });
      }
      return sendJson(res, 200, { success: true, record });
    }

    // Not found
    return sendJson(res, 404, { error: 'Route not found in Bridge V2' });
  } catch (err) {
    return sendJson(res, 500, { error: err.message || 'Internal Bridge V2 error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[FEF EXECUTION BRIDGE V2] Running on http://${HOST}:${PORT}`);
  console.log(`[FEF EXECUTION BRIDGE V2] Real Account Mode: HARD LOCKED 🔒`);
  console.log(`[FEF EXECUTION BRIDGE V2] Protocol Isolation: ACTIVE`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});

module.exports = { server, executionRecords, commandQueue, specRegistry, quotesRegistry, positionsRegistry };

