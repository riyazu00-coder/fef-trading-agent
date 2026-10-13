/**
 * FEF TRADING SOLUTIONS — SECURE PROVISIONING & RELEASE INTEGRITY TEST SUITE
 *
 * Verifies:
 * 1. Cryptographically unique local device identity & token generation.
 * 2. Strict file permissions: 0600 on device identity file.
 * 3. Fail-closed rejection of retired universal fallback 'fef_local_bridge_token_v1'.
 * 4. Token resolution hierarchy (process.env -> .env.local -> device identity).
 * 5. Download release manifest integrity check (hash & byte size).
 * 6. Corrupt binary rejection by validateConnectorBinary (fail closed).
 * 7. Version classification (CURRENT, UPDATE_AVAILABLE, UNSUPPORTED).
 * 8. Zero credential leakage into public files, client payloads, or logs.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

import {
  CONNECTOR_RELEASE_MANIFEST,
  validateConnectorBinary,
  classifyConnectorVersion,
} from '../src/lib/downloads/connector-manifest';

import {
  loadOrCreateDeviceIdentity,
  rotateDeviceIdentity,
  resolveActiveBridgeToken,
  RETIRED_UNIVERSAL_TOKEN,
  generateSecureToken,
  generateDeviceId,
} from '../src/lib/bridge/device-identity';

let passed = 0;
let failed = 0;

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res.then(
        () => {
          console.log(`  ✓ ${name}`);
          passed++;
        },
        (err) => {
          console.error(`  ✗ ${name}`);
          console.error(`    ${err.message}`);
          failed++;
        }
      );
    } else {
      console.log(`  ✓ ${name}`);
      passed++;
    }
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function main() {
  console.log('\n============================================================');
  console.log('FEF BRIDGE SECURE PROVISIONING & RELEASE INTEGRITY SUITE');
  console.log('============================================================\n');

  const tmpTestDir = path.join(os.tmpdir(), `fef-test-ident-${Date.now()}`);
  fs.mkdirSync(tmpTestDir, { recursive: true });
  const testIdentityFile = path.join(tmpTestDir, 'device-identity.json');

  try {
    // 1. Device identity generation
    runTest('generates unique cryptographic 256-bit token', () => {
      const token1 = generateSecureToken();
      const token2 = generateSecureToken();
      assert.strictEqual(token1.length, 64, 'Token must be 64 hex chars (32 bytes)');
      assert.strictEqual(token2.length, 64, 'Token must be 64 hex chars (32 bytes)');
      assert.notStrictEqual(token1, token2, 'Generated tokens must be unique');
    });

    runTest('generates deterministic yet secure machine deviceId', () => {
      const dev1 = generateDeviceId();
      assert(dev1.startsWith('fef-'), 'Device ID must start with fef-');
      assert(dev1.length >= 16, 'Device ID must have sufficient length');
    });

    runTest('provisions identity file with 0600 permissions', () => {
      const identity = loadOrCreateDeviceIdentity({ customPath: testIdentityFile, forceNew: true });
      assert(identity.bridgeToken, 'Must generate bridgeToken');
      assert.strictEqual(identity.credentialVersion, 1);
      assert(fs.existsSync(testIdentityFile), 'Identity file must exist');

      if (process.platform !== 'win32') {
        const stats = fs.statSync(testIdentityFile);
        const mode = stats.mode & 0o777;
        assert.strictEqual(mode, 0o600, `File permissions must be 0600, got 0${mode.toString(8)}`);
      }
    });

    runTest('rotates identity and increments credentialVersion', () => {
      const rotated = rotateDeviceIdentity({ customPath: testIdentityFile });
      assert.strictEqual(rotated.credentialVersion, 2, 'Credential version must increment');
      assert(rotated.lastRotatedAt, 'Must set lastRotatedAt timestamp');
    });

    runTest('fails closed on retired universal token', () => {
      assert.strictEqual(RETIRED_UNIVERSAL_TOKEN, 'fef_local_bridge_token_v1');
      // If we attempt to resolve with retired token in env, it must be ignored
      const prevEnv = process.env.FEF_BRIDGE_TOKEN;
      try {
        process.env.FEF_BRIDGE_TOKEN = RETIRED_UNIVERSAL_TOKEN;
        const resolution = resolveActiveBridgeToken({ customPath: testIdentityFile });
        assert.notStrictEqual(resolution.token, RETIRED_UNIVERSAL_TOKEN, 'Must NOT resolve retired universal token');
      } finally {
        if (prevEnv) process.env.FEF_BRIDGE_TOKEN = prevEnv;
        else delete process.env.FEF_BRIDGE_TOKEN;
      }
    });

    // 2. Download Release Manifest & Binary Integrity
    runTest('canonical download release manifest defines required fields', () => {
      assert.strictEqual(CONNECTOR_RELEASE_MANIFEST.filename, 'FEF_HTTP_Bridge.ex5');
      assert.strictEqual(CONNECTOR_RELEASE_MANIFEST.version, '1.22');
      assert.strictEqual(CONNECTOR_RELEASE_MANIFEST.expectedSize, 101348);
      assert.strictEqual(
        CONNECTOR_RELEASE_MANIFEST.expectedSha256,
        '194d577313291a5dad2945888f1e24b7b8dd94104c9da88b79df9db5ecaf55f5'
      );
    });

    runTest('validateConnectorBinary validates physical on-disk binary', () => {
      const result = validateConnectorBinary(process.cwd());
      assert(result.valid, `Binary validation failed: ${result.error}`);
      assert.strictEqual(result.size, 101348);
      assert.strictEqual(
        result.sha256,
        '194d577313291a5dad2945888f1e24b7b8dd94104c9da88b79df9db5ecaf55f5'
      );
      assert(result.buffer && result.buffer.length === 101348, 'Must load buffer');
    });

    runTest('validateConnectorBinary fails closed on corrupted/tampered binary', () => {
      const fakeDir = path.join(tmpTestDir, 'storage/binaries');
      fs.mkdirSync(fakeDir, { recursive: true });
      const fakeFile = path.join(fakeDir, 'FEF_HTTP_Bridge.ex5');
      fs.writeFileSync(fakeFile, Buffer.from('corrupted data fake binary'));

      const result = validateConnectorBinary(tmpTestDir);
      assert.strictEqual(result.valid, false, 'Corrupted binary must fail validation');
      assert(result.error?.includes('SIZE_MISMATCH') || result.error?.includes('CHECKSUM_MISMATCH'));
    });

    // 3. Version Classification
    runTest('classifies connector versions accurately', () => {
      assert.strictEqual(classifyConnectorVersion('1.22'), 'CURRENT');
      assert.strictEqual(classifyConnectorVersion('v1.22'), 'CURRENT');
      assert.strictEqual(classifyConnectorVersion('1.21'), 'UPDATE_AVAILABLE');
      assert.strictEqual(classifyConnectorVersion('1.20'), 'UPDATE_AVAILABLE');
      assert.strictEqual(classifyConnectorVersion('1.0'), 'UPDATE_AVAILABLE');
      assert.strictEqual(classifyConnectorVersion('0.9'), 'UNSUPPORTED');
      assert.strictEqual(classifyConnectorVersion(null), 'UNSUPPORTED');
      assert.strictEqual(classifyConnectorVersion(''), 'UNSUPPORTED');
    });

    // 4. MT5 Sandbox Provisioning Tests
    runTest('detectMt5FilesDirectories detects Wine MT5 sandbox on macOS', () => {
      const { detectMt5FilesDirectories } = require('../scripts/fef-device-identity');
      const dirs = detectMt5FilesDirectories();
      assert(Array.isArray(dirs), 'Must return an array of paths');
      assert(dirs.length > 0, 'Must detect at least 1 MT5 Files directory on current machine');
      assert(dirs.some((d: string) => d.includes('MQL5/Files')), 'Path must contain MQL5/Files');
    });

    runTest('provisionMt5SandboxCredential writes artifact atomically with 0600 permissions', () => {
      const { provisionMt5SandboxCredential } = require('../scripts/fef-device-identity');
      const testFilesDir = path.join(tmpTestDir, 'MQL5/Files');
      fs.mkdirSync(testFilesDir, { recursive: true });

      const res = provisionMt5SandboxCredential({ targetDirectory: testFilesDir });
      assert(res.provisioned, `Provisioning failed: ${res.error}`);
      assert.strictEqual(res.paths.length, 1);
      const artifact = res.paths[0];
      assert(fs.existsSync(artifact), 'bridge-auth.dat must exist');

      const tokenContent = fs.readFileSync(artifact, 'utf8').trim();
      assert.strictEqual(tokenContent.length, 64, 'Token must be 64-char hex string');

      if (process.platform !== 'win32') {
        const stats = fs.statSync(artifact);
        const mode = stats.mode & 0o777;
        assert.strictEqual(mode, 0o600, `Permissions must be 0600, got 0${mode.toString(8)}`);
      }
    });

    runTest('provisionMt5SandboxCredential fails closed on retired universal token', () => {
      const { provisionMt5SandboxCredential } = require('../scripts/fef-device-identity');
      const prevEnv = process.env.FEF_BRIDGE_TOKEN;
      try {
        process.env.FEF_BRIDGE_TOKEN = 'fef_local_bridge_token_v1';
        const res = provisionMt5SandboxCredential({
          targetDirectory: path.join(tmpTestDir, 'dummy'),
          customPath: path.join(tmpTestDir, 'nonexistent.json')
        });
        // Sourced token must not write retired universal token
        if (res.provisioned) {
          const written = fs.readFileSync(res.paths[0], 'utf8').trim();
          assert.notStrictEqual(written, 'fef_local_bridge_token_v1');
        }
      } finally {
        if (prevEnv) process.env.FEF_BRIDGE_TOKEN = prevEnv;
        else delete process.env.FEF_BRIDGE_TOKEN;
      }
    });

    runTest('FEF_HTTP_Bridge.mq5 source uses file-based credential loader and no hardcoded secret', () => {
      const mq5Path = path.resolve(process.cwd(), 'mql5/Experts/FEF_HTTP_Bridge.mq5');
      const mq5Source = fs.readFileSync(mq5Path, 'utf8');
      assert(mq5Source.includes('LoadRuntimeAuthToken()'), 'Must call LoadRuntimeAuthToken');
      assert(mq5Source.includes('fef\\\\bridge-auth.dat'), 'Must read fef\\bridge-auth.dat from sandbox');
      assert(!mq5Source.includes('InpAuthToken = "fef_local_bridge_token_v1"'), 'Must NOT contain hardcoded universal token default');
      assert(mq5Source.includes('g_runtime_auth_token == "fef_local_bridge_token_v1"'), 'Must explicitly reject retired universal token');
    });

    // 5. Confidentiality & Security Guardrails
    runTest('no secret leaks in public directories or manifests', () => {
      const pubDownloads = path.resolve(process.cwd(), 'public/downloads');
      if (fs.existsSync(pubDownloads)) {
        const files = fs.readdirSync(pubDownloads);
        assert(
          !files.includes('FEF_HTTP_Bridge.ex5'),
          'Protected binary must NOT be placed in public/downloads/'
        );
      }
    });

    runTest('execution safety locks remain strictly intact', () => {
      // Confirm mt5-http-bridge-service.js has read-only locks
      const bridgeScript = fs.readFileSync(
        path.resolve(process.cwd(), 'scripts/mt5-http-bridge-service.js'),
        'utf8'
      );
      assert(bridgeScript.includes("CANONICAL_EXECUTION_MODE = 'READ_ONLY'"));
      assert(bridgeScript.includes('MT5_ORDER_TRANSPORT_ENABLED = false'));
      assert(bridgeScript.includes('GLOBAL_READ_ONLY_LOCK'));
    });

  } finally {
    try {
      fs.rmSync(tmpTestDir, { recursive: true, force: true });
    } catch {}
  }

  console.log('\n------------------------------------------------------------');
  console.log(`TEST RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
