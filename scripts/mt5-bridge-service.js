/**
 * FEF TRADING SOLUTIONS — LOCAL MT5 BRIDGE SERVICE DAEMON
 * 
 * Runs a local TCP server on 127.0.0.1:5555 adhering to the exact FEF MT5 Bridge Protocol.
 * Used for development, CI/CD automated test verification, and local relay testing.
 */

const net = require('net');

const PORT = parseInt(process.env.MT5_PORT || '5555', 10);
const HOST = process.env.MT5_HOST || '127.0.0.1';
const VALID_TOKEN = process.env.FEF_BRIDGE_TOKEN || 'fef_local_bridge_token_v1';
const MAGIC_NUMBER = 8882026;

// Simulated authentic MT5 broker environment for testing
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
    bridgeVersion: '1.0.0',
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
  ]
};

function handleRequest(req) {
  const { reqId = `req-${Date.now()}`, command, token, symbol } = req;

  // 1. Auth check
  if (token !== VALID_TOKEN) {
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
  if (['PLACE_ORDER', 'MODIFY_ORDER', 'CANCEL_ORDER', 'CLOSE_POSITION', 'CLOSE_ALL'].includes(command)) {
    return {
      reqId,
      command,
      success: false,
      state: 'CONNECTED_READ_ONLY',
      error: {
        code: 'READ_ONLY_LOCK',
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
        canonicalSymbol: sym.replace('m', ''),
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
        data: { orders: [] },
        timestamp: Date.now()
      };

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

function createBridgeServer(port = PORT, host = HOST) {
  const server = net.createServer((socket) => {
    let buffer = '';

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (buffer.includes('\n')) {
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep uncompleted trailing chunk
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.length > 0) {
            try {
              const req = JSON.parse(trimmed);
              const resp = handleRequest(req);
              socket.write(JSON.stringify(resp) + '\n', 'utf8');
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

    socket.on('error', () => {});
  });

  return server;
}

// Start standalone daemon if run directly via CLI
if (require.main === module) {
  const server = createBridgeServer();
  server.listen(PORT, HOST, () => {
    console.log(`================================================================`);
    console.log(`FEF MT5 BRIDGE DAEMON ONLINE`);
    console.log(`Listening: ${HOST}:${PORT}`);
    console.log(`Magic Number: ${MAGIC_NUMBER}`);
    console.log(`Auth Token: ${VALID_TOKEN ? 'PROTECTED' : 'OPEN'}`);
    console.log(`Operating Mode: READ_ONLY (Execution blocked)`);
    console.log(`================================================================`);
  });
}

module.exports = {
  createBridgeServer,
  handleRequest,
  MOCK_BROKER_DATA,
  PORT,
  HOST,
  VALID_TOKEN,
  MAGIC_NUMBER
};
