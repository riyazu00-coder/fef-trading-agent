/**
 * Canonical V1.1.2-S MT5 execution policy.
 *
 * This release is telemetry/analysis only. Client approval, evidence, account
 * type, signatures, and valid geometry provide context but never authority.
 */
export const CANONICAL_EXECUTION_MODE = 'READ_ONLY' as const;
export const MT5_ORDER_TRANSPORT_ENABLED = false as const;
export const READ_ONLY_EXECUTION_ERROR = {
  code: 'GLOBAL_READ_ONLY_LOCK',
  message: 'FEF CORTEX V1.1.2-S is READ_ONLY / TELEMETRY ONLY. All MT5 order transport is disabled.',
} as const;

export function isMt5OrderTransportAllowed(): boolean {
  return MT5_ORDER_TRANSPORT_ENABLED;
}

export function evaluateMt5ExecutionPermission() {
  return {
    allowed: isMt5OrderTransportAllowed(),
    operatingMode: CANONICAL_EXECUTION_MODE,
    error: READ_ONLY_EXECUTION_ERROR,
  } as const;
}
