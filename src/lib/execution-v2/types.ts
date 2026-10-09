/**
 * FEF CORTEX — EXECUTION BRIDGE V2 TYPES
 * Master Consolidation V2: Strict Protocol Separation & Fail-Closed Safety
 */

export type ExecutionLifecycleState =
  | 'CREATED'
  | 'VALIDATED'
  | 'QUEUED'
  | 'DELIVERED_TO_EA'
  | 'ACKNOWLEDGED'
  | 'SUBMITTED_TO_BROKER'
  | 'FILLED'
  | 'REJECTED'
  | 'EXPIRED';

export type OrderSide = 'BUY' | 'SELL';

export type AccountTradeMode = 'DEMO' | 'REAL' | 'CONTEST' | 'UNKNOWN';

export interface BrokerContractSpec {
  symbol: string;
  digits: number;
  point: number;
  contractSize: number;
  volumeMin: number;
  volumeMax: number;
  volumeStep: number;
  stopsLevel: number; // in points
  freezeLevel: number; // in points
  marginInitial?: number;
  currencyBase: string;
  currencyProfit: string;
  tradeMode?: number;
  updatedAt: number;
}

export interface ExecutionCommand {
  executionId: string;
  symbol: string;
  brokerSymbol: string;
  side: OrderSide;
  volume: number;
  requestedPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  slippagePoints?: number;
  magicNumber?: number;
  comment?: string;
  createdAt: number;
  expiresAt: number;
}

export interface CommandPollingEnvelope {
  hasCommand: boolean;
  command: ExecutionCommand | null;
  serverTime: number;
}

export interface ExecutionAckPacket {
  executionId: string;
  terminalId?: string;
  receivedAt: number;
}

export interface ExecutionResultPacket {
  executionId: string;
  status: 'FILLED' | 'REJECTED' | 'EXPIRED';
  ticket?: number;
  fillPrice?: number;
  filledVolume?: number;
  retcode?: number;
  comment?: string;
  executedAt: number;
  failureReasonCode?: string;
}

export interface LifecycleTransitionRecord {
  fromState: ExecutionLifecycleState;
  toState: ExecutionLifecycleState;
  timestamp: number;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface ExecutionRecord {
  command: ExecutionCommand;
  currentState: ExecutionLifecycleState;
  transitions: LifecycleTransitionRecord[];
  ack?: ExecutionAckPacket;
  result?: ExecutionResultPacket;
  error?: string;
  failureReasonCode?: string;
}

export interface BrokerAccountTelemetry {
  accountNumber: number;
  broker: string;
  currency: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  tradeMode: AccountTradeMode;
  tradeAllowed: boolean;
  updatedAt: number;
}

export interface BrokerQuoteTelemetry {
  symbol: string;
  bid: number;
  ask: number;
  spreadPoints: number;
  timestamp: number;
  ageMs: number;
}

export interface BridgeV2HealthStatus {
  status: 'HEALTHY' | 'DEGRADED' | 'DISCONNECTED';
  uptimeSec: number;
  terminalConnected: boolean;
  lastTerminalPollAt: number | null;
  accountMode: AccountTradeMode;
  realExecutionLocked: boolean;
  activeCommandsQueued: number;
  specsAvailable: number;
  quotesAvailable: number;
}

