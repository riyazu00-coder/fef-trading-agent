/**
 * Canonical MT5 execution policy.
 *
 * Mode: ARMED_WITH_CONFIRMATION.
 * MT5 order transport is enabled when validated through human confirmation guard
 * with fail-closed trade protection invariants (strictly positive SL/TP1 and valid geometry).
 */
export const CANONICAL_EXECUTION_MODE = 'ARMED_WITH_CONFIRMATION' as const;
export const MT5_ORDER_TRANSPORT_ENABLED = true as const;
export const READ_ONLY_EXECUTION_ERROR = {
  code: 'GLOBAL_READ_ONLY_LOCK',
  message: 'MT5 order transport is currently disabled.',
} as const;

export function isMt5OrderTransportAllowed(): boolean {
  return MT5_ORDER_TRANSPORT_ENABLED;
}

export function evaluateMt5ExecutionPermission() {
  return {
    allowed: isMt5OrderTransportAllowed(),
    operatingMode: CANONICAL_EXECUTION_MODE,
    error: isMt5OrderTransportAllowed() ? null : READ_ONLY_EXECUTION_ERROR,
  } as const;
}

