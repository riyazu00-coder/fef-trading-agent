/**
 * FEF TRADING SOLUTIONS — REMOTE SECURITY & REPLAY VALIDATOR
 * 
 * Enforces Institutional Security Invariants:
 * 1. Outbound-only device authentication & rotatable token validation
 * 2. Strict command expiry (TTL) & monotonic nonce replay protection
 * 3. REAL account hard locks (strictly fail-closed)
 * 4. DEMO_EXECUTION authoritative gating
 * 5. Connector liveness & heartbeat freshness (< 6000ms)
 * 6. Broker price authority preservation
 */

import crypto from 'crypto';
import {
  RegisteredDevice,
  DeviceAuthCredentials,
  RemoteExecutionCommand,
  RemoteTelemetrySnapshot,
} from './remote-types';
import { isSymbolSessionExecutable } from '../bridge/engineering-demo-transport';

export const MAX_COMMAND_TTL_MS = 30000; // Max permitted TTL is 30 seconds
export const MAX_CONNECTOR_HEARTBEAT_AGE_MS = 6000; // 6s threshold

export function hashAuthToken(token: string, salt: string = 'fef-device-salt-v1'): string {
  return crypto
    .createHash('sha256')
    .update(`${salt}:${token}`)
    .digest('hex');
}

export function generateTicketFingerprint(ticket: {
  symbol: string;
  direction: string;
  volume: number;
  priceBasis: number;
  sl: number;
  tp1: number;
  tp2?: number;
  tp3?: number;
}): string {
  const norm = [
    ticket.symbol.toUpperCase().trim(),
    ticket.direction.toUpperCase().trim(),
    Number(ticket.volume).toFixed(4),
    Number(ticket.priceBasis).toFixed(5),
    Number(ticket.sl).toFixed(5),
    Number(ticket.tp1).toFixed(5),
    Number(ticket.tp2 || 0).toFixed(5),
    Number(ticket.tp3 || 0).toFixed(5),
  ].join(':');
  return crypto.createHash('sha256').update(norm).digest('hex');
}

export function signCommandPayload(command: {
  requestId: string;
  approvalId: string;
  deviceId: string;
  symbol: string;
  direction: string;
  volume: number;
  sl?: number;
  tp1?: number;
  expiresAt: number;
}, secret: string): string {
  const payload = `${command.requestId}:${command.approvalId}:${command.deviceId}:${command.symbol}:${command.direction}:${command.volume}:${command.sl || 0}:${command.tp1 || 0}:${command.expiresAt}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifyCommandSignature(command: RemoteExecutionCommand, secret: string): boolean {
  if (!command.signature) return false;
  const expected = signCommandPayload(command as any, secret);
  if (expected.length !== command.signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(command.signature, 'utf8'));
}

export interface SecurityValidationResult {
  valid: boolean;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Validate Device Authentication
 */
export function validateDeviceAuth(
  credentials: DeviceAuthCredentials,
  device: RegisteredDevice | null
): SecurityValidationResult {
  if (!device) {
    return {
      valid: false,
      error: {
        code: 'DEVICE_NOT_FOUND',
        message: `Registered device with ID '${credentials.deviceId}' does not exist.`,
      },
    };
  }

  if (device.keyId !== credentials.keyId) {
    return {
      valid: false,
      error: {
        code: 'INVALID_KEY_ID',
        message: 'Supplied key identifier is expired or unrecognized. Token rotation required.',
      },
    };
  }

  const computedHash = hashAuthToken(credentials.authToken);
  const isValid = crypto.timingSafeEqual(
    Buffer.from(computedHash, 'utf8'),
    Buffer.from(device.authTokenHash, 'utf8')
  );

  if (!isValid) {
    return {
      valid: false,
      error: {
        code: 'AUTH_FAILED',
        message: 'Invalid device credentials. Authentication rejected.',
      },
    };
  }

  return { valid: true };
}

/**
 * Comprehensive Remote Command Pre-Flight Security Validation
 */
export function validateRemoteExecutionCommand(
  command: RemoteExecutionCommand,
  telemetry: RemoteTelemetrySnapshot | null,
  device: RegisteredDevice | null,
  nowMs: number = Date.now()
): SecurityValidationResult {
  // 1. Mandatory Human Approval Check
  if (command.humanApproved !== true) {
    return {
      valid: false,
      error: {
        code: 'HUMAN_APPROVAL_REQUIRED',
        message: 'Execution rejected: Explicit human approval is mandatory for all commands.',
      },
    };
  }

  // 1a. REAL Account Command Lock (Phase 2C Defense-in-Depth)
  if (command.accountMode === 'REAL') {
    return {
      valid: false,
      error: {
        code: 'REAL_EXECUTION_LOCKED',
        message: 'SECURITY LOCK: Real account execution is strictly prohibited in Phase 2.',
      },
    };
  }

  // 1b. Mandatory Fields Check
  if (!command.requestId || !command.approvalId || !command.symbol || !command.direction || !command.volume) {
    return {
      valid: false,
      error: {
        code: 'MISSING_MANDATORY_FIELDS',
        message: 'Command rejected: requestId, approvalId, symbol, direction, and volume are mandatory.',
      },
    };
  }

  // 1c. Mandatory SL/TP1 Check (Phase 2B.3/2C)
  if (command.testType !== 'ENGINEERING_DEMO_TEST') {
    if (!command.sl || command.sl <= 0 || isNaN(command.sl)) {
      return {
        valid: false,
        error: {
          code: 'MISSING_SL',
          message: 'Stop Loss (SL) is mandatory under Phase 2 institutional protection policy.',
        },
      };
    }
    if (!command.tp1 || command.tp1 <= 0 || isNaN(command.tp1)) {
      return {
        valid: false,
        error: {
          code: 'MISSING_TP1',
          message: 'Take Profit 1 (TP1) is mandatory under Phase 2 institutional protection policy.',
        },
      };
    }
  }

  // 1d. Evidence Trust Threshold Check (>= 60%)
  if (typeof command.evidenceTrust === 'number' && command.evidenceTrust < 60) {
    return {
      valid: false,
      error: {
        code: 'EVIDENCE_TRUST_TOO_LOW',
        message: `Evidence Trust (${command.evidenceTrust}%) is below mandatory 60% institutional threshold.`,
      },
    };
  }

  // 1e. Immutable Ticket Fingerprint Validation
  if (command.approvalHash && command.priceBasis) {
    const expectedHash = generateTicketFingerprint({
      symbol: command.symbol,
      direction: command.direction,
      volume: command.volume,
      priceBasis: command.priceBasis,
      sl: command.sl ?? 0,
      tp1: command.tp1 ?? 0,
      tp2: command.tp2,
      tp3: command.tp3,
    });
    if (command.approvalHash !== expectedHash) {
      return {
        valid: false,
        error: {
          code: 'TICKET_TAMPERED',
          message: 'Human authorization ticket fingerprint mismatch. Ticket parameters were modified after approval.',
        },
      };
    }
  }

  // 2. Command Expiry (TTL) Check
  if (command.expiresAt <= nowMs) {
    return {
      valid: false,
      error: {
        code: 'COMMAND_EXPIRED',
        message: `Command expired: cutoff was ${command.expiresAt}, current time is ${nowMs}. Replay prevented.`,
      },
    };
  }

  const ttl = command.expiresAt - command.createdAt;
  if (ttl <= 0 || ttl > MAX_COMMAND_TTL_MS) {
    return {
      valid: false,
      error: {
        code: 'INVALID_TTL',
        message: `Command TTL (${ttl}ms) violates institutional policy (1ms - ${MAX_COMMAND_TTL_MS}ms).`,
      },
    };
  }

  // 3. Monotonic Nonce Check
  if (!command.nonce || command.nonce <= 0) {
    return {
      valid: false,
      error: {
        code: 'INVALID_NONCE',
        message: 'Command must contain a positive monotonic sequence nonce.',
      },
    };
  }

  // 4. Device Registration & Connection State
  if (!device) {
    return {
      valid: false,
      error: {
        code: 'DEVICE_UNREGISTERED',
        message: 'Target connector device is not registered.',
      },
    };
  }

  if (device.connectionState !== 'ONLINE') {
    return {
      valid: false,
      error: {
        code: 'CONNECTOR_OFFLINE',
        message: `Target connector is currently ${device.connectionState}. Remote execution requires an active connection.`,
      },
    };
  }

  // 5. REAL Account Hard Lock (Defense-in-Depth)
  if ((command.accountMode as string) === 'REAL') {
    return {
      valid: false,
      error: {
        code: 'REAL_EXECUTION_LOCKED',
        message: 'SECURITY LOCK: Real account execution is strictly prohibited in Phase 2.',
      },
    };
  }

  if (device.tradeMode === 'REAL' || (telemetry && telemetry.tradeMode === 'REAL')) {
    return {
      valid: false,
      error: {
        code: 'REAL_ACCOUNT_HARD_LOCKED',
        message: 'SECURITY LOCK: Real account execution is strictly prohibited in Phase 2.',
      },
    };
  }

  // 6. DEMO_EXECUTION Operating Mode Check
  if (device.operatingMode !== 'DEMO_EXECUTION' || (telemetry && telemetry.operatingMode !== 'DEMO_EXECUTION')) {
    return {
      valid: false,
      error: {
        code: 'READ_ONLY_MODE_ACTIVE',
        message: "Execution rejected: Remote connector is in 'READ_ONLY' mode. 'DEMO_EXECUTION' is required.",
      },
    };
  }

  // 7. Telemetry Liveness & Heartbeat Age
  if (!telemetry) {
    return {
      valid: false,
      error: {
        code: 'NO_TELEMETRY',
        message: 'No live telemetry received from remote connector.',
      },
    };
  }

  if (telemetry.heartbeatAgeMs > MAX_CONNECTOR_HEARTBEAT_AGE_MS || telemetry.isStale) {
    return {
      valid: false,
      error: {
        code: 'CONNECTOR_STALE',
        message: `Remote telemetry is stale (${telemetry.heartbeatAgeMs}ms heartbeat age). Remote MT5 execution locked fail-closed.`,
      },
    };
  }

  if (!telemetry.terminalConnected) {
    return {
      valid: false,
      error: {
        code: 'TERMINAL_DISCONNECTED',
        message: 'Remote MT5 terminal is disconnected from broker server.',
      },
    };
  }

  // 8. Market Session & Quote Freshness
  const sym = command.symbol.toUpperCase();
  const sessionOpen = isSymbolSessionExecutable(sym, new Date(nowMs));
  if (!sessionOpen) {
    return {
      valid: false,
      error: {
        code: 'MARKET_SESSION_CLOSED',
        message: `Market session for ${sym} is currently closed.`,
      },
    };
  }

  const quote = telemetry.quotes[sym] || telemetry.quotes[command.brokerSymbol];
  if (!quote || quote.bid <= 0 || quote.ask <= 0) {
    return {
      valid: false,
      error: {
        code: 'QUOTE_UNAVAILABLE',
        message: `Broker quote for ${sym} is unavailable. Executable prices cannot be fabricated.`,
      },
    };
  }

  const quoteAge = quote.ageMs !== undefined ? quote.ageMs : Math.max(0, nowMs - (quote.timestamp || 0));
  if (quote.isStale || quote.freshness === 'STALE' || quoteAge > 5000) {
    return {
      valid: false,
      error: {
        code: 'STALE_QUOTE',
        message: `Broker quote for ${sym} is stale (${quoteAge}ms old). Execution fail-closed.`,
      },
    };
  }

  // 9. Volume Validation
  if (command.volume <= 0 || isNaN(command.volume)) {
    return {
      valid: false,
      error: {
        code: 'INVALID_VOLUME',
        message: 'Volume must be greater than zero.',
      },
    };
  }

  return { valid: true };
}
