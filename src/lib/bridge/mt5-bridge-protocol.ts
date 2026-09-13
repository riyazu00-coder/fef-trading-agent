/**
 * FEF TRADING SOLUTIONS — MT5 BRIDGE PROTOCOL DEFINITIONS
 * 
 * Secure, authenticated, command-allowlisted protocol between FEF Web Application
 * and the MetaTrader 5 / Exness Terminal.
 */

export type BridgeConnectionState =
  | 'NOT_CONFIGURED'
  | 'CONNECTING'
  | 'CONNECTED_READ_ONLY'
  | 'CONNECTED_DEMO_EXECUTION'
  | 'CONNECTED_LIVE_EXECUTION'
  | 'AUTH_FAILED'
  | 'BRIDGE_OFFLINE'
  | 'MT5_OFFLINE'
  | 'BROKER_DISCONNECTED'
  | 'ERROR';

export type BridgeCommand =
  | 'PING'
  | 'GET_TERMINAL_STATUS'
  | 'GET_ACCOUNT'
  | 'GET_SYMBOLS'
  | 'GET_SYMBOL_INFO'
  | 'GET_QUOTE'
  | 'GET_POSITIONS'
  | 'GET_PENDING_ORDERS'
  | 'GET_BROKER_SESSIONS'
  | 'PLACE_ORDER'
  | 'MODIFY_ORDER'
  | 'CANCEL_ORDER'
  | 'CLOSE_POSITION'
  | 'CLOSE_ALL'
  | 'DELETE_ORDER';

export const ALLOWED_READ_COMMANDS: ReadonlySet<BridgeCommand> = new Set<BridgeCommand>([
  'PING',
  'GET_TERMINAL_STATUS',
  'GET_ACCOUNT',
  'GET_SYMBOLS',
  'GET_SYMBOL_INFO',
  'GET_QUOTE',
  'GET_POSITIONS',
  'GET_PENDING_ORDERS',
  'GET_BROKER_SESSIONS'
]);

export const ALLOWED_DEMO_EXECUTION_COMMANDS: ReadonlySet<BridgeCommand> = new Set<BridgeCommand>([
  'PLACE_ORDER'
]);

export const RESTRICTED_EXECUTION_COMMANDS: ReadonlySet<BridgeCommand> = new Set<BridgeCommand>([
  'PLACE_ORDER',
  'MODIFY_ORDER',
  'CANCEL_ORDER',
  'CLOSE_POSITION',
  'CLOSE_ALL',
  'DELETE_ORDER'
]);

export type ExecutionOperatingMode = 'READ_ONLY' | 'DEMO_EXECUTION';

export type ExecutionFailureCode =
  | 'MT5_OFFLINE'
  | 'STALE_HEARTBEAT'
  | 'NOT_DEMO_ACCOUNT'
  | 'MARKET_CLOSED'
  | 'SESSION_BLOCKED'
  | 'EVIDENCE_TRUST_BLOCKED'
  | 'RISK_GUARDIAN_BLOCKED'
  | 'STALE_QUOTE'
  | 'INVALID_SYMBOL'
  | 'INVALID_VOLUME'
  | 'INVALID_SL'
  | 'INSUFFICIENT_MARGIN'
  | 'WIDE_SPREAD'
  | 'DUPLICATE_REQUEST'
  | 'DUPLICATE_EXECUTION_REQUEST'
  | 'BROKER_REJECTED'
  | 'TRADE_DISABLED'
  | 'EXECUTION_TIMEOUT'
  | 'LIVE_EXECUTION_LOCKED'
  | 'READ_ONLY_LOCK_ACTIVE'
  | 'HUMAN_APPROVAL_REQUIRED';

export interface DemoOrderPayload {
  requestId: string;
  canonicalSymbol: string;
  brokerSymbol: string;
  direction: 'BUY' | 'SELL';
  orderType: 'MARKET_BUY' | 'MARKET_SELL' | 'BUY' | 'SELL';
  volume: number;
  entryReference: number;
  stopLoss: number;
  takeProfit: number;
  magic: number;
  comment: string;
  expectedMaxLoss: number;
  riskPercent: number;
  evidenceTrust: number;
  decisionId: string;
  timestamp: number;
}

export interface DemoExecutionResult {
  success: boolean;
  requestId: string;
  retcode: number;
  retcodeDescription: string;
  ticket?: number;
  deal?: number;
  brokerSymbol: string;
  direction: 'BUY' | 'SELL';
  volume: number;
  fillPrice: number;
  sl: number;
  tp: number;
  timestamp: number;
}

export interface BridgeRequestPayload {
  reqId: string;
  command: BridgeCommand;
  token?: string;
  magicNumber?: number;
  symbol?: string;
  params?: Record<string, any>;
  timestamp: number;
}

export interface BridgeResponsePayload<T = any> {
  reqId: string;
  command: BridgeCommand;
  success: boolean;
  state: BridgeConnectionState;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  latencyMs?: number;
  timestamp: number;
}

export interface MT5TerminalStatus {
  terminalConnected: boolean;
  brokerConnected: boolean;
  brokerName: string;
  brokerServer: string;
  terminalBuild: number;
  tradeAllowed: boolean;
  tradeExpert: boolean;
  pingToBrokerMs: number;
  bridgeVersion: string;
  operatingMode: 'READ_ONLY' | 'DEMO_EXECUTION' | 'LIVE_EXECUTION';
  lastHeartbeat: string;
}

export interface MT5AccountInfo {
  maskedLogin: string; // e.g. "21***89"
  company: string;     // e.g. "Exness (SC) Ltd"
  broker?: string;     // e.g. "Exness"
  server: string;      // e.g. "Exness-Real21" or "Exness-Trial"
  currency: string;    // "USD"
  tradeMode: 'DEMO' | 'REAL';
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  leverage: number;
  tradeAllowed: boolean;
  soCall: number;
  soStop: number;
}

export interface MT5QuoteData {
  canonicalSymbol: string; // e.g. "XAUUSD"
  brokerSymbol: string;    // e.g. "XAUUSDm"
  bid: number;
  ask: number;
  spread: number;
  digits: number;
  point: number;
  time: string;
  isStale: boolean;
}

export interface MT5SymbolSpecification {
  canonicalSymbol: string;
  brokerSymbol: string;
  description: string;
  digits: number;
  point: number;
  contractSize: number;
  minLot: number;
  maxLot: number;
  lotStep: number;
  tickValue: number;
  tickSize: number;
  tradeMode: 'FULL' | 'CLOSE_ONLY' | 'DISABLED';
  pipSize?: number;
  source?: 'BROKER' | 'STATIC' | string;
}

export interface MT5PositionItem {
  ticket: number;
  symbol: string;
  canonicalSymbol?: string;
  type: 'BUY' | 'SELL';
  lots: number;
  openPrice: number;
  currentPrice: number;
  sl: number;
  tp: number;
  pnl: number;
  swap: number;
  magic: number;
  comment: string;
  openTime: string;
}

export interface MT5PendingOrderItem {
  ticket: number;
  symbol: string;
  canonicalSymbol?: string;
  type: 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP';
  lots: number;
  price: number;
  sl: number;
  tp: number;
  magic: number;
  openTime: string;
}

export interface MT5BrokerSessionInfo {
  brokerSymbol: string;
  tradeMode: string;
  sessionStart: string;
  sessionEnd: string;
  serverTime: string;
  marketAvailable: boolean;
}
