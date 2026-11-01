/**
 * Canonical MT5 execution policy.
 *
 * Mode: ARMED_WITH_CONFIRMATION.
 * MT5 order transport is enabled when validated through human confirmation guard
 * with fail-closed trade protection invariants (strictly positive SL/TP1 and valid geometry).
 */
export type AccountTradeMode = 'DEMO' | 'REAL' | 'UNKNOWN';

/**
 * Authoritative operating mode exposed to users and gates.
 * Simplified strictly to DEMO, REAL, or UNKNOWN (fail-closed).
 */
export type SimplifiedExecutionMode = 'DEMO' | 'REAL' | 'UNKNOWN';

export const CANONICAL_EXECUTION_MODE = 'READ_ONLY' as const;
export const MT5_ORDER_TRANSPORT_ENABLED = false as const;

export const EXECUTION_GATE_ERRORS = {
  GLOBAL_READ_ONLY_LOCK: {
    code: 'GLOBAL_READ_ONLY_LOCK',
    message: 'MT5 order transport is currently disabled.',
  },
  ACCOUNT_MODE_UNKNOWN: {
    code: 'ACCOUNT_MODE_UNKNOWN',
    message: 'Execution blocked: Account trade mode is UNKNOWN or unverified. Order execution is prohibited.',
  },
  REAL_CONFIRMATION_REQUIRED: {
    code: 'REAL_CONFIRMATION_REQUIRED',
    message: 'Real account execution blocked: Explicit double confirmation of real capital risk is mandatory.',
  },
  HUMAN_APPROVAL_REQUIRED: {
    code: 'HUMAN_APPROVAL_REQUIRED',
    message: 'Execution rejected: Explicit human confirmation is required for all orders.',
  },
  MT5_NOT_CONNECTED: {
    code: 'MT5_NOT_CONNECTED',
    message: 'Execution rejected: MT5 terminal or bridge is not connected.',
  },
  LICENSE_REQUIRED: {
    code: 'LICENSE_REQUIRED',
    message: 'Execution blocked: Valid FEF CORTEX license is required on this computer.',
  },
  LICENSE_INVALID: {
    code: 'LICENSE_INVALID',
    message: 'Execution blocked: License key is invalid or unregistered.',
  },
  LICENSE_REVOKED: {
    code: 'LICENSE_REVOKED',
    message: 'Execution blocked: License has been revoked by the administrator.',
  },
  LICENSE_SUSPENDED: {
    code: 'LICENSE_SUSPENDED',
    message: 'Execution blocked: License has been temporarily suspended.',
  },
  LICENSE_EXPIRED: {
    code: 'LICENSE_EXPIRED',
    message: 'Execution blocked: License has expired.',
  },
  LICENSE_DEVICE_MISMATCH: {
    code: 'LICENSE_DEVICE_MISMATCH',
    message: 'Execution blocked: License is bound to a different computer (single-device policy).',
  },
  LICENSE_ALREADY_ACTIVATED_ON_ANOTHER_DEVICE: {
    code: 'LICENSE_ALREADY_ACTIVATED_ON_ANOTHER_DEVICE',
    message: 'Execution blocked: License is already active on another computer.',
  },
  LICENSE_VALIDATION_UNAVAILABLE: {
    code: 'LICENSE_VALIDATION_UNAVAILABLE',
    message: 'Execution blocked: License validation is unavailable and offline grace period has expired.',
  },
} as const;

export const READ_ONLY_EXECUTION_ERROR = EXECUTION_GATE_ERRORS.GLOBAL_READ_ONLY_LOCK;

export function normalizeAccountTradeMode(rawMode?: string | number | null): AccountTradeMode {
  if (rawMode === undefined || rawMode === null) return 'UNKNOWN';
  if (typeof rawMode === 'number') {
    if (rawMode === 0) return 'DEMO';
    if (rawMode === 1 || rawMode === 2) return 'REAL';
    return 'UNKNOWN';
  }
  const clean = String(rawMode).trim().toUpperCase();
  if (clean === 'DEMO' || clean === 'CONTEST') return 'DEMO';
  if (clean === 'REAL') return 'REAL';
  return 'UNKNOWN';
}

export interface AccountExecutionValidationResult {
  allowed: boolean;
  mode: AccountTradeMode;
  error: { code: string; message: string } | null;
}

export function validateAccountExecutionMode(
  reportedMode?: string | number | null,
  humanApproved?: boolean,
  realConfirmed?: boolean
): AccountExecutionValidationResult {
  const mode = normalizeAccountTradeMode(reportedMode);

  if (mode === 'UNKNOWN') {
    return {
      allowed: false,
      mode: 'UNKNOWN',
      error: EXECUTION_GATE_ERRORS.ACCOUNT_MODE_UNKNOWN,
    };
  }

  if (!humanApproved) {
    return {
      allowed: false,
      mode,
      error: EXECUTION_GATE_ERRORS.HUMAN_APPROVAL_REQUIRED,
    };
  }

  if (mode === 'REAL') {
    if (!realConfirmed) {
      return {
        allowed: false,
        mode: 'REAL',
        error: EXECUTION_GATE_ERRORS.REAL_CONFIRMATION_REQUIRED,
      };
    }
    return {
      allowed: true,
      mode: 'REAL',
      error: null,
    };
  }

  // DEMO mode with human confirmation
  return {
    allowed: true,
    mode: 'DEMO',
    error: null,
  };
}

export interface LicensedExecutionGateResult {
  allowed: boolean;
  mode: AccountTradeMode;
  error: { code: string; message: string } | null;
}

/**
 * Composite Execution Gate:
 * LICENSE VALID
 * AND
 * MT5 CONNECTED
 * AND
 * ACCOUNT MODE VERIFIED
 * AND
 * TRADE VALID (SL/TP Geometry + Quote Freshness)
 * AND
 * HUMAN CONFIRMATION (plus REAL Double-Confirmation for Real accounts)
 */
export function validateLicensedExecution(params: {
  isLicensed: boolean;
  licenseErrorCode?: string;
  reportedMode?: string | number | null;
  humanApproved?: boolean;
  realConfirmed?: boolean;
}): LicensedExecutionGateResult {
  if (!params.isLicensed) {
    const errCode = (params.licenseErrorCode as keyof typeof EXECUTION_GATE_ERRORS) || 'LICENSE_REQUIRED';
    const err = EXECUTION_GATE_ERRORS[errCode] || EXECUTION_GATE_ERRORS.LICENSE_REQUIRED;
    return {
      allowed: false,
      mode: normalizeAccountTradeMode(params.reportedMode),
      error: err,
    };
  }

  const accountValidation = validateAccountExecutionMode(
    params.reportedMode,
    params.humanApproved,
    params.realConfirmed
  );

  return {
    allowed: accountValidation.allowed,
    mode: accountValidation.mode,
    error: accountValidation.error,
  };
}

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

