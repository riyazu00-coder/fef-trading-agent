#!/usr/bin/env node
/**
 * FEF TRADING SOLUTIONS — macOS BACKGROUND SERVICE MANAGER
 * 
 * Manages the com.fef.mt5-connectivity LaunchAgent lifecycle:
 * - install   : Generates, validates, and registers LaunchAgent
 * - uninstall : Unregisters service and removes LaunchAgent plist
 * - status    : Queries launchd and live supervisor state
 * - restart   : Triggers a clean launchd kickstart/restart
 * 
 * Safety:
 * - Runs strictly as user LaunchAgent (not root)
 * - Zero embedded secrets or sensitive credentials in plist
 * - Dynamic path resolution (no hardcoded user/repo paths)
 * - Validates plist syntax with plutil prior to registration
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, execFileSync } = require('child_process');
const http = require('http');

const SERVICE_LABEL = 'com.fef.mt5-connectivity';
const REPO_DIR = path.resolve(__dirname, '..');
const TEMPLATE_PATH = path.resolve(REPO_DIR, 'scripts/com.fef.mt5-connectivity.plist.template');
const RUNTIME_DIR = path.resolve(REPO_DIR, '.bridge-runtime');
const STDOUT_LOG = path.resolve(RUNTIME_DIR, 'launchd.stdout.log');
const STDERR_LOG = path.resolve(RUNTIME_DIR, 'launchd.stderr.log');
const SUPERVISOR_SCRIPT = path.resolve(REPO_DIR, 'scripts/fef-bridge-supervisor.js');

function isDarwin() {
  return process.platform === 'darwin';
}

function getLaunchctlDomain() {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 501;
  return `gui/${uid}`;
}

function getDefaultPlistPath() {
  return path.resolve(os.homedir(), 'Library/LaunchAgents', `${SERVICE_LABEL}.plist`);
}

function renderPlist(templateContent, overrides = {}) {
  const nodePath = overrides.nodePath || process.execPath;
  const supervisorScript = overrides.supervisorScript || SUPERVISOR_SCRIPT;
  const repoDir = overrides.repoDir || REPO_DIR;
  const stdoutLog = overrides.stdoutLog || STDOUT_LOG;
  const stderrLog = overrides.stderrLog || STDERR_LOG;

  return templateContent
    .replace(/\{\{NODE_PATH\}\}/g, nodePath)
    .replace(/\{\{SUPERVISOR_SCRIPT\}\}/g, supervisorScript)
    .replace(/\{\{REPO_DIR\}\}/g, repoDir)
    .replace(/\{\{STDOUT_LOG\}\}/g, stdoutLog)
    .replace(/\{\{STDERR_LOG\}\}/g, stderrLog);
}

function validatePlist(plistContent) {
  if (typeof plistContent !== 'string' || plistContent.trim().length === 0) {
    throw new Error('Plist content is empty.');
  }

  // Basic XML sanity check
  if (!plistContent.includes('<!DOCTYPE plist') || !plistContent.includes('<plist version="1.0">')) {
    throw new Error('Invalid plist XML header or structure.');
  }

  // If on Darwin with plutil available, perform strict linting
  if (isDarwin()) {
    const tmpFile = path.resolve(os.tmpdir(), `fef-plist-lint-${Date.now()}-${Math.random().toString(36).slice(2)}.plist`);
    try {
      fs.writeFileSync(tmpFile, plistContent, 'utf8');
      execFileSync('plutil', ['-lint', tmpFile], { stdio: 'pipe' });
    } catch (err) {
      throw new Error(`Plist lint verification failed (plutil): ${err.message}`);
    } finally {
      try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
    }
  }

  return true;
}

function getLaunchdProcessInfo(label = SERVICE_LABEL) {
  if (!isDarwin()) {
    return { installed: false, loaded: false, pid: null, error: 'Platform is not macOS' };
  }

  const domain = getLaunchctlDomain();
  try {
    const output = execSync(`launchctl print ${domain}/${label} 2>/dev/null`).toString();
    const pidMatch = output.match(/pid\s*=\s*(\d+)/i);
    const stateMatch = output.match(/state\s*=\s*([a-zA-Z]+)/i);
    return {
      installed: true,
      loaded: true,
      pid: pidMatch ? parseInt(pidMatch[1], 10) : null,
      state: stateMatch ? stateMatch[1] : 'loaded',
      domain
    };
  } catch {
    // Fallback query via launchctl list
    try {
      const listOutput = execSync('launchctl list 2>/dev/null').toString();
      const lines = listOutput.split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3 && parts[2] === label) {
          const pid = parts[0] === '-' ? null : parseInt(parts[0], 10);
          return {
            installed: true,
            loaded: true,
            pid,
            state: pid ? 'running' : 'idle',
            domain
          };
        }
      }
    } catch {}
  }

  return { installed: false, loaded: false, pid: null, state: 'not_loaded', domain };
}

async function querySupervisorHealth() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:5558/health', { timeout: 1500 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function queryCanonicalBridgeHealth() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:5556/api/status', { timeout: 1500 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed && (parsed.localBridge === 'ONLINE' || parsed.success) ? parsed : null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function install(options = {}) {
  if (!isDarwin() && !options.allowNonDarwin) {
    throw new Error('FEF Background Service can only be installed on macOS (Darwin).');
  }

  if (typeof process.getuid === 'function' && process.getuid() === 0 && !options.allowRoot) {
    throw new Error('Refusing to install as root. FEF Background Service must run in the user login session (LaunchAgent).');
  }

  const plistPath = options.targetPlistPath || getDefaultPlistPath();
  const plistDir = path.dirname(plistPath);

  if (!fs.existsSync(plistDir)) {
    fs.mkdirSync(plistDir, { recursive: true });
  }

  if (!fs.existsSync(RUNTIME_DIR)) {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  }

  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`Plist template not found at: ${TEMPLATE_PATH}`);
  }

  const templateContent = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const rendered = renderPlist(templateContent, options);

  validatePlist(rendered);

  // If already loaded in launchd, safely bootout first
  if (!options.skipLaunchctl && isDarwin()) {
    const domain = getLaunchctlDomain();
    try {
      execSync(`launchctl bootout ${domain}/${SERVICE_LABEL} 2>/dev/null`);
    } catch {
      try {
        if (fs.existsSync(plistPath)) {
          execSync(`launchctl unload "${plistPath}" 2>/dev/null`);
        }
      } catch {}
    }
  }

  fs.writeFileSync(plistPath, rendered, { encoding: 'utf8', mode: 0o644 });

  // Load into launchd
  if (!options.skipLaunchctl && isDarwin()) {
    const domain = getLaunchctlDomain();
    let loaded = false;
    try {
      execSync(`launchctl bootstrap ${domain} "${plistPath}" 2>/dev/null`);
      loaded = true;
    } catch {
      try {
        execSync(`launchctl load -w "${plistPath}"`);
        loaded = true;
      } catch (err) {
        throw new Error(`Failed to bootstrap LaunchAgent into launchd: ${err.message}`);
      }
    }

    if (loaded) {
      try {
        execSync(`launchctl kickstart -k ${domain}/${SERVICE_LABEL} 2>/dev/null`);
      } catch {}
    }
  }

  return {
    success: true,
    plistPath,
    serviceLabel: SERVICE_LABEL
  };
}

function uninstall(options = {}) {
  if (!isDarwin() && !options.allowNonDarwin) {
    throw new Error('FEF Background Service can only be uninstalled on macOS (Darwin).');
  }

  const plistPath = options.targetPlistPath || getDefaultPlistPath();

  if (!options.skipLaunchctl && isDarwin()) {
    const domain = getLaunchctlDomain();
    try {
      execSync(`launchctl bootout ${domain}/${SERVICE_LABEL} 2>/dev/null`);
    } catch {
      try {
        if (fs.existsSync(plistPath)) {
          execSync(`launchctl unload "${plistPath}" 2>/dev/null`);
        }
      } catch {}
    }
  }

  let fileRemoved = false;
  if (fs.existsSync(plistPath)) {
    fs.unlinkSync(plistPath);
    fileRemoved = true;
  }

  return {
    success: true,
    plistPath,
    fileRemoved
  };
}

function restart(options = {}) {
  if (!isDarwin() && !options.allowNonDarwin) {
    throw new Error('FEF Background Service can only be restarted on macOS (Darwin).');
  }

  const plistPath = options.targetPlistPath || getDefaultPlistPath();
  const domain = getLaunchctlDomain();

  if (!options.skipLaunchctl && isDarwin()) {
    try {
      execSync(`launchctl kickstart -k ${domain}/${SERVICE_LABEL} 2>/dev/null`);
      return { success: true, method: 'kickstart' };
    } catch {
      // Fallback: bootout then bootstrap
      try {
        execSync(`launchctl bootout ${domain}/${SERVICE_LABEL} 2>/dev/null`);
      } catch {}
      try {
        if (fs.existsSync(plistPath)) {
          execSync(`launchctl bootstrap ${domain} "${plistPath}" 2>/dev/null`);
          return { success: true, method: 're-bootstrap' };
        }
      } catch (err) {
        throw new Error(`Failed to restart service via launchctl: ${err.message}`);
      }
    }
  }

  return { success: true, method: 'noop_non_darwin' };
}

async function status(options = {}) {
  const plistPath = options.targetPlistPath || getDefaultPlistPath();
  const fileExists = fs.existsSync(plistPath);
  const launchdInfo = getLaunchdProcessInfo();
  const supervisorHealth = await querySupervisorHealth();
  const canonicalBridgeHealth = await queryCanonicalBridgeHealth();

  return {
    serviceLabel: SERVICE_LABEL,
    plistPath,
    plistInstalled: fileExists,
    launchdLoaded: launchdInfo.loaded,
    launchdPid: launchdInfo.pid,
    launchdState: launchdInfo.state,
    supervisorOnline: Boolean(supervisorHealth && supervisorHealth.supervisor === 'ONLINE'),
    canonicalBridgeOnline: Boolean(canonicalBridgeHealth && (canonicalBridgeHealth.localBridge === 'ONLINE' || canonicalBridgeHealth.success)),
    canonicalBridgeHealth,
    supervisorHealth
  };
}

async function handleCli() {
  const command = (process.argv[2] || 'status').toLowerCase();

  try {
    switch (command) {
      case 'install': {
        console.log('Installing FEF MT5 Background Service (LaunchAgent)...');
        const res = install();
        console.log(`✓ LaunchAgent installed to: ${res.plistPath}`);
        console.log(`✓ Service registered: ${res.serviceLabel}`);
        console.log('Use "npm run bridge:service:status" to check running status.');
        break;
      }
      case 'uninstall': {
        console.log('Uninstalling FEF MT5 Background Service (LaunchAgent)...');
        const res = uninstall();
        console.log(`✓ Service ${SERVICE_LABEL} unloaded from launchd.`);
        if (res.fileRemoved) {
          console.log(`✓ Removed plist file: ${res.plistPath}`);
        }
        break;
      }
      case 'restart': {
        console.log('Restarting FEF MT5 Background Service...');
        const res = restart();
        console.log(`✓ Service restart signal issued (${res.method}).`);
        break;
      }
      case 'status': {
        const info = await status();
        console.log('=================================================================');
        console.log('FEF CORTEX — macOS BACKGROUND SERVICE STATUS');
        console.log('=================================================================');
        console.log(`SERVICE LABEL   : ${info.serviceLabel}`);
        console.log(`PLIST INSTALLED : ${info.plistInstalled ? 'YES (' + info.plistPath + ')' : 'NO'}`);
        console.log(`LAUNCHD LOADED  : ${info.launchdLoaded ? 'YES' : 'NO'}`);
        console.log(`LAUNCHD PID     : ${info.launchdPid ? info.launchdPid : 'N/A'}`);
        console.log(`LAUNCHD STATE   : ${info.launchdState}`);
        console.log(`SUPERVISOR PORT : ${info.supervisorOnline ? 'ONLINE (:5558)' : 'OFFLINE'}`);

        const h = info.supervisorHealth;
        const cb = info.canonicalBridgeHealth;
        const bridgeOnline = info.canonicalBridgeOnline || (h && h.localBridge === 'ONLINE' && info.canonicalBridgeOnline);

        console.log('-----------------------------------------------------------------');
        console.log(`LOCAL BRIDGE    : ${bridgeOnline ? 'ONLINE (:5556)' : 'OFFLINE (:5556 NOT REACHABLE)'}`);
        console.log(`CONNECTOR AGENT : ${h ? h.connectorAgent : 'OFFLINE'}`);
        console.log(`REMOTE RELAY    : ${h ? h.remoteRelay : 'OFFLINE'}`);

        // MT5 Terminal status truthfulness: only CONNECTED if fresh valid telemetry from bridge/terminal exists
        const mt5Connected = Boolean(cb ? cb.mt5Connected : (h && h.mt5Terminal === 'CONNECTED'));
        console.log(`MT5 TERMINAL    : ${mt5Connected ? 'CONNECTED' : 'DISCONNECTED'}`);

        const broker = (cb && cb.terminal?.broker && cb.terminal.broker !== 'UNKNOWN BROKER') ? cb.terminal.broker : (h?.broker || 'UNKNOWN');
        const server = (cb && cb.terminal?.server && cb.terminal.server !== 'MT5 SERVER') ? cb.terminal.server : (h?.server || 'UNKNOWN');
        console.log(`BROKER / SERVER : ${broker} / ${server}`);

        const bid = cb?.quotes?.XAUUSD?.bid || h?.bid || 0;
        const ask = cb?.quotes?.XAUUSD?.ask || h?.ask || 0;
        const spread = cb?.quotes?.XAUUSD?.spread || h?.spread || 0;
        console.log(`PRICE / SPREAD  : ${bid} / ${ask} (${spread} pts)`);
        console.log(`EXECUTION LOCK  : ${h?.execution || 'READ_ONLY'}`);
        console.log('=================================================================');
        break;
      }
      default:
        console.log('Usage: node scripts/fef-macos-service.js [install|uninstall|status|restart]');
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error executing ${command}:`, err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  handleCli();
}

module.exports = {
  SERVICE_LABEL,
  REPO_DIR,
  TEMPLATE_PATH,
  RUNTIME_DIR,
  STDOUT_LOG,
  STDERR_LOG,
  SUPERVISOR_SCRIPT,
  isDarwin,
  getLaunchctlDomain,
  getDefaultPlistPath,
  renderPlist,
  validatePlist,
  getLaunchdProcessInfo,
  install,
  uninstall,
  restart,
  status,
  querySupervisorHealth
};
