/**
 * Canonical V1.3 MT5 Execution Policy: Confirmed Human Execution Gate
 *
 * Invariants:
 * 1. Mode: CONFIRMED_HUMAN_EXECUTION.
 * 2. Automated Transmission: STRICTLY FORBIDDEN (AUTOMATIC_DISPATCH_ALLOWED = false).
 * 3. Human Confirmation: Mandatory cryptographic, single-use, 60s TTL token bound to order fingerprint.
 * 4. Unconfirmed / Programmatic Orders: Fail-closed with CONFIRMATION_REQUIRED or AUTOMATIC_DISPATCH_FORBIDDEN.
 */

export const CANONICAL_EXECUTION_MODE = 'CONFIRMED_HUMAN_EXECUTION' as const;
export const AUTOMATIC_DISPATCH_ALLOWED = false as const;
export const MT5_ORDER_TRANSPORT_ENABLED = false as const; // Legacy flag for unconfirmed transport

export const CONFIRMATION_REQUIRED_ERROR = {
  code: 'CONFIRMATION_REQUIRED',
  message: 'FEF CORTEX V1.3 requires explicit human confirmation via single-use cryptographic token.',
} as const;

export const AUTOMATIC_DISPATCH_FORBIDDEN_ERROR = {
  code: 'AUTOMATIC_DISPATCH_FORBIDDEN',
  message: 'Autonomous or programmatic order transmission is permanently disabled.',
} as const;

// Backward-compatible alias for existing security audit references
export const READ_ONLY_EXECUTION_ERROR = {
  code: 'GLOBAL_READ_ONLY_LOCK',
  message: 'FEF CORTEX unconfirmed order transport is locked. Explicit single-use human confirmation required.',
} as const;

export interface ExecutionContext {
  hasValidConfirmation?: boolean;
  isAutomatic?: boolean;
  humanConfirmed?: boolean;
  confirmationToken?: string;
}

export function isMt5OrderTransportAllowed(context?: ExecutionContext): boolean {
  if (context?.isAutomatic === true) return false;
  return Boolean(context?.hasValidConfirmation && context?.humanConfirmed);
}

export function evaluateMt5ExecutionPermission(context?: ExecutionContext) {
  if (context?.isAutomatic === true) {
    return {
      allowed: false,
      operatingMode: CANONICAL_EXECUTION_MODE,
      error: AUTOMATIC_DISPATCH_FORBIDDEN_ERROR,
    } as const;
  }

  if (!context?.hasValidConfirmation || !context?.humanConfirmed) {
    return {
      allowed: false,
      operatingMode: CANONICAL_EXECUTION_MODE,
      error: CONFIRMATION_REQUIRED_ERROR,
    } as const;
  }

  return {
    allowed: true,
    operatingMode: CANONICAL_EXECUTION_MODE,
    error: null,
  } as const;
}
