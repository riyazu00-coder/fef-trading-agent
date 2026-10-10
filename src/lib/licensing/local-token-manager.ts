import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import os from 'os';
import { ActivationTokenPayload, LICENSE_CONFIG } from './license-types';

const TOKEN_SIGNING_SECRET = process.env.FEF_TOKEN_SECRET || 'FEF_CORTEX_LOCAL_ACTIVATION_TOKEN_SECRET_V1';
const FALLBACK_STORAGE_FILE = path.resolve(os.homedir(), '.fef-cortex-activation.json');

/**
 * Sign token payload with HMAC-SHA256
 */
export function signTokenPayload(payload: Omit<ActivationTokenPayload, 'signature'>): ActivationTokenPayload {
  const content = `${payload.licenseId}:${payload.licenseKeyHash}:${payload.deviceFingerprint}:${payload.issuedAt}:${payload.lastValidatedAt}:${payload.expiresAt ?? 'LIFETIME'}`;
  const signature = crypto.createHmac('sha256', TOKEN_SIGNING_SECRET).update(content).digest('hex');
  return { ...payload, signature };
}

/**
 * Verify token payload signature
 */
export function verifyTokenPayload(token: ActivationTokenPayload): boolean {
  if (!token || !token.signature) return false;
  const content = `${token.licenseId}:${token.licenseKeyHash}:${token.deviceFingerprint}:${token.issuedAt}:${token.lastValidatedAt}:${token.expiresAt ?? 'LIFETIME'}`;
  const expectedSig = crypto.createHmac('sha256', TOKEN_SIGNING_SECRET).update(content).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(token.signature, 'utf8'), Buffer.from(expectedSig, 'utf8'));
}

/**
 * Store activation token.
 * On macOS: Attempts /usr/bin/security (macOS Keychain) first.
 * If Keychain is unavailable (or non-interactive shell), uses restricted file permission (0600) in user homedir.
 */
export function saveLocalActivationToken(token: ActivationTokenPayload): boolean {
  const tokenJson = JSON.stringify(token);

  if (os.platform() === 'darwin') {
    try {
      // Delete any previous item to prevent duplicates
      try {
        execSync(`/usr/bin/security delete-generic-password -s "${LICENSE_CONFIG.SERVICE_NAME}" -a "${LICENSE_CONFIG.KEYCHAIN_ACCOUNT}"`, {
          stdio: ['ignore', 'ignore', 'ignore'],
        });
      } catch {}

      // Add new item into login keychain (-w passes password)
      execSync(`/usr/bin/security add-generic-password -U -s "${LICENSE_CONFIG.SERVICE_NAME}" -a "${LICENSE_CONFIG.KEYCHAIN_ACCOUNT}" -w "${Buffer.from(tokenJson).toString('base64')}"`, {
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      return true;
    } catch {
      // Fallback to secure restricted file below
    }
  }

  // File fallback with strict 0600 mode
  try {
    fs.writeFileSync(FALLBACK_STORAGE_FILE, Buffer.from(tokenJson).toString('base64'), {
      encoding: 'utf8',
      mode: 0o600,
    });
    return true;
  } catch (err) {
    console.error('Failed to save local activation token:', err);
    return false;
  }
}

/**
 * Read local activation token.
 * Checks macOS Keychain first, falls back to secure file.
 */
export function loadLocalActivationToken(): ActivationTokenPayload | null {
  if (os.platform() === 'darwin') {
    try {
      const out = execSync(`/usr/bin/security find-generic-password -s "${LICENSE_CONFIG.SERVICE_NAME}" -a "${LICENSE_CONFIG.KEYCHAIN_ACCOUNT}" -w`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      if (out && out.trim()) {
        const decoded = Buffer.from(out.trim(), 'base64').toString('utf8');
        const parsed = JSON.parse(decoded) as ActivationTokenPayload;
        if (verifyTokenPayload(parsed)) {
          return parsed;
        }
      }
    } catch {}
  }

  // Fallback to secure file
  try {
    if (fs.existsSync(FALLBACK_STORAGE_FILE)) {
      const raw = fs.readFileSync(FALLBACK_STORAGE_FILE, 'utf8').trim();
      if (raw) {
        const decoded = Buffer.from(raw, 'base64').toString('utf8');
        const parsed = JSON.parse(decoded) as ActivationTokenPayload;
        if (verifyTokenPayload(parsed)) {
          return parsed;
        }
      }
    }
  } catch {}

  return null;
}

/**
 * Delete local activation token upon deactivation or revocation.
 */
export function clearLocalActivationToken(): void {
  if (os.platform() === 'darwin') {
    try {
      execSync(`/usr/bin/security delete-generic-password -s "${LICENSE_CONFIG.SERVICE_NAME}" -a "${LICENSE_CONFIG.KEYCHAIN_ACCOUNT}"`, {
        stdio: ['ignore', 'ignore', 'ignore'],
      });
    } catch {}
  }

  try {
    if (fs.existsSync(FALLBACK_STORAGE_FILE)) {
      fs.unlinkSync(FALLBACK_STORAGE_FILE);
    }
  } catch {}
}

