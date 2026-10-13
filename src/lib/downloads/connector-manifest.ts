export interface ConnectorBinaryManifest {
  filename: string;
  version: string;
  expectedSize: number;
  expectedSha256: string;
  releaseDate: string;
  minBridgeServiceVersion: string;
  supportedPlatforms: string[];
  mqlVersion: string;
  status: 'CURRENT' | 'UPDATE_AVAILABLE' | 'UNSUPPORTED';
}

export const CONNECTOR_RELEASE_MANIFEST: ConnectorBinaryManifest = {
  filename: 'FEF_HTTP_Bridge.ex5',
  version: '1.22',
  expectedSize: 101348,
  expectedSha256: '194d577313291a5dad2945888f1e24b7b8dd94104c9da88b79df9db5ecaf55f5',
  releaseDate: '2026-10-13',
  minBridgeServiceVersion: '1.20',
  supportedPlatforms: ['MT5 Windows Native', 'MT5 macOS Wine/CrossOver'],
  mqlVersion: 'MQL5 Native WebRequest (No DLL)',
  status: 'CURRENT',
};

export type VersionStatus = 'CURRENT' | 'UPDATE_AVAILABLE' | 'UNSUPPORTED';

/**
 * Classifies an installed connector version against current manifest version.
 */
export function classifyConnectorVersion(installedVersion: string | null | undefined): VersionStatus {
  if (!installedVersion) return 'UNSUPPORTED';
  const clean = installedVersion.trim().replace(/^v/i, '');
  if (clean === CONNECTOR_RELEASE_MANIFEST.version) {
    return 'CURRENT';
  }

  // Versions >= 1.0.0 but < 1.22 have update available
  const [major, minor] = clean.split('.').map(n => parseInt(n, 10));
  if (!isNaN(major) && !isNaN(minor)) {
    if (major > 1 || (major === 1 && minor > 22)) {
      return 'CURRENT'; // Newer development version
    }
    if (major === 1 && minor >= 0) {
      return 'UPDATE_AVAILABLE';
    }
  }

  return 'UNSUPPORTED';
}

/**
 * Validates the physical connector binary on disk against the release manifest.
 * Fails closed if the binary is missing, tampered with, size mismatch, or checksum mismatch.
 */
export function validateConnectorBinary(basePath: string = process.cwd()): {
  valid: boolean;
  filePath: string | null;
  error?: string;
  size?: number;
  sha256?: string;
  buffer?: Buffer;
} {
  const req = eval('require');
  const fs = req('fs');
  const path = req('path');
  const crypto = req('crypto');

  const primaryPath = path.resolve(basePath, 'storage/binaries', CONNECTOR_RELEASE_MANIFEST.filename);
  const fallbackPath = path.resolve(basePath, 'public/downloads', CONNECTOR_RELEASE_MANIFEST.filename);

  const filePath = fs.existsSync(primaryPath) ? primaryPath : (fs.existsSync(fallbackPath) ? fallbackPath : null);

  if (!filePath) {
    return {
      valid: false,
      filePath: null,
      error: 'FILE_NOT_FOUND: Connector binary missing from storage repository.',
    };
  }

  try {
    const buffer = fs.readFileSync(filePath);
    const actualSize = buffer.length;
    const actualSha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    if (actualSize !== CONNECTOR_RELEASE_MANIFEST.expectedSize) {
      return {
        valid: false,
        filePath,
        error: `SIZE_MISMATCH: Expected ${CONNECTOR_RELEASE_MANIFEST.expectedSize} bytes, got ${actualSize} bytes.`,
        size: actualSize,
        sha256: actualSha256,
      };
    }

    if (actualSha256.toLowerCase() !== CONNECTOR_RELEASE_MANIFEST.expectedSha256.toLowerCase()) {
      return {
        valid: false,
        filePath,
        error: `CHECKSUM_MISMATCH: Expected ${CONNECTOR_RELEASE_MANIFEST.expectedSha256}, got ${actualSha256}.`,
        size: actualSize,
        sha256: actualSha256,
      };
    }

    return {
      valid: true,
      filePath,
      size: actualSize,
      sha256: actualSha256,
      buffer,
    };
  } catch (err: any) {
    return {
      valid: false,
      filePath,
      error: `READ_ERROR: ${err.message}`,
    };
  }
}
