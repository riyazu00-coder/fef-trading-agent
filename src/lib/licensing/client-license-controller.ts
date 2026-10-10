import { LicenseValidationResult, LICENSE_CONFIG } from './license-types';
import { getDeviceIdentity } from './device-identity';
import { loadLocalActivationToken, saveLocalActivationToken, clearLocalActivationToken } from './local-token-manager';
import { licenseService } from './license-service';

export class ClientLicenseController {
  /**
   * Fast startup check: verifies local token, checks offline grace, or validates with server.
   * Completely zero-touch for normal operation.
   */
  public evaluateClientLicense(): LicenseValidationResult {
    const localToken = loadLocalActivationToken();
    const currentDevice = getDeviceIdentity();

    if (!localToken) {
      return {
        valid: false,
        status: 'UNLICENSED',
        code: 'LICENSE_REQUIRED',
        message: 'No active license found on this computer. Activation is required.',
      };
    }

    // 1. Device match check
    if (localToken.deviceFingerprint !== currentDevice.fingerprint) {
      clearLocalActivationToken();
      return {
        valid: false,
        status: 'UNLICENSED',
        code: 'LICENSE_DEVICE_MISMATCH',
        message: 'License activation token belongs to a different computer.',
      };
    }

    // 2. Token expiry check
    if (localToken.expiresAt && Date.now() > localToken.expiresAt) {
      return {
        valid: false,
        status: 'EXPIRED',
        code: 'LICENSE_EXPIRED',
        message: 'License has expired.',
      };
    }

    // 3. Server-side validation
    try {
      const serverResult = licenseService.validate(localToken, currentDevice.fingerprint);
      if (!serverResult.valid) {
        // If server says revoked or expired, clear local token immediately
        if (serverResult.code === 'LICENSE_REVOKED' || serverResult.code === 'LICENSE_ALREADY_ACTIVATED_ON_ANOTHER_DEVICE') {
          clearLocalActivationToken();
        }
        return serverResult;
      }

      // Update local token lastValidatedAt
      localToken.lastValidatedAt = Date.now();
      saveLocalActivationToken(localToken);
      return serverResult;
    } catch {
      // 4. Offline Grace Period Evaluation
      // If server is unreachable but the token was previously validated within the grace period (72h)
      const timeSinceLastValidated = Date.now() - (localToken.lastValidatedAt || localToken.issuedAt);
      if (timeSinceLastValidated < LICENSE_CONFIG.OFFLINE_GRACE_PERIOD_MS) {
        return {
          valid: true,
          status: 'ACTIVE',
          code: 'LICENSE_VALID',
          message: 'License valid under offline grace period.',
          isOfflineGrace: true,
          licenseId: localToken.licenseId,
          expiresAt: localToken.expiresAt,
        };
      }

      return {
        valid: false,
        status: 'UNLICENSED',
        code: 'LICENSE_VALIDATION_UNAVAILABLE',
        message: 'License validation server unreachable and offline grace period expired.',
      };
    }
  }

  /**
   * Activate client with raw key
   */
  public activateClient(rawLicenseKey: string): { success: boolean; code?: string; message?: string } {
    const currentDevice = getDeviceIdentity();
    const result = licenseService.activate(rawLicenseKey, currentDevice.fingerprint);

    if (result.success && result.token) {
      saveLocalActivationToken(result.token);
      return { success: true, message: 'License activated successfully on this computer.' };
    }

    return { success: false, code: result.error, message: result.message };
  }

  /**
   * Deactivate/logout on this computer
   */
  public deactivateClient(): void {
    clearLocalActivationToken();
  }
}

export const clientLicenseController = new ClientLicenseController();

