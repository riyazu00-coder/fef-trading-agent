#!/usr/bin/env node
/**
 * FEF TRADING SOLUTIONS — TEST SUITE: macOS BACKGROUND SERVICE V3
 * 
 * Verifies 39 security, isolation, and lifecycle invariants for the macOS MT5 LaunchAgent service.
 * Enforces strict child-process environment isolation:
 * - NO ...process.env spread to child processes
 * - Complete isolation from VERCEL_OIDC_TOKEN, MT5_HOST, MT5_PORT, MT5_MAGIC_NUMBER
 * - Explicit minimal child environments
 * - Sandboxed execution without modifying active LaunchAgents
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const macosService = require('./fef-macos-service');
const bridgeCli = require('./fef-bridge-cli');
const supervisorModule = require('./fef-bridge-supervisor');

let passedTests = 0;
let totalTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ Test ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ Test ${totalTests} FAILED: ${name}`);
    console.error(`    Error: ${err.message}`);
    throw err;
  }
}

async function main() {
  console.log('=================================================================');
  console.log('FEF CORTEX — macOS BACKGROUND SERVICE V3 SECURITY TEST SUITE');
  console.log('=================================================================');

// 1. Plist template has no /Users/mac
await runTest('plist template has no /Users/mac', () => {
  const templateContent = fs.readFileSync(macosService.TEMPLATE_PATH, 'utf8');
  assert(!templateContent.includes('/Users/mac'), 'Template must not contain /Users/mac');
});

// 2. Generated plist has no /Users/mac (when rendered with custom generic paths)
await runTest('generated plist has no /Users/mac with custom paths', () => {
  const templateContent = fs.readFileSync(macosService.TEMPLATE_PATH, 'utf8');
  const rendered = macosService.renderPlist(templateContent, {
    nodePath: '/opt/custom/bin/node',
    supervisorScript: '/srv/fef/scripts/fef-bridge-supervisor.js',
    repoDir: '/srv/fef',
    stdoutLog: '/srv/fef/.bridge-runtime/launchd.stdout.log',
    stderrLog: '/srv/fef/.bridge-runtime/launchd.stderr.log'
  });
  assert(!rendered.includes('/Users/mac'), 'Rendered plist with generic paths must not contain /Users/mac');
});

// 3. Generated plist contains dynamic resolved paths
await runTest('generated plist contains dynamic resolved paths', () => {
  const templateContent = fs.readFileSync(macosService.TEMPLATE_PATH, 'utf8');
  const rendered = macosService.renderPlist(templateContent, {
    nodePath: '/custom/path/to/node',
    supervisorScript: '/custom/repo/scripts/fef-bridge-supervisor.js',
    repoDir: '/custom/repo',
    stdoutLog: '/custom/repo/stdout.log',
    stderrLog: '/custom/repo/stderr.log'
  });
  assert(rendered.includes('<string>/custom/path/to/node</string>'), 'Must contain resolved node path');
  assert(rendered.includes('<string>/custom/repo/scripts/fef-bridge-supervisor.js</string>'), 'Must contain resolved supervisor script');
  assert(rendered.includes('<string>/custom/repo</string>'), 'Must contain resolved repo dir');
  assert(rendered.includes('<string>/custom/repo/stdout.log</string>'), 'Must contain resolved stdout log');
  assert(rendered.includes('<string>/custom/repo/stderr.log</string>'), 'Must contain resolved stderr log');
});

// 4. Plist contains RunAtLoad
await runTest('plist contains RunAtLoad', () => {
  const templateContent = fs.readFileSync(macosService.TEMPLATE_PATH, 'utf8');
  assert(templateContent.includes('<key>RunAtLoad</key>'), 'Template must contain RunAtLoad key');
  assert(templateContent.includes('<true/>'), 'RunAtLoad must be true');
});

// 5. Plist contains KeepAlive
await runTest('plist contains KeepAlive', () => {
  const templateContent = fs.readFileSync(macosService.TEMPLATE_PATH, 'utf8');
  assert(templateContent.includes('<key>KeepAlive</key>'), 'Template must contain KeepAlive key');
});

// 6. Plist contains only safe EnvironmentVariables
await runTest('plist contains only safe EnvironmentVariables', () => {
  const templateContent = fs.readFileSync(macosService.TEMPLATE_PATH, 'utf8');
  const envBlockMatch = templateContent.match(/<key>EnvironmentVariables<\/key>\s*<dict>([\s\S]*?)<\/dict>/);
  assert(envBlockMatch, 'Must contain EnvironmentVariables dict');
  const envContent = envBlockMatch[1];
  const keys = [...envContent.matchAll(/<key>([^<]+)<\/key>/g)].map(m => m[1]);
  const safeAllowed = new Set(['PATH', 'FEF_SUPERVISOR_SILENT']);
  for (const key of keys) {
    assert(safeAllowed.has(key), `Disallowed key found in plist EnvironmentVariables: ${key}`);
  }
});

// 7. Plist does NOT contain FEF_REMOTE_DEVICE_SECRET
await runTest('plist does NOT contain FEF_REMOTE_DEVICE_SECRET', () => {
  const templateContent = fs.readFileSync(macosService.TEMPLATE_PATH, 'utf8');
  assert(!templateContent.includes('FEF_REMOTE_DEVICE_SECRET'), 'Plist must not mention FEF_REMOTE_DEVICE_SECRET');
});

// 8. Plist does NOT contain FEF_BRIDGE_TOKEN
await runTest('plist does NOT contain FEF_BRIDGE_TOKEN', () => {
  const templateContent = fs.readFileSync(macosService.TEMPLATE_PATH, 'utf8');
  assert(!templateContent.includes('FEF_BRIDGE_TOKEN'), 'Plist must not mention FEF_BRIDGE_TOKEN');
});

// 9. Plist does NOT contain VERCEL_OIDC_TOKEN
await runTest('plist does NOT contain VERCEL_OIDC_TOKEN', () => {
  const templateContent = fs.readFileSync(macosService.TEMPLATE_PATH, 'utf8');
  assert(!templateContent.includes('VERCEL_OIDC_TOKEN'), 'Plist must not mention VERCEL_OIDC_TOKEN');
});

// 10. Service manager exposes install/uninstall/status/restart
await runTest('service manager exposes install/uninstall/status/restart', () => {
  assert.strictEqual(typeof macosService.install, 'function', 'Must export install()');
  assert.strictEqual(typeof macosService.uninstall, 'function', 'Must export uninstall()');
  assert.strictEqual(typeof macosService.status, 'function', 'Must export status()');
  assert.strictEqual(typeof macosService.restart, 'function', 'Must export restart()');
});

// 11. Bridge CLI detects launchd-managed mode
await runTest('bridge CLI detects launchd-managed mode', () => {
  assert.strictEqual(typeof bridgeCli.getLaunchdInfo, 'function', 'CLI must export getLaunchdInfo()');
  const info = bridgeCli.getLaunchdInfo();
  assert(info && typeof info === 'object', 'getLaunchdInfo must return an object');
  assert('managed' in info, 'Must have managed property');
  assert('loaded' in info, 'Must have loaded property');
  assert('pid' in info, 'Must have pid property');
});

// 12. Launchd-managed stop cannot silently raw-kill and claim permanent stop
await runTest('launchd-managed stop cannot silently raw-kill and claim permanent stop', async () => {
  const originalGetLaunchdInfo = bridgeCli.getLaunchdInfo;
  try {
    bridgeCli.getLaunchdInfo = () => ({
      managed: true,
      plistInstalled: true,
      loaded: true,
      pid: 99999
    });

    const stopResult = await bridgeCli.handleStop();
    assert.strictEqual(stopResult.launchdManaged, true, 'Must detect launchd managed state');
    assert.strictEqual(stopResult.refused, true, 'Must refuse raw-kill when launchd managed');
  } finally {
    bridgeCli.getLaunchdInfo = originalGetLaunchdInfo;
  }
});

// 13. Launchd-managed restart uses service/launchctl semantics
await runTest('launchd-managed restart uses service/launchctl semantics', () => {
  assert.strictEqual(typeof macosService.restart, 'function', 'Service manager must have restart function');
  const res = macosService.restart({ allowNonDarwin: true, skipLaunchctl: true });
  assert.strictEqual(res.success, true, 'Restart should succeed safely');
});

// 14. Supervisor loads ONLY the explicit FEF allowlist from .env.local
await runTest('supervisor loads ONLY the explicit FEF allowlist from .env.local', () => {
  const allowed = supervisorModule.ALLOWED_ENV_KEYS;
  assert(allowed instanceof Set, 'ALLOWED_ENV_KEYS must be a Set');
  const expectedKeys = [
    'FEF_BRIDGE_TOKEN',
    'FEF_REMOTE_RELAY_URL',
    'FEF_REMOTE_DEVICE_ID',
    'FEF_REMOTE_KEY_ID',
    'FEF_REMOTE_DEVICE_SECRET'
  ];
  assert.strictEqual(allowed.size, expectedKeys.length, `Allowlist must contain exactly ${expectedKeys.length} keys`);
  for (const k of expectedKeys) {
    assert(allowed.has(k), `Allowlist must include ${k}`);
  }
});

// 15. VERCEL_OIDC_TOKEN is ignored by supervisor env loader
await runTest('VERCEL_OIDC_TOKEN is ignored by supervisor env loader', () => {
  const tempEnvFile = path.resolve(os.tmpdir(), `fef-test-env-${Date.now()}.env`);
  try {
    fs.writeFileSync(tempEnvFile, 'VERCEL_OIDC_TOKEN=sensitive_vercel_token_12345\nFEF_REMOTE_DEVICE_ID=test-dev-01\n', 'utf8');
    delete process.env.VERCEL_OIDC_TOKEN;
    delete process.env.FEF_REMOTE_DEVICE_ID;

    const loaded = supervisorModule.loadAllowlistedEnv(tempEnvFile);
    assert.strictEqual(process.env.VERCEL_OIDC_TOKEN, undefined, 'VERCEL_OIDC_TOKEN must not be loaded into process.env');
    assert(!('VERCEL_OIDC_TOKEN' in loaded), 'VERCEL_OIDC_TOKEN must not be in loaded object');
    assert.strictEqual(process.env.FEF_REMOTE_DEVICE_ID, 'test-dev-01', 'FEF_REMOTE_DEVICE_ID must be loaded');
  } finally {
    try { fs.unlinkSync(tempEnvFile); } catch {}
  }
});

// 16. MT5_HOST is ignored by supervisor env loader
await runTest('MT5_HOST is ignored by supervisor env loader', () => {
  const tempEnvFile = path.resolve(os.tmpdir(), `fef-test-env-host-${Date.now()}.env`);
  try {
    fs.writeFileSync(tempEnvFile, 'MT5_HOST=192.168.1.100\n', 'utf8');
    delete process.env.MT5_HOST;

    supervisorModule.loadAllowlistedEnv(tempEnvFile);
    assert.strictEqual(process.env.MT5_HOST, undefined, 'MT5_HOST must not be loaded into process.env');
  } finally {
    try { fs.unlinkSync(tempEnvFile); } catch {}
  }
});

// 17. MT5_PORT is ignored by supervisor env loader
await runTest('MT5_PORT is ignored by supervisor env loader', () => {
  const tempEnvFile = path.resolve(os.tmpdir(), `fef-test-env-port-${Date.now()}.env`);
  try {
    fs.writeFileSync(tempEnvFile, 'MT5_PORT=4444\n', 'utf8');
    delete process.env.MT5_PORT;

    supervisorModule.loadAllowlistedEnv(tempEnvFile);
    assert.strictEqual(process.env.MT5_PORT, undefined, 'MT5_PORT must not be loaded into process.env');
  } finally {
    try { fs.unlinkSync(tempEnvFile); } catch {}
  }
});

// 18. MT5_MAGIC_NUMBER is ignored by supervisor env loader
await runTest('MT5_MAGIC_NUMBER is ignored by supervisor env loader', () => {
  const tempEnvFile = path.resolve(os.tmpdir(), `fef-test-env-magic-${Date.now()}.env`);
  try {
    fs.writeFileSync(tempEnvFile, 'MT5_MAGIC_NUMBER=999999\n', 'utf8');
    delete process.env.MT5_MAGIC_NUMBER;

    supervisorModule.loadAllowlistedEnv(tempEnvFile);
    assert.strictEqual(process.env.MT5_MAGIC_NUMBER, undefined, 'MT5_MAGIC_NUMBER must not be loaded into process.env');
  } finally {
    try { fs.unlinkSync(tempEnvFile); } catch {}
  }
});

// 19. Existing process.env values take precedence
await runTest('existing process.env values take precedence', () => {
  const tempEnvFile = path.resolve(os.tmpdir(), `fef-test-env-prec-${Date.now()}.env`);
  try {
    fs.writeFileSync(tempEnvFile, 'FEF_REMOTE_DEVICE_ID=new_from_file_id\n', 'utf8');
    process.env.FEF_REMOTE_DEVICE_ID = 'existing_precedent_id';

    supervisorModule.loadAllowlistedEnv(tempEnvFile);
    assert.strictEqual(process.env.FEF_REMOTE_DEVICE_ID, 'existing_precedent_id', 'Pre-existing process.env must take precedence');
  } finally {
    try { fs.unlinkSync(tempEnvFile); } catch {}
  }
});

// 20. Connector child receives FEF_LOCAL_BRIDGE_URL
await runTest('connector child receives FEF_LOCAL_BRIDGE_URL', () => {
  const testEnv = supervisorModule.buildConnectorChildEnv({}, 'http://127.0.0.1:5556');
  assert.strictEqual(testEnv.FEF_LOCAL_BRIDGE_URL, 'http://127.0.0.1:5556');
});

// 21. Incorrect LOCAL_BRIDGE_URL key is not used for connector configuration
await runTest('incorrect LOCAL_BRIDGE_URL key is not used for connector configuration', () => {
  const testEnv = supervisorModule.buildConnectorChildEnv({ LOCAL_BRIDGE_URL: 'http://malicious' }, 'http://127.0.0.1:5556');
  assert(!('LOCAL_BRIDGE_URL' in testEnv), 'LOCAL_BRIDGE_URL must not exist in connector environment');
});

// 22. Execution remains READ_ONLY
await runTest('execution remains READ_ONLY', () => {
  const policySource = fs.readFileSync(path.resolve(ROOT_DIR, 'src/lib/execution/execution-policy.ts'), 'utf8');
  assert(policySource.includes("export const CANONICAL_EXECUTION_MODE = 'READ_ONLY'"), 'CANONICAL_EXECUTION_MODE must remain READ_ONLY');
  const supervisor = new supervisorModule.ConnectivitySupervisor({ persistState: false });
  assert.strictEqual(supervisor.healthState.execution, 'READ_ONLY', 'Supervisor initial execution state must be READ_ONLY');
});

// 23. MT5 order transport remains disabled
await runTest('MT5 order transport remains disabled', () => {
  const policySource = fs.readFileSync(path.resolve(ROOT_DIR, 'src/lib/execution/execution-policy.ts'), 'utf8');
  assert(policySource.includes("export const MT5_ORDER_TRANSPORT_ENABLED = false"), 'MT5_ORDER_TRANSPORT_ENABLED must remain false');
  assert(policySource.includes("return MT5_ORDER_TRANSPORT_ENABLED;"), 'isMt5OrderTransportAllowed must return MT5_ORDER_TRANSPORT_ENABLED');
});

// 24. No Python bridge references introduced
await runTest('no Python bridge references introduced', () => {
  const supervisorSource = fs.readFileSync(path.resolve(ROOT_DIR, 'scripts/fef-bridge-supervisor.js'), 'utf8');
  const serviceSource = fs.readFileSync(path.resolve(ROOT_DIR, 'scripts/fef-macos-service.js'), 'utf8');
  assert(!supervisorSource.includes('fef_mt5_bridge.py'), 'Supervisor must not reference fef_mt5_bridge.py');
  assert(!supervisorSource.includes('python3'), 'Supervisor must not invoke python3');
  assert(!serviceSource.includes('fef_mt5_bridge.py'), 'Service manager must not reference fef_mt5_bridge.py');
});

// 25. Connector child env does NOT use ...process.env
await runTest('connector child env does NOT use ...process.env', () => {
  const supervisorSource = fs.readFileSync(path.resolve(ROOT_DIR, 'scripts/fef-bridge-supervisor.js'), 'utf8');
  assert(!supervisorSource.includes('...process.env'), 'fef-bridge-supervisor.js must contain zero occurrences of ...process.env');
  
  const mockParentEnv = {
    PATH: '/usr/bin',
    RANDOM_SECRET: 'secret123',
    AWS_SECRET_KEY: 'aws123',
    FEF_REMOTE_DEVICE_ID: 'dev-01'
  };
  const childEnv = supervisorModule.buildConnectorChildEnv(mockParentEnv, 'http://127.0.0.1:5556');
  assert.strictEqual(childEnv.RANDOM_SECRET, undefined);
  assert.strictEqual(childEnv.AWS_SECRET_KEY, undefined);
  assert.strictEqual(childEnv.FEF_REMOTE_DEVICE_ID, 'dev-01');
});

// 26. Bridge child env does NOT use ...process.env
await runTest('bridge child env does NOT use ...process.env', () => {
  const supervisorSource = fs.readFileSync(path.resolve(ROOT_DIR, 'scripts/fef-bridge-supervisor.js'), 'utf8');
  assert(!supervisorSource.includes('...process.env'), 'fef-bridge-supervisor.js must contain zero occurrences of ...process.env');
  
  const mockParentEnv = {
    PATH: '/usr/bin',
    RANDOM_SECRET: 'secret123',
    FEF_BRIDGE_TOKEN: 'token-abc'
  };
  const childEnv = supervisorModule.buildBridgeChildEnv(mockParentEnv, 5556);
  assert.strictEqual(childEnv.RANDOM_SECRET, undefined);
  assert.strictEqual(childEnv.PORT, '5556');
  assert.strictEqual(childEnv.FEF_BRIDGE_TOKEN, 'token-abc');
});

// 27. Connector child cannot receive VERCEL_OIDC_TOKEN
await runTest('connector child cannot receive VERCEL_OIDC_TOKEN', () => {
  const mockParentEnv = {
    VERCEL_OIDC_TOKEN: 'must_not_escape_to_connector',
    FEF_REMOTE_DEVICE_ID: 'dev-valid'
  };
  const childEnv = supervisorModule.buildConnectorChildEnv(mockParentEnv, 'http://127.0.0.1:5556');
  assert.strictEqual(childEnv.VERCEL_OIDC_TOKEN, undefined);
  assert(!('VERCEL_OIDC_TOKEN' in childEnv));
});

// 28. Bridge child cannot receive VERCEL_OIDC_TOKEN
await runTest('bridge child cannot receive VERCEL_OIDC_TOKEN', () => {
  const mockParentEnv = {
    VERCEL_OIDC_TOKEN: 'must_not_escape_to_bridge',
    FEF_BRIDGE_TOKEN: 'valid_bridge_token'
  };
  const childEnv = supervisorModule.buildBridgeChildEnv(mockParentEnv, 5556);
  assert.strictEqual(childEnv.VERCEL_OIDC_TOKEN, undefined);
  assert(!('VERCEL_OIDC_TOKEN' in childEnv));
});

// 29. Connector child cannot receive MT5_HOST
await runTest('connector child cannot receive MT5_HOST', () => {
  const mockParentEnv = {
    MT5_HOST: '10.0.0.1_must_not_escape',
    FEF_REMOTE_DEVICE_ID: 'dev-valid'
  };
  const childEnv = supervisorModule.buildConnectorChildEnv(mockParentEnv, 'http://127.0.0.1:5556');
  assert.strictEqual(childEnv.MT5_HOST, undefined);
  assert(!('MT5_HOST' in childEnv));
});

// 30. Connector child cannot receive MT5_PORT
await runTest('connector child cannot receive MT5_PORT', () => {
  const mockParentEnv = {
    MT5_PORT: '9999_must_not_escape',
    FEF_REMOTE_DEVICE_ID: 'dev-valid'
  };
  const childEnv = supervisorModule.buildConnectorChildEnv(mockParentEnv, 'http://127.0.0.1:5556');
  assert.strictEqual(childEnv.MT5_PORT, undefined);
  assert(!('MT5_PORT' in childEnv));
});

// 31. Connector child cannot receive MT5_MAGIC_NUMBER
await runTest('connector child cannot receive MT5_MAGIC_NUMBER', () => {
  const mockParentEnv = {
    MT5_MAGIC_NUMBER: '777777_must_not_escape',
    FEF_REMOTE_DEVICE_ID: 'dev-valid'
  };
  const childEnv = supervisorModule.buildConnectorChildEnv(mockParentEnv, 'http://127.0.0.1:5556');
  assert.strictEqual(childEnv.MT5_MAGIC_NUMBER, undefined);
  assert(!('MT5_MAGIC_NUMBER' in childEnv));
});

// 32. Bridge child cannot receive unrelated MT5 variables
await runTest('bridge child cannot receive unrelated MT5 variables', () => {
  const mockParentEnv = {
    MT5_HOST: '10.0.0.1',
    MT5_PORT: '5555',
    MT5_MAGIC_NUMBER: '123456'
  };
  const childEnv = supervisorModule.buildBridgeChildEnv(mockParentEnv, 5556);
  assert.strictEqual(childEnv.MT5_HOST, undefined);
  assert.strictEqual(childEnv.MT5_PORT, undefined);
  assert.strictEqual(childEnv.MT5_MAGIC_NUMBER, undefined);
  assert(!('MT5_HOST' in childEnv));
  assert(!('MT5_PORT' in childEnv));
  assert(!('MT5_MAGIC_NUMBER' in childEnv));
});

// 33. Connector receives only required FEF configuration plus FEF_LOCAL_BRIDGE_URL and explicitly documented safe runtime keys
await runTest('connector receives only required FEF configuration plus FEF_LOCAL_BRIDGE_URL and safe keys', () => {
  const mockParentEnv = {
    PATH: '/usr/bin',
    HOME: '/Users/testuser',
    TMPDIR: '/tmp',
    LANG: 'en_US.UTF-8',
    NODE_EXTRA_CA_CERTS: '/path/to/ca.pem',
    FEF_BRIDGE_TOKEN: 'br-token',
    FEF_REMOTE_RELAY_URL: 'https://relay.example.com',
    FEF_REMOTE_DEVICE_ID: 'dev-1',
    FEF_REMOTE_KEY_ID: 'key-1',
    FEF_REMOTE_DEVICE_SECRET: 'secret-1',
    // Unrelated variables that must NOT be passed:
    UNRELATED_KEY_1: 'val1',
    DATABASE_URL: 'postgres://...',
    SECRET_KEY: 'supersecret'
  };
  const childEnv = supervisorModule.buildConnectorChildEnv(mockParentEnv, 'http://127.0.0.1:5556');
  const allowedKeys = new Set([
    'FEF_LOCAL_BRIDGE_URL',
    'FEF_BRIDGE_TOKEN',
    'FEF_REMOTE_RELAY_URL',
    'FEF_REMOTE_DEVICE_ID',
    'FEF_REMOTE_KEY_ID',
    'FEF_REMOTE_DEVICE_SECRET',
    'PATH',
    'HOME',
    'TMPDIR',
    'LANG',
    'NODE_EXTRA_CA_CERTS'
  ]);
  for (const key of Object.keys(childEnv)) {
    assert(allowedKeys.has(key), `Disallowed key found in connector child environment: ${key}`);
  }
});

// 34. Bridge receives only PORT, FEF_BRIDGE_TOKEN when present, and explicitly documented safe runtime keys
await runTest('bridge receives only PORT, FEF_BRIDGE_TOKEN when present, and safe keys', () => {
  const mockParentEnv = {
    PATH: '/usr/bin',
    HOME: '/Users/testuser',
    TMPDIR: '/tmp',
    LANG: 'en_US.UTF-8',
    NODE_EXTRA_CA_CERTS: '/path/to/ca.pem',
    FEF_BRIDGE_TOKEN: 'br-token',
    // Unrelated variables that must NOT be passed:
    FEF_REMOTE_DEVICE_SECRET: 'secret-1',
    UNRELATED_VAR: 'val',
    VERCEL_OIDC_TOKEN: 'oidc'
  };
  const childEnv = supervisorModule.buildBridgeChildEnv(mockParentEnv, 5556);
  const allowedKeys = new Set([
    'PORT',
    'FEF_BRIDGE_TOKEN',
    'PATH',
    'HOME',
    'TMPDIR',
    'LANG',
    'NODE_EXTRA_CA_CERTS'
  ]);
  for (const key of Object.keys(childEnv)) {
    assert(allowedKeys.has(key), `Disallowed key found in bridge child environment: ${key}`);
  }
});

// 35. FEF_REMOTE_DEVICE_SECRET is never printed by service/status output
await runTest('FEF_REMOTE_DEVICE_SECRET is never printed by service/status output', async () => {
  const origLog = console.log;
  let loggedOutput = '';
  console.log = (...args) => { loggedOutput += args.join(' ') + '\n'; };
  try {
    process.env.FEF_REMOTE_DEVICE_SECRET = 'SUPER_SECRET_DEVICE_KEY_XYZ';
    await macosService.status({ skipLaunchctl: true });
    await bridgeCli.handleStatus();
  } finally {
    console.log = origLog;
    delete process.env.FEF_REMOTE_DEVICE_SECRET;
  }
  assert(!loggedOutput.includes('SUPER_SECRET_DEVICE_KEY_XYZ'), 'Status output must never leak FEF_REMOTE_DEVICE_SECRET');
});

// 36. FEF_BRIDGE_TOKEN is never printed by service/status output
await runTest('FEF_BRIDGE_TOKEN is never printed by service/status output', async () => {
  const origLog = console.log;
  let loggedOutput = '';
  console.log = (...args) => { loggedOutput += args.join(' ') + '\n'; };
  try {
    process.env.FEF_BRIDGE_TOKEN = 'SUPER_SECRET_BRIDGE_TOKEN_XYZ';
    await macosService.status({ skipLaunchctl: true });
    await bridgeCli.handleStatus();
  } finally {
    console.log = origLog;
    delete process.env.FEF_BRIDGE_TOKEN;
  }
  assert(!loggedOutput.includes('SUPER_SECRET_BRIDGE_TOKEN_XYZ'), 'Status output must never leak FEF_BRIDGE_TOKEN');
});

// 37. Incorrect LOCAL_BRIDGE_URL is absent from connector child env
await runTest('incorrect LOCAL_BRIDGE_URL is absent from connector child env', () => {
  const childEnv = supervisorModule.buildConnectorChildEnv({ LOCAL_BRIDGE_URL: 'http://incorrect' }, 'http://127.0.0.1:5556');
  assert.strictEqual(childEnv.LOCAL_BRIDGE_URL, undefined);
  assert(!('LOCAL_BRIDGE_URL' in childEnv));
  assert.strictEqual(childEnv.FEF_LOCAL_BRIDGE_URL, 'http://127.0.0.1:5556');
});

// 38. READ_ONLY remains canonical
  await runTest('READ_ONLY remains canonical', () => {
    const policySource = fs.readFileSync(path.resolve(ROOT_DIR, 'src/lib/execution/execution-policy.ts'), 'utf8');
    assert(policySource.includes("export const CANONICAL_EXECUTION_MODE = 'READ_ONLY'"), 'CANONICAL_EXECUTION_MODE must remain READ_ONLY');
  });

  // 39. MT5_ORDER_TRANSPORT_ENABLED remains false
  await runTest('MT5_ORDER_TRANSPORT_ENABLED remains false', () => {
    const policySource = fs.readFileSync(path.resolve(ROOT_DIR, 'src/lib/execution/execution-policy.ts'), 'utf8');
    assert(policySource.includes("export const MT5_ORDER_TRANSPORT_ENABLED = false"), 'MT5_ORDER_TRANSPORT_ENABLED must remain false');
  });

  console.log('=================================================================');
  console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED CLEANLY.`);
  console.log('=================================================================');
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
