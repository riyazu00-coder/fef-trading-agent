/**
 * FEF TRADING SOLUTIONS — CANONICAL LICENSING TYPES & ERROR CODES
 *
 * Enforces single-device licensing:
 * ONE LICENSE KEY = ONE COMMUNITY MEMBER = ONE COMPUTER
 */

export type LicenseStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED';

export type LicenseErrorCode =
  | 'LICENSE_REQUIRED'
  | 'LICENSE_INVALID'
  | 'LICENSE_REVOKED'
  | 'LICENSE_SUSPENDED'
  | 'LICENSE_EXPIRED'
  | 'LICENSE_DEVICE_MISMATCH'
  | 'LICENSE_ALREADY_ACTIVATED_ON_ANOTHER_DEVICE'
  | 'LICENSE_VALIDATION_UNAVAILABLE'
  | 'LICENSE_VALID';

export type UserRole = 'MASTER' | 'MEMBER';
export type MemberStatus = 'ACTIVE' | 'SUSPENDED';

export interface MemberRecord {
  memberId: string;
  email: string;
  username?: string | null; // Alphanumeric with underscore and period, case-normalized
  passwordHash: string; // SHA-256 salted hash of password
  name: string;
  role: UserRole; // 'MASTER' (Owner) | 'MEMBER' (Community)
  status: MemberStatus; // 'ACTIVE' | 'SUSPENDED'
  mustChangePassword?: boolean; // Flag requiring password update on next login
  assignedLicenseId: string | null; // License ID assigned to this member (null for MASTER)
  createdAt: number;
  lastLoginAt?: number | null;
}

export interface MemberSession {
  memberId: string;
  email: string;
  username?: string | null;
  name: string;
  role: UserRole;
  status: MemberStatus;
  mustChangePassword?: boolean;
  assignedLicenseId: string | null;
  token: string; // HMAC-signed session token
  expiresAt: number;
}

export interface LicenseRecord {
  licenseId: string;
  licenseKeyHash: string; // SHA-256 of normalized license key (FEF-XXXX-XXXX-XXXX-XXXX)
  licenseKeyPrefix: string; // e.g. "FEF-A1B2" for human-readable admin reference
  status: LicenseStatus;
  maxDevices: number; // Always 1
  activatedDeviceHash: string | null; // SHA-256 privacy-preserving device fingerprint
  activatedAt: number | null; // Unix timestamp ms
  lastValidatedAt: number | null; // Unix timestamp ms
  customerName?: string;
  customerEmail?: string;
  createdAt: number;
  expiresAt: number | null; // Nullable for lifetime access
  notes?: string;
}

export interface ActivationTokenPayload {
  licenseId: string;
  licenseKeyHash: string;
  deviceFingerprint: string;
  issuedAt: number;
  lastValidatedAt: number;
  expiresAt: number | null;
  signature: string; // HMAC-SHA256 signature to prevent tampering
}

export interface LicenseValidationResult {
  valid: boolean;
  status: LicenseStatus | 'UNLICENSED' | 'ERROR';
  code: LicenseErrorCode;
  message: string;
  isOfflineGrace?: boolean;
  licenseId?: string;
  customerName?: string;
  expiresAt?: number | null;
}

export interface DeviceIdentity {
  platform: 'darwin' | 'win32' | 'linux' | string;
  fingerprint: string; // SHA-256 salted hash, never raw hardware ID
}

export const LICENSE_CONFIG = {
  OFFLINE_GRACE_PERIOD_MS: 72 * 60 * 60 * 1000, // 72 hours (3 days)
  MAX_DEVICES_PER_LICENSE: 1,
  LICENSE_KEY_REGEX: /^FEF-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/,
  SERVICE_NAME: 'FEF_CORTEX_LICENSE_SERVICE',
  KEYCHAIN_ACCOUNT: 'fef_cortex_device_token',
};

