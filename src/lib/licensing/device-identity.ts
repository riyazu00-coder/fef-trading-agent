import crypto from 'crypto';
import os from 'os';
import { execSync } from 'child_process';
import { DeviceIdentity } from './license-types';

const FINGERPRINT_SALT = process.env.FEF_DEVICE_SALT || 'FEF_CORTEX_STABLE_DEVICE_SALT_V1';

/**
 * Extract a stable machine identifier suitable for macOS first.
 * Windows and Linux abstractions included for future portability.
 * Raw hardware identifiers are NEVER exposed or uploaded.
 */
function getRawMachineId(): string {
  const platform = os.platform();

  if (platform === 'darwin') {
    try {
      // Primary: IOPlatformUUID from IORegistry (hardware mother board UUID)
      const out = execSync('ioreg -rd1 -c IOPlatformExpertDevice', {
        encoding: 'utf8',
        timeout: 2000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const match = out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
      if (match && match[1]) {
        return match[1].trim();
      }
    } catch {}

    try {
      // Fallback: System Profiler hardware UUID
      const out = execSync('system_profiler SPHardwareDataType', {
        encoding: 'utf8',
        timeout: 2000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const match = out.match(/Hardware UUID:\s*([^\s]+)/i);
      if (match && match[1]) {
        return match[1].trim();
      }
    } catch {}
  } else if (platform === 'win32') {
    try {
      // Windows: MachineGuid from Registry or wmic csproduct get uuid
      const out = execSync('wmic csproduct get uuid', {
        encoding: 'utf8',
        timeout: 2000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const lines = out.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length > 1 && lines[1]) {
        return lines[1];
      }
    } catch {}
  } else if (platform === 'linux') {
    try {
      // Linux: /etc/machine-id
      const fs = require('fs');
      if (fs.existsSync('/etc/machine-id')) {
        return fs.readFileSync('/etc/machine-id', 'utf8').trim();
      }
    } catch {}
  }

  // Stable OS-level fallback (hostname + cpus[0].model + homedir hash)
  const fallbackRaw = `${os.hostname()}:${os.cpus()[0]?.model || ''}:${os.homedir()}`;
  return fallbackRaw;
}

/**
 * Returns privacy-preserving cryptographic device identity.
 * Normalizes input, mixes with internal salt, and applies SHA-256.
 */
export function getDeviceIdentity(): DeviceIdentity {
  const rawId = getRawMachineId();
  const normalized = rawId.trim().toUpperCase();

  const hmac = crypto.createHmac('sha256', FINGERPRINT_SALT);
  hmac.update(`DEVICE:${os.platform()}:${normalized}`);
  const fingerprint = hmac.digest('hex');

  return {
    platform: os.platform(),
    fingerprint,
  };
}

/**
 * Generate a cryptographically secure random license key.
 * Format: FEF-XXXX-XXXX-XXXX-XXXX (Base32 Crockford uppercase: 0-9, A-Z without ambiguous letters I, O)
 */
export function generateLicenseKey(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const chunkLength = 4;
  const chunks: string[] = [];

  for (let c = 0; c < 4; c++) {
    const bytes = crypto.randomBytes(chunkLength);
    let chunk = '';
    for (let i = 0; i < chunkLength; i++) {
      chunk += alphabet[bytes[i] % alphabet.length];
    }
    chunks.push(chunk);
  }

  return `FEF-${chunks.join('-')}`;
}

/**
 * Hash license key using SHA-256 after normalization (trimmed, uppercase, single spaces).
 * Ensures license keys are NEVER stored or searched in plaintext.
 */
export function hashLicenseKey(licenseKey: string): string {
  const normalized = licenseKey.trim().toUpperCase();
  return crypto.createHash('sha256').update(`LICENSE:${normalized}`).digest('hex');
}

