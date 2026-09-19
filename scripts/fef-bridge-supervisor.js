#!/usr/bin/env node
/**
 * FEF TRADING SOLUTIONS — CONNECTIVITY RUNTIME SUPERVISOR
 * 
 * Phase 2D.3: Automated Local MT5 Bridge & Connector Agent Supervisor
 */

const { spawn } = require("child_process");
const http = require("http");
const https = require("https");
const path = require("path");
const fs = require("fs");

const ROOT_DIR = path.resolve(__dirname, "..");
const RUNTIME_DIR = path.resolve(ROOT_DIR, ".bridge-runtime");
const PID_FILE = path.resolve(RUNTIME_DIR, "supervisor.pid");
const STATE_FILE = path.resolve(RUNTIME_DIR, "supervisor-state.json");
const LOG_FILE = path.resolve(RUNTIME_DIR, "supervisor.log");

const BRIDGE_SCRIPT = path.resolve(ROOT_DIR, "scripts/mt5-http-bridge-service.js");
const CONNECTOR_SCRIPT = path.resolve(ROOT_DIR, "scripts/fef-local-connector-agent.js");

const BRIDGE_PORT = 5556;
const BRIDGE_HOST = "127.0.0.1";
const LOCAL_BRIDGE_URL = "http://" + BRIDGE_HOST + ":" + BRIDGE_PORT;
const SUPERVISOR_PORT = 5558;

const MAX_RAPID_CRASHES = 5;
const CRASH_WINDOW_MS = 60000;
const HEALTH_POLL_INTERVAL_MS = 2000;

if (!fs.existsSync(RUNTIME_DIR)) {
  try { fs.mkdirSync(RUNTIME_DIR, { recursive: true }); } catch {}
}

function log(level, message, meta) {
  const ts = new Date().toISOString();
  const metaStr = meta ? " " + JSON.stringify(meta) : "";
  const line = "[" + ts + "] [" + level + "] " + message + metaStr + "\n";
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
  if (process.env.FEF_SUPERVISOR_SILENT !== "1") {
    if (level === "ERROR") console.error(line.trim());
    else console.log(line.trim());
  }
}

class ConnectivitySupervisor {
  constructor(options = {}) {
    this.bridgeProcess = null;
    this.connectorProcess = null;
    this.bridgeRestartHistory = [];
    this.connectorRestartHistory = [];
    this.isShuttingDown = false;
    this.pollInterval = null;
    this.persistState = options.persistState !== false;

    this.healthState = {
      supervisor: "STARTING",
      localBridge: "OFFLINE",
      connectorAgent: "OFFLINE",
      remoteRelay: "OFFLINE",
      mt5Terminal: "DISCONNECTED",
      broker: "UNKNOWN",
      server: "UNKNOWN",
      symbol: "XAUUSD",
      bid: 0,
      ask: 0,
      mid: 0,
      spread: 0,
      brokerQuoteAgeMs: null,
      quoteTimestamp: null,
      bridgeHeartbeatAgeMs: null,
      connectorHeartbeatAgeMs: null,
      remoteRelayHeartbeatAgeMs: null,
      priceAuthority: "REFERENCE",
      feedStatus: "FALLBACK",
      execution: "READ_ONLY",
      uptimeSec: 0,
      lastUpdated: Date.now()
    };

    this.startTime = Date.now();
    this.httpServer = null;
  }

  async checkPortInUse(port) {
    return new Promise((resolve) => {
      const tester = http.get("http://127.0.0.1:" + port + "/api/status", { timeout: 1000 }, (res) => {
        let d = "";
        res.on("data", c => d += c);
        res.on("end", () => {
          try {
            const parsed = JSON.parse(d);
            resolve(Boolean(parsed && (parsed.localBridge === "ONLINE" || parsed.success)));
          } catch {
            resolve(false);
          }
        });
      });
      tester.on("error", () => resolve(false));
      tester.on("timeout", () => { tester.destroy(); resolve(false); });
    });
  }

  async queryLocalBridgeHealth() {
    return new Promise((resolve) => {
      const req = http.get(LOCAL_BRIDGE_URL + "/api/status", { timeout: 1500 }, (res) => {
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

  async queryRemoteRelayHealth() {
    return new Promise((resolve) => {
      const relayUrl = process.env.FEF_REMOTE_RELAY_URL || "https://fef-secure-mt5-relay-production.up.railway.app";
      const deviceId = process.env.FEF_REMOTE_DEVICE_ID || "fef-connector-primary-01";
      const url = relayUrl + "/device/" + deviceId + "/telemetry";
      const client = relayUrl.startsWith("https") ? https : http;
      const req = client.get(url, { timeout: 2500 }, (res) => {
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

  recordCrash(history) {
    const now = Date.now();
    history.push(now);
    const pruned = history.filter(ts => now - ts < CRASH_WINDOW_MS);
    history.length = 0;
    history.push(...pruned);
    return history.length >= MAX_RAPID_CRASHES;
  }

  startBridgeService() {
    if (this.isShuttingDown) return;
    log("INFO", "Starting MT5 HTTP Bridge Service...");
    const child = spawn(process.execPath, [BRIDGE_SCRIPT], {
      cwd: ROOT_DIR,
      env: { ...process.env, PORT: String(BRIDGE_PORT) },
      stdio: ["ignore", "pipe", "pipe"]
    });
    this.bridgeProcess = child;

    child.stdout.on("data", (d) => {
      const msg = d.toString().trim();
      if (msg.includes("ONLINE") || msg.includes("ERROR")) {
        log("DEBUG", "[BridgeStdout] " + msg);
      }
    });

    child.stderr.on("data", (d) => {
      log("WARN", "[BridgeStderr] " + d.toString().trim());
    });

    child.on("exit", (code, signal) => {
      this.bridgeProcess = null;
      if (this.isShuttingDown) return;
      log("WARN", "MT5 HTTP Bridge exited with code " + code + " signal " + signal);
      const isLoop = this.recordCrash(this.bridgeRestartHistory);
      if (isLoop) {
        log("ERROR", "Bridge exceeded rapid crash threshold. Halting bridge restarts.");
        this.healthState.localBridge = "ERROR";
        return;
      }
      const backoffMs = Math.min(1000 * Math.pow(1.5, this.bridgeRestartHistory.length), 10000);
      log("INFO", "Restarting Bridge Service in " + backoffMs + "ms...");
      setTimeout(() => this.startBridgeService(), backoffMs);
    });
  }

  startConnectorAgent() {
    if (this.isShuttingDown) return;
    log("INFO", "Starting FEF Local Connector Agent...");
    const child = spawn(process.execPath, [CONNECTOR_SCRIPT], {
      cwd: ROOT_DIR,
      env: { ...process.env, LOCAL_BRIDGE_URL: LOCAL_BRIDGE_URL },
      stdio: ["ignore", "pipe", "pipe"]
    });
    this.connectorProcess = child;

    child.stdout.on("data", (d) => {
      const msg = d.toString().trim();
      if (msg.includes("Authenticated") || msg.includes("Connected") || msg.includes("ERROR")) {
        log("DEBUG", "[ConnectorStdout] " + msg);
      }
    });

    child.stderr.on("data", (d) => {
      log("WARN", "[ConnectorStderr] " + d.toString().trim());
    });

    child.on("exit", (code, signal) => {
      this.connectorProcess = null;
      if (this.isShuttingDown) return;
      log("WARN", "FEF Local Connector exited with code " + code + " signal " + signal);
      const isLoop = this.recordCrash(this.connectorRestartHistory);
      if (isLoop) {
        log("ERROR", "Connector exceeded rapid crash threshold. Halting connector restarts.");
        this.healthState.connectorAgent = "ERROR";
        return;
      }
      const backoffMs = Math.min(1000 * Math.pow(1.5, this.connectorRestartHistory.length), 10000);
      log("INFO", "Restarting Connector Agent in " + backoffMs + "ms...");
      setTimeout(() => this.startConnectorAgent(), backoffMs);
    });
  }

  async runHealthCycle() {
    try {
      this.healthState.uptimeSec = Math.floor((Date.now() - this.startTime) / 1000);
      this.healthState.lastUpdated = Date.now();

      const bridgeData = await this.queryLocalBridgeHealth();
      if (bridgeData && (bridgeData.localBridge === "ONLINE" || bridgeData.success)) {
        this.healthState.localBridge = "ONLINE";
        this.healthState.bridgeHeartbeatAgeMs = bridgeData.heartbeatAgeMs ?? null;

        if (bridgeData.mt5Connected) {
          this.healthState.mt5Terminal = "CONNECTED";
          this.healthState.broker = bridgeData.terminal?.broker || bridgeData.account?.broker || "Exness Technologies Ltd";
          this.healthState.server = bridgeData.terminal?.server || bridgeData.account?.server || "Exness-MT5Trial16";
        } else {
          this.healthState.mt5Terminal = "DISCONNECTED";
        }

        const quote = bridgeData.quotes?.XAUUSD || bridgeData.quotes?.GOLD;
        if (quote && quote.bid > 0 && quote.ask > 0) {
          this.healthState.bid = quote.bid;
          this.healthState.ask = quote.ask;
          this.healthState.mid = Number(((quote.bid + quote.ask) / 2).toFixed(quote.digits || 2));
          this.healthState.spread = quote.spread || Number((quote.ask - quote.bid).toFixed(quote.digits || 2));
          this.healthState.quoteTimestamp = quote.timestamp;
          this.healthState.brokerQuoteAgeMs = quote.ageMs ?? (Date.now() - quote.timestamp);
        }
      } else {
        this.healthState.localBridge = this.bridgeProcess ? "DEGRADED" : "OFFLINE";
        this.healthState.mt5Terminal = "OFFLINE";
      }

      const relayData = await this.queryRemoteRelayHealth();
      if (relayData && relayData.success) {
        this.healthState.remoteRelay = relayData.connected ? "ONLINE" : "DEGRADED";
        this.healthState.connectorAgent = relayData.connected ? "ONLINE" : "SYNCING";
        this.healthState.remoteRelayHeartbeatAgeMs = relayData.heartbeatAgeMs ?? null;
      } else {
        this.healthState.remoteRelay = "DEGRADED";
        this.healthState.connectorAgent = this.connectorProcess ? "SYNCING" : "OFFLINE";
      }

      const isFresh = typeof this.healthState.brokerQuoteAgeMs === "number" && this.healthState.brokerQuoteAgeMs < 5000;
      if (this.healthState.mt5Terminal === "CONNECTED" && isFresh) {
        this.healthState.priceAuthority = "MT5_BROKER";
        this.healthState.feedStatus = "LIVE";
      } else {
        this.healthState.priceAuthority = "REFERENCE";
        this.healthState.feedStatus = "FALLBACK";
      }

      this.healthState.supervisor = "ONLINE";

      if (this.persistState) {
        try {
          fs.writeFileSync(STATE_FILE, JSON.stringify(this.healthState, null, 2));
        } catch {}
      }
    } catch (err) {
      log("WARN", "Health cycle exception: " + err.message);
    }
  }

  startStatusServer() {
    this.httpServer = http.createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (req.url === "/health" || req.url === "/api/status" || req.url === "/") {
        res.writeHead(200);
        res.end(JSON.stringify(this.healthState, null, 2));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "Not found" }));
      }
    });

    this.httpServer.listen(SUPERVISOR_PORT, "127.0.0.1", () => {
      log("INFO", "Supervisor health status endpoint listening on http://127.0.0.1:" + SUPERVISOR_PORT + "/health");
    });

    this.httpServer.on("error", (e) => {
      log("WARN", "Status server warning: " + e.message);
    });
  }

  async start() {
    log("INFO", "================================================");
    log("INFO", "FEF MT5 CONNECTIVITY RUNTIME SUPERVISOR STARTING");
    log("INFO", "================================================");

    try { fs.writeFileSync(PID_FILE, String(process.pid)); } catch {}

    this.startStatusServer();

    const bridgeAlreadyActive = await this.checkPortInUse(BRIDGE_PORT);
    if (bridgeAlreadyActive) {
      log("INFO", "Detected existing MT5 HTTP Bridge on port " + BRIDGE_PORT + ". Adopting service.");
    } else {
      this.startBridgeService();
    }

    let bridgeReady = false;
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 800));
      const res = await this.queryLocalBridgeHealth();
      if (res && (res.localBridge === "ONLINE" || res.success)) {
        bridgeReady = true;
        log("INFO", "✓ MT5 HTTP Bridge confirmed READY on " + LOCAL_BRIDGE_URL);
        break;
      }
    }

    this.startConnectorAgent();

    this.pollInterval = setInterval(() => this.runHealthCycle(), HEALTH_POLL_INTERVAL_MS);
    await this.runHealthCycle();

    log("INFO", "✓ FEF Connectivity Supervisor initialized successfully.");
  }

  async shutdown() {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    log("INFO", "Shutting down FEF Connectivity Supervisor cleanly...");

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    if (this.httpServer) {
      try { this.httpServer.close(); } catch {}
    }

    if (this.connectorProcess) {
      log("INFO", "Stopping Connector Agent...");
      try { this.connectorProcess.kill("SIGTERM"); } catch {}
    }

    if (this.bridgeProcess) {
      log("INFO", "Stopping MT5 HTTP Bridge Service...");
      try { this.bridgeProcess.kill("SIGTERM"); } catch {}
    }

    try {
      if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    } catch {}

    log("INFO", "✓ FEF Connectivity Supervisor shutdown complete.");
    process.exit(0);
  }
}

if (require.main === module) {
  const supervisor = new ConnectivitySupervisor();
  process.on("SIGTERM", () => supervisor.shutdown());
  process.on("SIGINT", () => supervisor.shutdown());
  supervisor.start().catch((err) => {
    log("ERROR", "Fatal supervisor startup error: " + err.message);
    process.exit(1);
  });
}

module.exports = { ConnectivitySupervisor, RUNTIME_DIR, PID_FILE, STATE_FILE, LOG_FILE };
