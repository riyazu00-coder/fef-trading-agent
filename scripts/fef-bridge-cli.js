#!/usr/bin/env node
/**
 * FEF TRADING SOLUTIONS — BRIDGE SUPERVISOR CLI CONTROLLER
 * 
 * Commands:
 * - start  : Launches daemon supervisor in background (duplicate protected)
 * - status : Queries current structured health state from supervisor & bridge
 * - stop   : Cleanly terminates supervisor and supervised bridge daemons
 * - restart: Gracefully restarts the full connectivity runtime
 */

const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");

const ROOT_DIR = path.resolve(__dirname, "..");
const RUNTIME_DIR = path.resolve(ROOT_DIR, ".bridge-runtime");
const PID_FILE = path.resolve(RUNTIME_DIR, "supervisor.pid");
const STATE_FILE = path.resolve(RUNTIME_DIR, "supervisor-state.json");
const LOG_FILE = path.resolve(RUNTIME_DIR, "supervisor.log");
const SUPERVISOR_SCRIPT = path.resolve(ROOT_DIR, "scripts/fef-bridge-supervisor.js");

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

async function handleStatus() {
  let pid = null;
  if (fs.existsSync(PID_FILE)) {
    try { pid = parseInt(fs.readFileSync(PID_FILE, "utf8").trim(), 10); } catch {}
  }

  const running = pid && isPidRunning(pid);
  const liveState = await fetchStatusJson();

  console.log("=================================================================");
  console.log("FEF TRADING SOLUTIONS — MT5 CONNECTIVITY STATUS");
  console.log("=================================================================");
  console.log("SUPERVISOR   :", running ? "ONLINE (PID " + pid + ")" : "OFFLINE");

  if (liveState) {
    console.log("LOCAL BRIDGE :", liveState.localBridge);
    console.log("CONNECTOR    :", liveState.connectorAgent);
    console.log("REMOTE RELAY :", liveState.remoteRelay);
    console.log("MT5 TERMINAL :", liveState.mt5Terminal);
    console.log("BROKER       :", liveState.broker);
    console.log("SERVER       :", liveState.server);
    console.log("SYMBOL       :", liveState.symbol);
    console.log("BID / ASK    :", liveState.bid + " / " + liveState.ask);
    console.log("SPREAD       :", liveState.spread + " pts");
    console.log("QUOTE AGE    :", liveState.brokerQuoteAgeMs != null ? Math.round(liveState.brokerQuoteAgeMs) + " ms" : "N/A");
    console.log("HEARTBEAT AGE:", liveState.bridgeHeartbeatAgeMs != null ? Math.round(liveState.bridgeHeartbeatAgeMs) + " ms" : "N/A");
    console.log("AUTHORITY    :", liveState.priceAuthority);
    console.log("FEED STATUS  :", liveState.feedStatus);
    console.log("EXECUTION    :", liveState.execution);
    console.log("UPTIME       :", liveState.uptimeSec + "s");
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
      await handleStop();
      await new Promise(r => setTimeout(r, 1500));
      await handleStart();
      break;
    default:
      console.log("Usage: node scripts/fef-bridge-cli.js [start|stop|status|restart]");
  }
}

main().catch(err => {
  console.error("CLI Error:", err.message);
  process.exit(1);
});
