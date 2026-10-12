/**
 * FEF TRADING SOLUTIONS — LOCAL MT5 BRIDGE SERVICE DAEMON
 * 
 * Single authoritative TCP server binding 127.0.0.1:5555.
 * Acts as the bidirectional relay between FEF Next.js Application and FEF_Bridge.mq5.
 *
 * Architecture:
 * - Listens exclusively on 127.0.0.1 (Loopback). Never binds 0.0.0.0.
 * - Accepts incoming persistent connection from FEF_Bridge.mq5 (Zero-DLL MQL5 Socket Client).
 * - Relays incoming Next.js client commands to FEF_Bridge.mq5 and returns real MT5 terminal data.
 * - Truthfully reports MT5_OFFLINE if FEF_Bridge EA is not connected.
 * - Supports --mock flag for isolated CI/CD automated test verification.
 */

const net = require('net');

const PORT = parseInt(process.env.MT5_PORT || '5555', 10);
const VALID_TOKEN = (process.env.FEF_BRIDGE_TOKEN || '').trim();
if (!VALID_TOKEN || VALID_TOKEN === 'fef_local_bridge_token_v1') {
  console.warn('[BRIDGE CONFIG] FEF_BRIDGE_TOKEN is unconfigured or uses retired public fallback. Fail-closed.');
}
const MAGIC_NUMBER = 8882026;

// Reference mock data for CI/CD test suites or fallback simulation mode
const MOCK_BROKER_DATA = {
  terminal: {
    terminalConnected: true,
    brokerConnected: true,
    brokerName: 'Exness (SC) Ltd',
    brokerServer: 'Exness-Trial',
    terminalBuild: 4153,
    tradeAllowed: true,
    tradeExpert: true,
    pingToBrokerMs: 8,
    bridgeVersion: '1.1.0',
    operatingMode: 'READ_ONLY',
    lastHeartbeat: new Date().toTimeString().split(' ')[0]
  },
  account: {
    maskedLogin: '21***89',
    company: 'Exness (SC) Ltd',
    server: 'Exness-Trial',
    currency: 'USD',
    tradeMode: 'DEMO',
    balance: 102450.00,
    equity: 103010.00,
    margin: 434.20,
    freeMargin: 102575.80,
    marginLevel: 23724.09,
    leverage: 500,
    tradeAllowed: true,
    soCall: 60.0,
    soStop: 0.0
  },
  symbols: [
    'XAUUSDm',
    'XAGUSDm',
    'EURUSDm',
    'GBPUSDm',
    'USDJPYm',
    'GBPJPYm',
    'AUDUSDm',
    'NZDUSDm',
    'USOILm',
    'USTECm',
    'US30m',
    'US500m',
    'BTCUSDm',
    'ETHUSDm',
    'SOLUSDm'
  ],
  specs: {
    XAUUSDm: {
      canonicalSymbol: 'XAUUSD',
      brokerSymbol: 'XAUUSDm',
      description: 'Gold vs US Dollar (Mini)',
      digits: 2,
      point: 0.01,
      contractSize: 100,
      minLot: 0.01,
      maxLot: 200,
      lotStep: 0.01,
      tickValue: 1.0,
      tickSize: 0.01,
      tradeMode: 'FULL'
    },
    XAGUSDm: {
      canonicalSymbol: 'XAGUSD',
      brokerSymbol: 'XAGUSDm',
      description: 'Silver vs US Dollar (Mini)',
      digits: 3,
      point: 0.001,
      contractSize: 5000,
      minLot: 0.01,
      maxLot: 100,
      lotStep: 0.01,
      tickValue: 5.0,
      tickSize: 0.001,
      tradeMode: 'FULL'
    },
    EURUSDm: {
      canonicalSymbol: 'EURUSD',
      brokerSymbol: 'EURUSDm',
      description: 'Euro vs US Dollar (Mini)',
      digits: 5,
      point: 0.00001,
      contractSize: 100000,
      minLot: 0.01,
      maxLot: 200,
      lotStep: 0.01,
      tickValue: 1.0,
      tickSize: 0.00001,
      tradeMode: 'FULL'
    },
    USTECm: {
      canonicalSymbol: 'US100',
      brokerSymbol: 'USTECm',
      description: 'US Tech 100 Index (Cash)',
      digits: 2,
      point: 0.01,
      contractSize: 1,
      minLot: 0.1,
      maxLot: 50,
      lotStep: 0.1,
      tickValue: 0.1,
      tickSize: 0.01,
      tradeMode: 'FULL'
    }
  },
  quotes: {
    XAUUSDm: { bid: 4342.15, ask: 4342.45, spread: 30, digits: 2, point: 0.01 },
    XAGUSDm: { bid: 64.120, ask: 64.155, spread: 35, digits: 3, point: 0.001 },
    EURUSDm: { bid: 1.15985, ask: 1.16001, spread: 16, digits: 5, point: 0.00001 },
    USTECm: { bid: 21850.40, ask: 21851.60, spread: 120, digits: 2, point: 0.01 }
  },
  positions: [
    {
      ticket: 94821034,
      symbol: 'XAUUSDm',
      type: 'BUY',
      lots: 0.50,
      openPrice: 4338.50,
      currentPrice: 4342.15,
      sl: 4322.00,
      tp: 4385.00,
      pnl: 182.50,
      swap: -1.20,
      magic: 8882026,
      comment: 'FEF Swarm Buy',
      openTime: '2026-09-12 13:42:10 UTC'
    }
  ],
  pendingOrders: [
    {
      ticket: 94829910,
      symbol: 'XAUUSDm',
      type: 'BUY_LIMIT',
      lots: 0.25,
      price: 4320.00,
      sl: 4305.00,
      tp: 4360.00,
      expiration: 'GTC',
      magic: 8882026,
      creationTime: '2026-09-12 14:00:00 UTC'
    }
  ],
  sessions: {
    XAUUSDm: {
      brokerSymbol: 'XAUUSDm',
      tradeMode: 'FULL',
      sessionStart: '00:00:00',
      sessionEnd: '23:59:59',
      serverTime: new Date().toISOString(),
      marketAvailable: true
    }
  }
};

let activeEaSocket = null;
let lastEaHeartbeat = 0;
let pendingRelayRequests = new Map();

function handleMockRequest(req) {
  const { reqId = `req-${Date.now()}`, command, token, symbol } = req;

  // 1. Auth check (fail-closed, no public fallback)
  if (!VALID_TOKEN || VALID_TOKEN === 'fef_local_bridge_token_v1' || token !== VALID_TOKEN) {
    return {
      reqId,
      command,
      success: false,
      state: 'AUTH_FAILED',
      error: { code: 'AUTH_FAILED', message: 'Invalid or missing authentication token' },
      timestamp: Date.now()
    };
  }

  // 2. Reject Execution commands in read-only mode
  if (['PLACE_ORDER', 'MODIFY_ORDER', 'CANCEL_ORDER', 'CLOSE_POSITION', 'CLOSE_ALL', 'DELETE_ORDER'].includes(command)) {
    return {
      reqId,
      command,
      success: false,
      state: 'CONNECTED_READ_ONLY',
      error: {
        code: 'READ_ONLY_LOCK_ACTIVE',
        message: `Execution command '${command}' rejected: FEF MT5 Bridge is locked in READ_ONLY safety mode.`
      },
      timestamp: Date.now()
    };
  }

  // 3. Handle Read Commands
  switch (command) {
    case 'PING':
      return {
        reqId,
        command,
        success: true,
        state: 'CONNECTED_READ_ONLY',
        data: {
          status: 'PONG',
          terminalBuild: MOCK_BROKER_DATA.terminal.terminalBuild,
          serverTime: new Date().toISOString(),
          magicNumber: MAGIC_NUMBER
        },
        timestamp: Date.now()
      };

    case 'GET_TERMINAL_STATUS':
      return {
        reqId,
        command,
        success: true,
        state: 'CONNECTED_READ_ONLY',
        data: MOCK_BROKER_DATA.terminal,
        timestamp: Date.now()
      };

    case 'GET_ACCOUNT':
      return {
        reqId,
        command,
        success: true,
        state: 'CONNECTED_READ_ONLY',
        data: MOCK_BROKER_DATA.account,
        timestamp: Date.now()
      };

    case 'GET_SYMBOLS':
      return {
        reqId,
        command,
        success: true,
        state: 'CONNECTED_READ_ONLY',
        data: { symbols: MOCK_BROKER_DATA.symbols },
        timestamp: Date.now()
      };

    case 'GET_SYMBOL_INFO': {
      const sym = symbol || 'XAUUSDm';
      const spec = MOCK_BROKER_DATA.specs[sym] || {
        canonicalSymbol: sym.replace(/m|\.r|c|_i$/g, ''),
        brokerSymbol: sym,
        description: `${sym} Spot Rate`,
        digits: 2,
        point: 0.01,
        contractSize: 100,
        minLot: 0.01,
        maxLot: 100,
        lotStep: 0.01,
        tickValue: 1.0,
        tickSize: 0.01,
        tradeMode: 'FULL'
      };
      return {
        reqId,
        command,
        success: true,
        state: 'CONNECTED_READ_ONLY',
        data: spec,
        timestamp: Date.now()
      };
    }

    case 'GET_QUOTE': {
      const sym = symbol || 'XAUUSDm';
      const q = MOCK_BROKER_DATA.quotes[sym] || {
        bid: 4342.15,
        ask: 4342.45,
        spread: 30,
        digits: 2,
        point: 0.01
      };
      return {
        reqId,
        command,
        success: true,
        state: 'CONNECTED_READ_ONLY',
        data: {
          brokerSymbol: sym,
          ...q,
          time: new Date().toTimeString().split(' ')[0],
          isStale: false
        },
        timestamp: Date.now()
      };
    }

    case 'GET_POSITIONS':
      return {
        reqId,
        command,
        success: true,
        state: 'CONNECTED_READ_ONLY',
        data: { positions: MOCK_BROKER_DATA.positions },
        timestamp: Date.now()
      };

    case 'GET_PENDING_ORDERS':
      return {
        reqId,
        command,
        success: true,
        state: 'CONNECTED_READ_ONLY',
        data: { orders: MOCK_BROKER_DATA.pendingOrders },
        timestamp: Date.now()
      };

    case 'GET_BROKER_SESSIONS': {
      const sym = symbol || 'XAUUSDm';
      const sess = MOCK_BROKER_DATA.sessions[sym] || {
        brokerSymbol: sym,
        tradeMode: 'FULL',
        sessionStart: '00:00:00',
        sessionEnd: '23:59:59',
        serverTime: new Date().toISOString(),
        marketAvailable: true
      };
      return {
        reqId,
        command,
        success: true,
        state: 'CONNECTED_READ_ONLY',
        data: sess,
        timestamp: Date.now()
      };
    }

    default:
      return {
        reqId,
        command,
        success: false,
        state: 'ERROR',
        error: { code: 'UNKNOWN_COMMAND', message: `Command '${command}' not recognized.` },
        timestamp: Date.now()
      };
  }
}

/**
 * Creates the TCP Bridge Server
 * @param {number} port
 * @param {string} host
 * @param {boolean} forceMockMode - if true, handles requests locally without waiting for MT5
 */
function createBridgeServer(port = PORT, host = HOST, forceMockMode = false) {
  const isMock = forceMockMode || process.argv.includes('--mock') || process.env.FEF_BRIDGE_MOCK === 'true';

  const server = net.createServer((socket) => {
    let buffer = '';
    let isThisSocketEa = false;

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (buffer.includes('\n')) {
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep uncompleted trailing chunk
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.length > 0) {
            try {
              const msg = JSON.parse(trimmed);

              // 1. Handshake from FEF_Bridge.mq5
              if (msg.command === 'EA_CONNECTED') {
                isThisSocketEa = true;
                activeEaSocket = socket;
                lastEaHeartbeat = Date.now();
                console.log(`✓ MT5 EA Connected! Account: ${msg.account} | Build: ${msg.build}`);
                continue;
              }

              // 2. Incoming response from FEF_Bridge.mq5 for a pending relay request
              if (isThisSocketEa && msg.reqId && pendingRelayRequests.has(msg.reqId)) {
                const pending = pendingRelayRequests.get(msg.reqId);
                pendingRelayRequests.delete(msg.reqId);
                clearTimeout(pending.timer);
                lastEaHeartbeat = Date.now();
                pending.clientSocket.write(JSON.stringify(msg) + '\n', 'utf8');
                continue;
              }

              // 3. Incoming command from Next.js / API Client
              const command = (msg.command || '').toUpperCase();

              // Safety Gate: Reject write commands immediately
              if (['PLACE_ORDER', 'MODIFY_ORDER', 'CANCEL_ORDER', 'CLOSE_POSITION', 'CLOSE_ALL', 'DELETE_ORDER'].includes(command)) {
                socket.write(
                  JSON.stringify({
                    reqId: msg.reqId || 'req-0',
                    command,
                    success: false,
                    state: 'CONNECTED_READ_ONLY',
                    error: {
                      code: 'READ_ONLY_LOCK_ACTIVE',
                      message: `Execution command '${command}' rejected: FEF MT5 Bridge is locked in READ_ONLY safety mode.`
                    },
                    timestamp: Date.now()
                  }) + '\n',
                  'utf8'
                );
                continue;
              }

              // Auth check (fail-closed, no public fallback)
              if (!VALID_TOKEN || VALID_TOKEN === 'fef_local_bridge_token_v1' || msg.token !== VALID_TOKEN) {
                socket.write(
                  JSON.stringify({
                    reqId: msg.reqId || 'req-0',
                    command,
                    success: false,
                    state: 'AUTH_FAILED',
                    error: { code: 'AUTH_FAILED', message: 'Invalid or missing authentication token.' },
                    timestamp: Date.now()
                  }) + '\n',
                  'utf8'
                );
                continue;
              }

              // Check if real MT5 EA is connected
              const isEaAlive = activeEaSocket && !activeEaSocket.destroyed && (Date.now() - lastEaHeartbeat < 30000);

              if (isEaAlive) {
                // Relay request to real MT5 EA
                const reqId = msg.reqId || `req-${Date.now()}`;
                const timer = setTimeout(() => {
                  pendingRelayRequests.delete(reqId);
                  socket.write(
                    JSON.stringify({
                      reqId,
                      command,
                      success: false,
                      state: 'TIMEOUT',
                      error: { code: 'EA_RESPONSE_TIMEOUT', message: 'Timeout waiting for response from FEF_Bridge.mq5.' },
                      timestamp: Date.now()
                    }) + '\n',
                    'utf8'
                  );
                }, 3000);

                pendingRelayRequests.set(reqId, { clientSocket: socket, timer });
                activeEaSocket.write(JSON.stringify(msg) + '\n', 'utf8');
              } else if (isMock) {
                // CI/CD or Mock Mode
                const resp = handleMockRequest(msg);
                socket.write(JSON.stringify(resp) + '\n', 'utf8');
              } else {
                // Real Mode but EA not connected -> Truthful offline error!
                socket.write(
                  JSON.stringify({
                    reqId: msg.reqId || 'req-0',
                    command,
                    success: false,
                    state: 'MT5_OFFLINE',
                    error: {
                      code: 'MT5_OFFLINE',
                      message: 'FEF Bridge daemon is listening on 127.0.0.1:5555, but FEF_Bridge.mq5 is not connected in MetaTrader 5. Attach the EA in MT5 to enable live telemetry.'
                    },
                    timestamp: Date.now()
                  }) + '\n',
                  'utf8'
                );
              }
            } catch (err) {
              socket.write(
                JSON.stringify({
                  reqId: 'error',
                  command: 'UNKNOWN',
                  success: false,
                  state: 'ERROR',
                  error: { code: 'MALFORMED_JSON', message: 'Invalid JSON request payload' },
                  timestamp: Date.now()
                }) + '\n',
                'utf8'
              );
            }
          }
        }
      }
    });

    socket.on('close', () => {
      if (socket === activeEaSocket) {
        console.log('⚠ MT5 EA disconnected from Bridge daemon.');
        activeEaSocket = null;
      }
    });

    socket.on('error', () => {});
  });

  return server;
}

// Start standalone daemon if run directly via CLI
if (require.main === module) {
  const isMock = process.argv.includes('--mock') || process.env.FEF_BRIDGE_MOCK === 'true';
  const server = createBridgeServer(PORT, HOST, isMock);
  server.listen(PORT, HOST, () => {
    console.log(`================================================================`);
    console.log(`FEF MT5 BRIDGE DAEMON ONLINE`);
    console.log(`Listening strictly on: ${HOST}:${PORT} (Loopback Only)`);
    console.log(`Magic Number: ${MAGIC_NUMBER}`);
    console.log(`Auth Token: ${VALID_TOKEN ? 'PROTECTED' : 'OPEN'}`);
    console.log(`Operating Mode: READ_ONLY (Execution strictly blocked)`);
    console.log(`Status: ${isMock ? 'MOCK / SIMULATION MODE' : 'WAITING FOR FEF_BRIDGE.MQ5'}`);
    console.log(`================================================================`);
  });
}

module.exports = {
  createBridgeServer,
  handleRequest: handleMockRequest,
  handleMockRequest,
  MOCK_BROKER_DATA,
  PORT,
  HOST,
  VALID_TOKEN,
  MAGIC_NUMBER
};
