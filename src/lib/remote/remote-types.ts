/**
 * FEF TRADING SOLUTIONS — PHASE 2 SECURE REMOTE MT5 TYPES
 * 
 * Canonical Type Definitions for Secure Outbound MT5 Relay Architecture:
 * Production App <-> FEF Secure Relay <-> Outbound Connector Agent <-> Local MT5 Bridge
 */

import { MT5QuoteData, MT5PositionItem, MT5PendingOrderItem } from '../bridge/mt5-bridge-protocol';

export type RemoteConnectionState = 'ONLINE' | 'OFFLINE' | 'STALE' | 'RECONNECTING';

export type RemoteTradeMode = 'DEMO' | 'REAL';

export type RemoteOperatingMode = 'READ_ONLY' | 'DEMO_EXECUTION';

export type CommandAckStatus =
  | 'RECEIVED'
  | 'VALIDATED'
  | 'DISPATCHED_TO_MT5'
  | 'BROKER_ACK'
  | 'REJECTED'
  | 'EXPIRED';

/**
 * Device Registration & Identity Model
 * Secrets/tokens are strictly isolated and never exposed in the UI.
 */
export interface RegisteredDevice {
  deviceId: string;                // Cryptographic UUID
  publicDeviceId: string;          // Safe display representation (e.g. dev_9f1a...)
  deviceName: string;              // Human readable name (e.g. "Workstation 1 - Tokyo VPS")
  connectorVersion: string;        // SemVer
  keyId: string;                   // Identifier of active rotatable authentication token
  authTokenHash: string;           // Salted SHA-256 hash of device secret
  createdAt: number;
  lastSeen: number;
  connectionState: RemoteConnectionState;
  broker: string;
  server: string;
  maskedAccount: string;
  tradeMode: RemoteTradeMode;
  operatingMode: RemoteOperatingMode;
}

export interface DeviceAuthCredentials {
  deviceId: string;
  authToken: string;
  keyId: string;
}

/**
 * Symbol Contract Specification
 */
export interface RemoteSymbolSpec {
  symbol: string;
  minLot: number;
  maxLot: number;
  lotStep: number;
  contractSize: number;
  tickValue: number;
  tickSize: number;
  digits: number;
  tradeMode: 'FULL' | 'CLOSE_ONLY' | 'DISABLED';
}

/**
 * Remote Telemetry Envelope
 */
export interface RemoteTelemetrySnapshot {
  deviceId: string;
  publicDeviceId: string;
  terminalConnected: boolean;
  bridgeConnected: boolean;
  heartbeatAgeMs: number;
  broker: string;
  server: string;
  maskedAccount: string;
  tradeMode: RemoteTradeMode;
  operatingMode: RemoteOperatingMode;
  priceAuthority: 'MT5_BROKER' | 'REFERENCE';
  quotes: Record<string, MT5QuoteData>;
  symbolSpecs: Record<string, RemoteSymbolSpec>;
  positions: MT5PositionItem[];
  pendingOrders: MT5PendingOrderItem[];
  activePositionsCount: number;
  timestamp: number;
  isStale: boolean;
}

/**
 * Remote Execution Command Envelope
 * Enforces mandatory TTL, idempotency, monotonic nonce, and explicit human approval
 */
export interface RemoteExecutionCommand {
  requestId: string;               // Unique execution request ID
  deviceId: string;                // Target registered device ID
  commandType: 'PLACE_ORDER';
  createdAt: number;
  expiresAt: number;               // TTL cutoff timestamp (fail-closed if expired)
  symbol: string;
  brokerSymbol: string;
  direction: 'BUY' | 'SELL';
  volume: number;
  sl?: number;
  tp?: number;
  magic: number;
  comment: string;
  approvalId: string;              // Correlation to 20-point Human Authorization record
  humanApproved: boolean;          // Mandatory human approval gate
  nonce: number;                   // Monotonic nonce for replay prevention
  testType?: 'ENGINEERING_DEMO_TEST';
}

/**
 * Remote Command Acknowledgment
 */
export interface RemoteCommandAck {
  requestId: string;
  deviceId: string;
  status: CommandAckStatus;
  ticket?: number;
  deal?: number;
  fillPrice?: number;
  slippagePrice?: number;
  retcode?: number;
  retcodeDescription?: string;
  error?: {
    code: string;
    message: string;
  };
  timestamp: number;
}
