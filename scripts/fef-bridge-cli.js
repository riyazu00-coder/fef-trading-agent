#!/usr/bin/env node
/**
 * FEF TRADING SOLUTIONS — BRIDGE SUPERVISOR CLI CONTROLLER
 * 
 * Commands:
 * - start  : Launches daemon supervisor in background (duplicate protected, launchd-aware)
 * - status : Queries current structured health state from supervisor, bridge, and launchd
 * - stop   : Cleanly terminates standalone supervisor, or guards against invalid raw SIGTERM if launchd-managed
 * - restart: Gracefully restarts the full connectivity runtime (launchd-aware)
 */

const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");

const ROOT_DIR = path.resolve(__dirname, "..");
const RUNTIME_DIR = path.resolve(ROOT_DIR, ".bridge-runtime");
const PID_FILE = path.resolve(RUNTIME_DIR, "supervisor.pid");
const STATE_FILE = path.resolve(RUNTIME_DIR, "supervisor-state.json");
const LOG_FILE = path.resolve(RUNTIME_DIR, "supervisor.log");
const SUPERVISOR_SCRIPT = path.resolve(ROOT_DIR, "scripts/fef-bridge-supervisor.js");
const SERVICE_LABEL = "com.fef.mt5-connectivity";

function isPidRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // On macOS / sandboxes, EPERM means the process exists and is running, but we lack signaling permissions
    if (e.code === "EPERM") return true;
    return false;
  }
}

function getLaunchdInfo() {
  if (process.platform !== "darwin") {
    return { managed: false, loaded: false, pid: null, plistInstalled: false };
  }

  const plistPath = path.resolve(os.homedir(), "Library/LaunchAgents", `${SERVICE_LABEL}.plist`);
  const plistInstalled = fs.existsSync(plistPath);

  try {
    const { execSync } = require("child_process");
    const uid = typeof process.getuid === "function" ? process.getuid() : 501;
    const output = execSync(`launchctl print gui/${uid}/${SERVICE_LABEL} 2>/dev/null`).toString();
    const pidMatch = output.match(/pid\s*=\s*(\d+)/i);
    const pid = pidMatch ? parseInt(pidMatch[1], 10) : null;
    return {
      managed: true,
      plistInstalled,
      loaded: true,
      pid
    };
  } catch {
    try {
      const { execSync } = require("child_process");
      const listOutput = execSync("launchctl list 2>/dev/null").toString();
      for (const line of listOutput.split("\n")) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3 && parts[2] === SERVICE_LABEL) {
          const pid = parts[0] === "-" ? null : parseInt(parts[0], 10);
          return { managed: true, plistInstalled, loaded: true, pid };
        }
      }
    } catch {}
  }

  return {
    managed: plistInstalled,
    plistInstalled,
    loaded: false,
    pid: null
  };
}

async function fetchStatusJson() {
  return new Promise((resolve) => {
    const req = http.get("http://127.0.0.1:5558/health", { timeout: 1500 }, (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try { resolve(JSON.parse(d)); } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

async function fetchCanonicalBridgeJson() {
  return new Promise((resolve) => {
    const req = http.get("http://127.0.0.1:5556/api/status", { timeout: 1500 }, (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(d);
          resolve(parsed && (parsed.localBridge === "ONLINE" || parsed.success) ? parsed : null);
        } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

async function handleStatus() {
  let pid = null;
  if (fs.existsSync(PID_FILE)) {
    try { pid = parseInt(fs.readFileSync(PID_FILE, "utf8").trim(), 10); } catch {}
  }

  const running = pid && isPidRunning(pid);
  const liveState = await fetchStatusJson();
  const canonicalBridge = await fetchCanonicalBridgeJson();
  const launchd = getLaunchdInfo();

  console.log("=================================================================");
  console.log("FEF TRADING SOLUTIONS — MT5 CONNECTIVITY STATUS");
  console.log("=================================================================");
  console.log("SUPERVISOR   :", running ? "ONLINE (PID " + pid + ")" : "OFFLINE");
  console.log("LAUNCHD MGMT :", launchd.loaded ? "ACTIVE (Loaded in launchd, PID: " + (launchd.pid || "running") + ")" : (launchd.plistInstalled ? "INSTALLED (Not loaded)" : "NOT CONFIGURED"));

  if (liveState || canonicalBridge) {
    const isBridgeOnline = Boolean(canonicalBridge && (canonicalBridge.localBridge === "ONLINE" || canonicalBridge.success));
    console.log("LOCAL BRIDGE :", isBridgeOnline ? "ONLINE (:5556)" : "OFFLINE (:5556 NOT REACHABLE)");
    console.log("CONNECTOR    :", liveState ? liveState.connectorAgent : "OFFLINE");
    console.log("REMOTE RELAY :", liveState ? liveState.remoteRelay : "OFFLINE");

    const mt5Connected = Boolean(canonicalBridge ? canonicalBridge.mt5Connected : (liveState && liveState.mt5Terminal === "CONNECTED"));
    console.log("MT5 TERMINAL :", mt5Connected ? "CONNECTED" : "DISCONNECTED");

    const broker = (canonicalBridge && canonicalBridge.terminal?.broker && canonicalBridge.terminal.broker !== 'UNKNOWN BROKER')
      ? canonicalBridge.terminal.broker
      : (liveState?.broker || "UNKNOWN");
    const server = (canonicalBridge && canonicalBridge.terminal?.server && canonicalBridge.terminal.server !== 'MT5 SERVER')
      ? canonicalBridge.terminal.server
      : (liveState?.server || "UNKNOWN");
    console.log("BROKER       :", broker);
    console.log("SERVER       :", server);
    console.log("SYMBOL       :", liveState.symbol);
    console.log("BID / ASK    :", liveState.bid + " / " + liveState.ask);
    const quoteAgeMs = canonicalBridge?.quotes?.XAUUSD?.ageMs ?? liveState?.brokerQuoteAgeMs;
    const quoteFreshness = canonicalBridge?.quotes?.XAUUSD?.freshness ?? (liveState?.feedStatus === 'LIVE' ? 'FRESH' : 'SESSION_CLOSED');
    const quoteReason = canonicalBridge?.quotes?.XAUUSD?.freshnessReason ?? '';

    let quoteAgeDisplay = "N/A";
    if (quoteAgeMs != null) {
      if (quoteAgeMs > 3600000) {
        quoteAgeDisplay = `${Math.round(quoteAgeMs / 3600000)}h ago (${Math.round(quoteAgeMs)} ms) [${quoteFreshness}${quoteReason ? ': ' + quoteReason : ''}]`;
      } else if (quoteAgeMs > 60000) {
        quoteAgeDisplay = `${Math.round(quoteAgeMs / 60000)}m ago (${Math.round(quoteAgeMs)} ms) [${quoteFreshness}]`;
      } else {
        quoteAgeDisplay = `${Math.round(quoteAgeMs)} ms [${quoteFreshness}]`;
      }
    }

    const hbAgeMs = canonicalBridge?.heartbeatAgeMs ?? liveState?.bridgeHeartbeatAgeMs;
    const hbDisplay = hbAgeMs != null ? `${Math.round(hbAgeMs)} ms [FRESH EA LINK]` : "N/A";

    console.log("SPREAD       :", liveState ? liveState.spread + " pts" : (canonicalBridge?.quotes?.XAUUSD?.spread != null ? canonicalBridge.quotes.XAUUSD.spread + " pts" : "N/A"));
    console.log("QUOTE AGE    :", quoteAgeDisplay);
    console.log("HEARTBEAT AGE:", hbDisplay);
    console.log("AUTHORITY    :", liveState?.priceAuthority || "REFERENCE");
    console.log("FEED STATUS  :", liveState?.feedStatus || (quoteFreshness === 'FRESH' ? 'LIVE' : 'FALLBACK'));
    console.log("EXECUTION    :", liveState?.execution || "READ_ONLY");
    console.log("UPTIME       :", (liveState?.uptimeSec != null ? liveState.uptimeSec + "s" : "N/A"));
  } else if (fs.existsSync(STATE_FILE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      console.log("CACHED STATE : (Last recorded)");
      console.log(JSON.stringify(cached, null, 2));
    } catch {}
  } else {
    console.log("No active supervisor or cached status found.");
  }
  console.log("=================================================================");
}

async function handleStart() {
  const launchd = getLaunchdInfo();
  if (launchd.loaded) {
    console.log("✓ FEF Connectivity Supervisor is managed by macOS launchd (" + SERVICE_LABEL + (launchd.pid ? ", PID " + launchd.pid : "") + ").");
    console.log("Background supervisor is already running under launchd. Skipping duplicate standalone launch.");
    await handleStatus();
    return;
  }

  if (fs.existsSync(PID_FILE)) {
    try {
      const pid = parseInt(fs.readFileSync(PID_FILE, "utf8").trim(), 10);
      if (isPidRunning(pid)) {
        console.log("✓ FEF Connectivity Supervisor is already running (PID " + pid + ").");
        await handleStatus();
        return;
      }
    } catch {}
  }

  console.log("Starting FEF Connectivity Supervisor in background...");
  if (!fs.existsSync(RUNTIME_DIR)) fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  const outLog = fs.openSync(LOG_FILE, "a");

  const child = spawn(process.execPath, [SUPERVISOR_SCRIPT], {
    detached: true,
    stdio: ["ignore", outLog, outLog],
    cwd: ROOT_DIR,
    env: { ...process.env, FEF_SUPERVISOR_SILENT: "1" }
  });

  child.unref();

  // Wait briefly for supervisor to write PID and start
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (fs.existsSync(PID_FILE)) break;
  }

  console.log("✓ Supervisor launched (PID " + child.pid + ").");
  console.log("Logs streaming to: " + LOG_FILE);
  await handleStatus();
}

async function handleStop() {
  const launchd = getLaunchdInfo();
  if (launchd.loaded) {
    console.log("⚠️  Notice: FEF Connectivity Supervisor is managed by macOS LaunchAgent (" + SERVICE_LABEL + ") with KeepAlive=true.");
    console.log("Sending a raw SIGTERM will cause launchd to immediately restart the supervisor process.");
    console.log("To permanently stop and unload the background service, run:");
    console.log("  npm run bridge:service:uninstall\n");
    console.log("To restart the background service, run:");
    console.log("  npm run bridge:service:restart\n");
    return { launchdManaged: true, refused: true };
  }

  console.log("Stopping FEF Connectivity Supervisor...");
  let stoppedAny = false;

  if (fs.existsSync(PID_FILE)) {
    try {
      const pid = parseInt(fs.readFileSync(PID_FILE, "utf8").trim(), 10);
      if (isPidRunning(pid)) {
        process.kill(pid, "SIGTERM");
        console.log("Sent SIGTERM to Supervisor (PID " + pid + ").");
        stoppedAny = true;
      }
      fs.unlinkSync(PID_FILE);
    } catch (e) {
      console.warn("PID clean warning:", e.message);
    }
  }

  // Gracefully stop connector and bridge if still lingering
  try {
    const { execSync } = require("child_process");
    const lsof = execSync("lsof -t -iTCP:5556 -sTCP:LISTEN 2>/dev/null").toString().trim();
    if (lsof) {
      const pids = lsof.split("\n").filter(Boolean);
      for (const p of pids) {
        const num = parseInt(p, 10);
        if (num && num !== process.pid) {
          try { process.kill(num, "SIGTERM"); stoppedAny = true; } catch {}
        }
      }
    }
  } catch {}

  console.log(stoppedAny ? "✓ FEF Bridge runtime stopped cleanly." : "No active runtime found to stop.");
  return { stoppedAny, launchdManaged: false };
}

async function handleRestart() {
  const launchd = getLaunchdInfo();
  if (launchd.loaded) {
    console.log("Restarting launchd-managed FEF Connectivity Supervisor...");
    try {
      const macosService = require("./fef-macos-service");
      macosService.restart();
      console.log("✓ Service restart signal issued to launchd.");
    } catch (e) {
      const { execSync } = require("child_process");
      const uid = typeof process.getuid === "function" ? process.getuid() : 501;
      execSync(`launchctl kickstart -k gui/${uid}/${SERVICE_LABEL} 2>/dev/null || true`);
      console.log("✓ Service kickstart sent via launchctl.");
    }
    await new Promise(r => setTimeout(r, 1000));
    await handleStatus();
    return;
  }

  await handleStop();
  await new Promise(r => setTimeout(r, 1500));
  await handleStart();
}

async function main() {
  const action = (process.argv[2] || "status").toLowerCase();

  switch (action) {
    case "start":
      await handleStart();
      break;
    case "stop":
      await handleStop();
      break;
    case "status":
      await handleStatus();
      break;
    case "restart":
      await handleRestart();
      break;
    default:
      console.log("Usage: node scripts/fef-bridge-cli.js [start|stop|status|restart]");
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error("CLI Error:", err.message);
    process.exit(1);
  });
}

module.exports = {
  isPidRunning,
  getLaunchdInfo,
  fetchStatusJson,
  handleStatus,
  handleStart,
  handleStop,
  handleRestart
};
