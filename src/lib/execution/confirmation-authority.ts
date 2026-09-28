/**
 * FEF CORTEX — MANDATORY ORDER CONFIRMATION AUTHORITY (V1.3)
 * 
 * Cryptographic, fingerprint-bound single-use confirmation gate for all MT5 order dispatches.
 * 
 * INVARIANTS:
 * 1. Zero Automatic Dispatch: Autonomous or programmatic order dispatch is strictly prohibited.
 * 2. Cryptographic Fingerprint: Every order is bound to an HMAC-SHA256 fingerprint encompassing:
 *    symbol, direction, orderType, volume, entry, SL, TP1-3, account, server, and nonce.
 * 3. Single-Use Invariant: Once verified and consumed, a confirmation token can NEVER be reused.
 * 4. Time-to-Live (TTL): Confirmation artifacts expire after 60 seconds (fail-closed).
 * 5. Tamper Resistance: Any mutation in volume, SL, TP, or direction between preparation and
 *    submission invalidates the fingerprint immediately (TICKET_FINGERPRINT_MISMATCH).
 */

import crypto from 'crypto';

export interface OrderConfirmationInput {
  canonicalSymbol: string;
  brokerSymbol?: string;
  direction: 'BUY' | 'SELL';
  orderType?: string;
  volume: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  takeProfit3?: number;
  accountId?: string | number;
  brokerServer?: string;
  tradeMode?: 'DEMO' | 'REAL';
  evidenceTrust?: number;
  clientOrigin?: string;
  humanConfirmed?: boolean;
  isAutomatic?: boolean;
}

export interface OrderConfirmationArtifact {
  token: string;
  fingerprint: string;
  createdAt: number;
  expiresAt: number;
  ttlSeconds: number;
  order: {
    canonicalSymbol: string;
    brokerSymbol: string;
    direction: 'BUY' | 'SELL';
    orderType: string;
    volume: number;
    entryPrice: number;
    stopLoss: number;
    takeProfit1: number;
    takeProfit2?: number;
    takeProfit3?: number;
    accountId: string;
    brokerServer: string;
    tradeMode: 'DEMO' | 'REAL';
    evidenceTrust: number;
    nonce: string;
  };
  summary: {
    symbol: string;
    direction: 'BUY' | 'SELL';
    lots: number;
    entry: number;
    sl: number;
    tp1: number;
    accountMode: 'DEMO' | 'REAL';
    isRealAccount: boolean;
  };
}

export interface ConfirmationVerificationResult {
  valid: boolean;
  errorCode?:
    | 'CONFIRMATION_REQUIRED'
    | 'CONFIRMATION_EXPIRED'
    | 'CONFIRMATION_ALREADY_USED'
    | 'CONFIRMATION_NOT_FOUND'
    | 'TICKET_FINGERPRINT_MISMATCH'
    | 'AUTOMATIC_DISPATCH_FORBIDDEN'
    | 'HUMAN_CONFIRMATION_MISSING'
    | 'INVALID_CONFIRMATION_PAYLOAD';
  message?: string;
  artifact?: OrderConfirmationArtifact;
}

interface StoredConfirmation {
  artifact: OrderConfirmationArtifact;
  consumed: boolean;
  consumedAt?: number;
}

// In-memory token store
const confirmationStore = new Map<string, StoredConfirmation>();

// Server-side HMAC secret: generated on startup or read from environment
const SERVER_CONFIRMATION_SECRET =
  process.env.FEF_CONFIRMATION_SECRET ||
  process.env.FEF_REMOTE_DEVICE_SECRET ||
  crypto.randomBytes(32).toString('hex');

/**
 * Periodically purge expired tokens to avoid unbounded memory growth
 */
function pruneExpiredTokens(): void {
  const now = Date.now();
  const toDelete: string[] = [];
  confirmationStore.forEach((item, token) => {
    if (now > item.artifact.expiresAt + 60_000) {
      toDelete.push(token);
    }
  });
  toDelete.forEach((t) => confirmationStore.delete(t));
}

/**
 * Computes deterministic HMAC-SHA256 fingerprint of order parameters
 */
export function computeOrderFingerprint(
  params: {
    canonicalSymbol: string;
    brokerSymbol: string;
    direction: 'BUY' | 'SELL';
    orderType: string;
    volume: number;
    entryPrice: number;
    stopLoss: number;
    takeProfit1: number;
    takeProfit2?: number;
    takeProfit3?: number;
    accountId: string;
    brokerServer: string;
    tradeMode: string;
    nonce: string;
    expiresAt: number;
  },
  secret: string = SERVER_CONFIRMATION_SECRET
): string {
  const canonicalString = [
    params.canonicalSymbol.trim().toUpperCase(),
    params.brokerSymbol.trim().toUpperCase(),
    params.direction.trim().toUpperCase(),
    params.orderType.trim().toUpperCase(),
    Number(params.volume).toFixed(2),
    Number(params.entryPrice).toFixed(5),
    Number(params.stopLoss).toFixed(5),
    Number(params.takeProfit1).toFixed(5),
    params.takeProfit2 != null ? Number(params.takeProfit2).toFixed(5) : '0.00000',
    params.takeProfit3 != null ? Number(params.takeProfit3).toFixed(5) : '0.00000',
    String(params.accountId || 'DEMO_ACCOUNT').trim(),
    String(params.brokerServer || 'MT5_SERVER').trim(),
    String(params.tradeMode || 'DEMO').trim().toUpperCase(),
    params.nonce,
    String(params.expiresAt),
  ].join('|');

  return crypto.createHmac('sha256', secret).update(canonicalString).digest('hex');
}

/**
 * Generates an immutable, cryptographic Order Confirmation Artifact
 * with a 60-second TTL.
 */
export function generateOrderConfirmation(
  input: OrderConfirmationInput,
  ttlSeconds: number = 60
): OrderConfirmationArtifact {
  pruneExpiredTokens();

  if (input.isAutomatic === true) {
    throw new Error('AUTOMATIC_DISPATCH_FORBIDDEN: Automated processes may not generate order confirmation tokens.');
  }

  const now = Date.now();
  const expiresAt = now + ttlSeconds * 1000;
  const nonce = `NONCE-${now}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const canonicalSymbol = input.canonicalSymbol.trim().toUpperCase();
  const brokerSymbol = (input.brokerSymbol || input.canonicalSymbol).trim().toUpperCase();
  const direction = input.direction.trim().toUpperCase() as 'BUY' | 'SELL';
  const orderType = (input.orderType || input.direction).trim().toUpperCase();
  const volume = Number(input.volume);
  const entryPrice = Number(input.entryPrice);
  const stopLoss = Number(input.stopLoss);
  const takeProfit1 = Number(input.takeProfit1);
  const takeProfit2 = input.takeProfit2 != null ? Number(input.takeProfit2) : undefined;
  const takeProfit3 = input.takeProfit3 != null ? Number(input.takeProfit3) : undefined;
  const accountId = String(input.accountId || 'MT5-DEMO-GATE');
  const brokerServer = String(input.brokerServer || 'MT5-SERVER');
  const tradeMode = (input.tradeMode || 'DEMO').toUpperCase() as 'DEMO' | 'REAL';
  const evidenceTrust = typeof input.evidenceTrust === 'number' ? input.evidenceTrust : 70;

  const fingerprint = computeOrderFingerprint({
    canonicalSymbol,
    brokerSymbol,
    direction,
    orderType,
    volume,
    entryPrice,
    stopLoss,
    takeProfit1,
    takeProfit2,
    takeProfit3,
    accountId,
    brokerServer,
    tradeMode,
    nonce,
    expiresAt,
  });

  const token = `CONF-${crypto.randomBytes(16).toString('hex')}`;

  const artifact: OrderConfirmationArtifact = {
    token,
    fingerprint,
    createdAt: now,
    expiresAt,
    ttlSeconds,
    order: {
      canonicalSymbol,
      brokerSymbol,
      direction,
      orderType,
      volume,
      entryPrice,
      stopLoss,
      takeProfit1,
      takeProfit2,
      takeProfit3,
      accountId,
      brokerServer,
      tradeMode,
      evidenceTrust,
      nonce,
    },
    summary: {
      symbol: canonicalSymbol,
      direction,
      lots: volume,
      entry: entryPrice,
      sl: stopLoss,
      tp1: takeProfit1,
      accountMode: tradeMode,
      isRealAccount: tradeMode === 'REAL',
    },
  };

  confirmationStore.set(token, {
    artifact,
    consumed: false,
  });

  return artifact;
}

/**
 * Validates and permanently consumes a confirmation token.
 * Single-use invariant: once consumed, subsequent calls with the same token fail immediately.
 */
export function verifyAndConsumeConfirmationToken(
  token: string | undefined | null,
  incomingOrder: Partial<OrderConfirmationInput>
): ConfirmationVerificationResult {
  pruneExpiredTokens();

  if (!token) {
    return {
      valid: false,
      errorCode: 'CONFIRMATION_REQUIRED',
      message: 'Execution rejected: Mandatory single-use confirmation token is missing.',
    };
  }

  if (incomingOrder.isAutomatic === true) {
    return {
      valid: false,
      errorCode: 'AUTOMATIC_DISPATCH_FORBIDDEN',
      message: 'Execution rejected: Automatic order transmission is permanently disabled.',
    };
  }

  if (incomingOrder.humanConfirmed !== true) {
    return {
      valid: false,
      errorCode: 'HUMAN_CONFIRMATION_MISSING',
      message: 'Execution rejected: Explicit human confirmation acknowledgement is required.',
    };
  }

  const stored = confirmationStore.get(token);
  if (!stored) {
    return {
      valid: false,
      errorCode: 'CONFIRMATION_NOT_FOUND',
      message: 'Execution rejected: Confirmation token not recognized or already discarded.',
    };
  }

  if (stored.consumed) {
    return {
      valid: false,
      errorCode: 'CONFIRMATION_ALREADY_USED',
      message: 'Execution rejected: Confirmation token has already been consumed (single-use violation).',
    };
  }

  const now = Date.now();
  if (now > stored.artifact.expiresAt) {
    return {
      valid: false,
      errorCode: 'CONFIRMATION_EXPIRED',
      message: `Execution rejected: Confirmation token expired at ${new Date(stored.artifact.expiresAt).toISOString()}.`,
    };
  }

  // Recalculate fingerprint from stored artifact parameters and incoming order parameters
  const orig = stored.artifact.order;
  const incCanonical = (incomingOrder.canonicalSymbol || orig.canonicalSymbol).trim().toUpperCase();
  const incBroker = (incomingOrder.brokerSymbol || orig.brokerSymbol).trim().toUpperCase();
  const incDirection = (incomingOrder.direction || orig.direction).trim().toUpperCase() as 'BUY' | 'SELL';
  const incOrderType = (incomingOrder.orderType || orig.orderType).trim().toUpperCase();
  const incVolume = incomingOrder.volume != null ? Number(incomingOrder.volume) : orig.volume;
  const incEntry = incomingOrder.entryPrice != null ? Number(incomingOrder.entryPrice) : orig.entryPrice;
  const incSl = incomingOrder.stopLoss != null ? Number(incomingOrder.stopLoss) : orig.stopLoss;
  const incTp1 = incomingOrder.takeProfit1 != null ? Number(incomingOrder.takeProfit1) : orig.takeProfit1;
  const incTp2 = incomingOrder.takeProfit2 !== undefined ? (incomingOrder.takeProfit2 != null ? Number(incomingOrder.takeProfit2) : undefined) : orig.takeProfit2;
  const incTp3 = incomingOrder.takeProfit3 !== undefined ? (incomingOrder.takeProfit3 != null ? Number(incomingOrder.takeProfit3) : undefined) : orig.takeProfit3;

  const testFingerprint = computeOrderFingerprint({
    canonicalSymbol: incCanonical,
    brokerSymbol: incBroker,
    direction: incDirection,
    orderType: incOrderType,
    volume: incVolume,
    entryPrice: incEntry,
    stopLoss: incSl,
    takeProfit1: incTp1,
    takeProfit2: incTp2,
    takeProfit3: incTp3,
    accountId: orig.accountId,
    brokerServer: orig.brokerServer,
    tradeMode: orig.tradeMode,
    nonce: orig.nonce,
    expiresAt: stored.artifact.expiresAt,
  });

  if (testFingerprint !== stored.artifact.fingerprint) {
    return {
      valid: false,
      errorCode: 'TICKET_FINGERPRINT_MISMATCH',
      message: 'Execution rejected: Order parameters (volume, SL, TP, or direction) do not match confirmed fingerprint.',
    };
  }

  // CONSUME THE TOKEN — cannot be used again
  stored.consumed = true;
  stored.consumedAt = now;

  return {
    valid: true,
    artifact: stored.artifact,
  };
}

/**
 * Inspection utility for test suites and health status
 */
export function getConfirmationGateStatus(): {
  activeTokensCount: number;
  consumedTokensCount: number;
  canonicalMode: string;
} {
  let active = 0;
  let consumed = 0;
  const now = Date.now();
  confirmationStore.forEach((item) => {
    if (item.consumed) {
      consumed++;
    } else if (now <= item.artifact.expiresAt) {
      active++;
    }
  });
  return {
    activeTokensCount: active,
    consumedTokensCount: consumed,
    canonicalMode: 'CONFIRMED_HUMAN_EXECUTION',
  };
}

/**
 * Reset token store for deterministic test environments
 */
export function resetConfirmationStoreForTesting(): void {
  confirmationStore.clear();
}

export const confirmationAuthority = {
  generateOrderConfirmation,
  verifyAndConsumeConfirmationToken,
  verifyOrderConfirmationToken: verifyAndConsumeConfirmationToken,
  getConfirmationGateStatus,
  resetConfirmationStoreForTesting,
  computeOrderFingerprint,
};
