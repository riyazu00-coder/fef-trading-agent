import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

export const RETIRED_UNIVERSAL_TOKEN = 'fef_local_bridge_token_v1';
export const CREDENTIAL_VERSION = 1;

export interface DeviceIdentity {
  installationId: string;
  deviceId: string;
  bridgeToken: string;
  credentialVersion: number;
  createdAt: string;
  lastRotatedAt: string;
  platform: string;
  connectorVersion: string;
}

export interface TokenResolution {
  token: string | null;
  source: 'PROCESS_ENV' | 'ENV_LOCAL' | 'DEVICE_IDENTITY' | 'UNCONFIGURED';
  identity?: DeviceIdentity;
}

/**
 * Resolves the secure storage file path.
 */
export function getIdentityFilePath(): string {
  const homeDir = os.homedir();
  if (homeDir && fs.existsSync(homeDir)) {
    const fefDir = path.join(homeDir, '.fef');
    return path.join(fefDir, 'device-identity.json');
  }
  const fallbackDir = path.resolve(process.cwd(), '.bridge-runtime');
  return path.join(fallbackDir, 'device-identity.json');
}

function ensureSecureDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  } else if (process.platform !== 'win32') {
    try {
      fs.chmodSync(dirPath, 0o700);
    } catch {
      // Ignore
    }
  }
}

function writeSecureFile(filePath: string, data: DeviceIdentity): void {
  const dir = path.dirname(filePath);
  ensureSecureDirectory(dir);

  const jsonStr = JSON.stringify(data, null, 2);
  fs.writeFileSync(filePath, jsonStr, { mode: 0o600, encoding: 'utf8' });

  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {
      // Ignore
    }
  }
}

export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateDeviceId(): string {
  const cpus = os.cpus() || [];
  const model = cpus[0]?.model || 'unknown';
  const rawId = `${os.hostname()}-${model}-${os.platform()}-${os.arch()}-${os.userInfo().username}`;
  return 'fef-' + crypto.createHash('sha256').update(rawId).digest('hex').slice(0, 16);
}

export function loadOrCreateDeviceIdentity(options: {
  customPath?: string;
  forceNew?: boolean;
} = {}): DeviceIdentity {
  const filePath = options.customPath || getIdentityFilePath();

  if (!options.forceNew && fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const identity = JSON.parse(content) as DeviceIdentity;

      if (
        identity &&
        typeof identity.bridgeToken === 'string' &&
        identity.bridgeToken.length >= 32 &&
        identity.bridgeToken !== RETIRED_UNIVERSAL_TOKEN
      ) {
        if (process.platform !== 'win32') {
          try {
            const stats = fs.statSync(filePath);
            const mode = stats.mode & 0o777;
            if (mode !== 0o600) {
              fs.chmodSync(filePath, 0o600);
            }
          } catch {
            // Ignore
          }
        }
        return identity;
      }
    } catch {
      // Fall through to re-provision
    }
  }

  const newIdentity: DeviceIdentity = {
    installationId: crypto.randomUUID(),
    deviceId: generateDeviceId(),
    bridgeToken: generateSecureToken(),
    credentialVersion: CREDENTIAL_VERSION,
    createdAt: new Date().toISOString(),
    lastRotatedAt: new Date().toISOString(),
    platform: process.platform,
    connectorVersion: '1.21',
  };

  writeSecureFile(filePath, newIdentity);
  return newIdentity;
}

export function rotateDeviceIdentity(options: { customPath?: string } = {}): DeviceIdentity {
  const filePath = options.customPath || getIdentityFilePath();
  let existing: Partial<DeviceIdentity> = {};
  if (fs.existsSync(filePath)) {
    try {
      existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      // Ignore
    }
  }

  const updatedIdentity: DeviceIdentity = {
    installationId: existing.installationId || crypto.randomUUID(),
    deviceId: existing.deviceId || generateDeviceId(),
    bridgeToken: generateSecureToken(),
    credentialVersion: (existing.credentialVersion || CREDENTIAL_VERSION) + 1,
    createdAt: existing.createdAt || new Date().toISOString(),
    lastRotatedAt: new Date().toISOString(),
    platform: process.platform,
    connectorVersion: '1.21',
  };

  writeSecureFile(filePath, updatedIdentity);
  return updatedIdentity;
}

export function resolveActiveBridgeToken(options: { customPath?: string } = {}): TokenResolution {
  const envToken = (process.env.FEF_BRIDGE_TOKEN || '').trim();
  if (envToken && envToken !== RETIRED_UNIVERSAL_TOKEN) {
    return { token: envToken, source: 'PROCESS_ENV' };
  }

  const envLocalPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envLocalPath)) {
    try {
      const content = fs.readFileSync(envLocalPath, 'utf8');
      const match = content.match(/FEF_BRIDGE_TOKEN=["']?([^"'\r\n]+)["']?/);
      if (match) {
        const fileToken = match[1].trim();
        if (fileToken && fileToken !== RETIRED_UNIVERSAL_TOKEN) {
          return { token: fileToken, source: 'ENV_LOCAL' };
        }
      }
    } catch {
      // Ignore
    }
  }

  const identity = loadOrCreateDeviceIdentity(options);
  if (identity && identity.bridgeToken && identity.bridgeToken !== RETIRED_UNIVERSAL_TOKEN) {
    return { token: identity.bridgeToken, source: 'DEVICE_IDENTITY', identity };
  }

  return { token: null, source: 'UNCONFIGURED' };
}

/**
 * Detects known MetaTrader 5 MQL5/Files directories on the host workstation.
 */
export function detectMt5FilesDirectories(): string[] {
  const dirs: string[] = [];
  const home = os.homedir();

  // 1. macOS Wine prefix standard installation path
  const macWineFiles = path.join(
    home,
    'Library/Application Support/net.metaquotes.wine.metatrader5/drive_c/Program Files/MetaTrader 5/MQL5/Files'
  );
  if (fs.existsSync(macWineFiles)) {
    dirs.push(macWineFiles);
  }

  // 2. macOS Wine Common Files path
  const macWineCommonFiles = path.join(
    home,
    'Library/Application Support/net.metaquotes.wine.metatrader5/drive_c/users/user/AppData/Roaming/MetaQuotes/Terminal/Common/Files'
  );
  if (fs.existsSync(macWineCommonFiles)) {
    dirs.push(macWineCommonFiles);
  }

  // 3. Native Windows standard paths
  if (process.platform === 'win32') {
    const winProgFiles = 'C:\\Program Files\\MetaTrader 5\\MQL5\\Files';
    if (fs.existsSync(winProgFiles)) {
      dirs.push(winProgFiles);
    }
    const appData = process.env.APPDATA;
    if (appData) {
      const winCommon = path.join(appData, 'MetaQuotes\\Terminal\\Common\\Files');
      if (fs.existsSync(winCommon)) {
        dirs.push(winCommon);
      }
    }
  }

  return dirs;
}

/**
 * Atomically provisions the active device credential into the MT5 sandbox MQL5/Files area.
 */
export function provisionMt5SandboxCredential(options: {
  targetDirectory?: string;
  customPath?: string;
} = {}): { provisioned: boolean; paths: string[]; error?: string } {
  const resolution = resolveActiveBridgeToken(options);
  const token = (resolution.token || '').trim();

  if (!token || token === RETIRED_UNIVERSAL_TOKEN) {
    return {
      provisioned: false,
      paths: [],
      error: 'FAIL_CLOSED: No valid non-universal bridge token available to provision.',
    };
  }

  const targetDirs = options.targetDirectory ? [options.targetDirectory] : detectMt5FilesDirectories();
  if (targetDirs.length === 0) {
    return {
      provisioned: false,
      paths: [],
      error: 'NO_MT5_FILES_FOUND: Could not detect any MQL5/Files directory.',
    };
  }

  const writtenPaths: string[] = [];

  for (const filesDir of targetDirs) {
    try {
      const fefSubdir = path.join(filesDir, 'fef');
      ensureSecureDirectory(fefSubdir);

      const targetFile = path.join(fefSubdir, 'bridge-auth.dat');
      const tempFile = path.join(fefSubdir, `bridge-auth.dat.tmp.${process.pid}.${Date.now()}`);

      fs.writeFileSync(tempFile, token + '\n', { mode: 0o600, encoding: 'utf8' });
      if (process.platform !== 'win32') {
        try {
          fs.chmodSync(tempFile, 0o600);
        } catch {
          // Ignore
        }
      }

      fs.renameSync(tempFile, targetFile);

      if (process.platform !== 'win32') {
        try {
          fs.chmodSync(targetFile, 0o600);
        } catch {
          // Ignore
        }
      }

      writtenPaths.push(targetFile);
    } catch (err: any) {
      return {
        provisioned: false,
        paths: writtenPaths,
        error: `WRITE_FAILED: ${err.message}`,
      };
    }
  }

  return {
    provisioned: writtenPaths.length > 0,
    paths: writtenPaths,
  };
}
