/**
 * FEF TRADING SOLUTIONS — LOCAL DEVICE IDENTITY & CREDENTIAL PROVISIONING
 *
 * Manages unique, cryptographically random per-device identity and local bridge tokens.
 *
 * Security Invariants:
 * 1. Storage Location:
 *    - Primary: $HOME/.fef/device-identity.json
 *    - Fallback: <project-root>/.bridge-runtime/device-identity.json
 * 2. File permissions: Strictly 0600 (read/write by owner only).
 * 3. Token Generation: 32 bytes (256-bit) cryptographically secure random hex string.
 * 4. Backward Compatibility: If FEF_BRIDGE_TOKEN is set in process.env or .env.local,
 *    it is respected as an override or grandfathered active token.
 * 5. Retired Universal Fallback Rejection: 'fef_local_bridge_token_v1' is ALWAYS rejected.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const RETIRED_UNIVERSAL_TOKEN = 'fef_local_bridge_token_v1';
const CREDENTIAL_VERSION = 1;

/**
 * Resolves the secure storage file path.
 */
function getIdentityFilePath() {
  const homeDir = os.homedir();
  if (homeDir && fs.existsSync(homeDir)) {
    const fefDir = path.join(homeDir, '.fef');
    return path.join(fefDir, 'device-identity.json');
  }
  // Fallback to project .bridge-runtime
  const fallbackDir = path.resolve(__dirname, '../.bridge-runtime');
  return path.join(fallbackDir, 'device-identity.json');
}

/**
 * Ensures directory exists and secures it with 0700 permissions.
 */
function ensureSecureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  } else {
    try {
      if (process.platform !== 'win32') {
        fs.chmodSync(dirPath, 0o700);
      }
    } catch (e) {
      // Ignore chmod errors if filesystem restricts it
    }
  }
}

/**
 * Writes data with strict 0600 file permissions.
 */
function writeSecureFile(filePath, data) {
  const dir = path.dirname(filePath);
  ensureSecureDirectory(dir);

  const jsonStr = JSON.stringify(data, null, 2);
  fs.writeFileSync(filePath, jsonStr, { mode: 0o600, encoding: 'utf8' });

  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(filePath, 0o600);
    } catch (e) {
      // Ignore
    }
  }
}

/**
 * Generates a high-entropy 256-bit cryptographically secure token.
 */
function generateSecureToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generates a stable machine-derived device fingerprint.
 */
function generateDeviceId() {
  const cpus = os.cpus() || [];
  const model = cpus[0] ? cpus[0].model : 'unknown';
  const rawId = `${os.hostname()}-${model}-${os.platform()}-${os.arch()}-${os.userInfo().username}`;
  return 'fef-' + crypto.createHash('sha256').update(rawId).digest('hex').slice(0, 16);
}

/**
 * Loads or automatically provisions a unique local device identity.
 * @param {object} options
 * @param {string} [options.customPath] - Optional custom path for testing
 * @param {boolean} [options.forceNew] - Force regeneration
 * @returns {object} identity object
 */
function loadOrCreateDeviceIdentity(options = {}) {
  const filePath = options.customPath || getIdentityFilePath();

  if (!options.forceNew && fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const identity = JSON.parse(content);

      // Validate identity structure and token validity
      if (
        identity &&
        typeof identity.bridgeToken === 'string' &&
        identity.bridgeToken.length >= 32 &&
        identity.bridgeToken !== RETIRED_UNIVERSAL_TOKEN
      ) {
        // Enforce 0600 permissions check/fix
        if (process.platform !== 'win32') {
          try {
            const stats = fs.statSync(filePath);
            const mode = stats.mode & 0o777;
            if (mode !== 0o600) {
              fs.chmodSync(filePath, 0o600);
            }
          } catch (e) {
            // Ignore
          }
        }
        return identity;
      }
    } catch (err) {
      // If corrupted, re-provision below
    }
  }

  // Provision new identity
  const newIdentity = {
    installationId: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'),
    deviceId: generateDeviceId(),
    bridgeToken: generateSecureToken(),
    credentialVersion: CREDENTIAL_VERSION,
    createdAt: new Date().toISOString(),
    lastRotatedAt: new Date().toISOString(),
    platform: process.platform,
    connectorVersion: '1.21'
  };

  writeSecureFile(filePath, newIdentity);
  return newIdentity;
}

/**
 * Rotates the device identity token.
 */
function rotateDeviceIdentity(options = {}) {
  const filePath = options.customPath || getIdentityFilePath();
  let existing = {};
  if (fs.existsSync(filePath)) {
    try {
      existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {}
  }

  const updatedIdentity = {
    ...existing,
    installationId: existing.installationId || (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex')),
    deviceId: existing.deviceId || generateDeviceId(),
    bridgeToken: generateSecureToken(),
    credentialVersion: (existing.credentialVersion || CREDENTIAL_VERSION) + 1,
    createdAt: existing.createdAt || new Date().toISOString(),
    lastRotatedAt: new Date().toISOString(),
    platform: process.platform,
    connectorVersion: '1.21'
  };

  writeSecureFile(filePath, updatedIdentity);
  return updatedIdentity;
}

/**
 * Resolves the active bridge token in order of precedence:
 * 1. process.env.FEF_BRIDGE_TOKEN (if present and not retired token)
 * 2. .env.local file content (if present and not retired token)
 * 3. ~/.fef/device-identity.json or .bridge-runtime/device-identity.json
 *
 * Fails closed if the only token available is 'fef_local_bridge_token_v1'.
 */
function resolveActiveBridgeToken(options = {}) {
  // Check process.env
  const envToken = (process.env.FEF_BRIDGE_TOKEN || '').trim();
  if (envToken && envToken !== RETIRED_UNIVERSAL_TOKEN) {
    return { token: envToken, source: 'PROCESS_ENV' };
  }

  // Check .env.local
  const envLocalPath = path.resolve(__dirname, '../.env.local');
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
    } catch (e) {}
  }

  // Load from device identity
  const identity = loadOrCreateDeviceIdentity(options);
  if (identity && identity.bridgeToken && identity.bridgeToken !== RETIRED_UNIVERSAL_TOKEN) {
    return { token: identity.bridgeToken, source: 'DEVICE_IDENTITY', identity };
  }

  return { token: null, source: 'UNCONFIGURED' };
}

/**
 * Detects known MetaTrader 5 MQL5/Files directories on the host workstation.
 */
function detectMt5FilesDirectories() {
  const dirs = [];
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
 * Artifact path: <MQL5/Files>/fef/bridge-auth.dat
 * File permissions: 0600 on POSIX host.
 * Format: Clean string token (with optional trailing newline), exactly matching active token.
 *
 * @param {object} [options]
 * @param {string} [options.targetDirectory] - Explicit target directory override
 * @returns {{ provisioned: boolean, paths: string[], error?: string }}
 */
function provisionMt5SandboxCredential(options = {}) {
  const resolution = resolveActiveBridgeToken();
  const token = (resolution.token || '').trim();

  if (!token || token === RETIRED_UNIVERSAL_TOKEN) {
    return {
      provisioned: false,
      paths: [],
      error: 'FAIL_CLOSED: No valid non-universal bridge token available to provision.'
    };
  }

  const targetDirs = options.targetDirectory ? [options.targetDirectory] : detectMt5FilesDirectories();
  if (targetDirs.length === 0) {
    return {
      provisioned: false,
      paths: [],
      error: 'NO_MT5_FILES_FOUND: Could not detect any MQL5/Files directory.'
    };
  }

  const writtenPaths = [];

  for (const filesDir of targetDirs) {
    try {
      const fefSubdir = path.join(filesDir, 'fef');
      ensureSecureDirectory(fefSubdir);

      const targetFile = path.join(fefSubdir, 'bridge-auth.dat');
      const tempFile = path.join(fefSubdir, `bridge-auth.dat.tmp.${process.pid}.${Date.now()}`);

      // Write atomically via temporary file
      fs.writeFileSync(tempFile, token + '\n', { mode: 0o600, encoding: 'utf8' });
      if (process.platform !== 'win32') {
        try { fs.chmodSync(tempFile, 0o600); } catch (e) {}
      }

      fs.renameSync(tempFile, targetFile);

      if (process.platform !== 'win32') {
        try { fs.chmodSync(targetFile, 0o600); } catch (e) {}
      }

      writtenPaths.push(targetFile);
    } catch (err) {
      return {
        provisioned: false,
        paths: writtenPaths,
        error: `WRITE_FAILED: ${err.message}`
      };
    }
  }

  return {
    provisioned: writtenPaths.length > 0,
    paths: writtenPaths
  };
}

module.exports = {
  RETIRED_UNIVERSAL_TOKEN,
  getIdentityFilePath,
  loadOrCreateDeviceIdentity,
  rotateDeviceIdentity,
  resolveActiveBridgeToken,
  generateSecureToken,
  generateDeviceId,
  detectMt5FilesDirectories,
  provisionMt5SandboxCredential
};
