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
const { LocalTelemetryRepository } = require("./fef-local-telemetry-repository");

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

const ALLOWED_ENV_KEYS = new Set([
  'FEF_BRIDGE_TOKEN',
  'FEF_TELEMETRY_DEVICE_SECRET',
  'FEF_TELEMETRY_DEVICE_ID',
  'FEF_CLOUD_TELEMETRY_URL',
  'NEXT_PUBLIC_APP_URL',
  'FEF_REMOTE_RELAY_URL',
  'FEF_REMOTE_DEVICE_ID',
  'FEF_REMOTE_KEY_ID',
  'FEF_REMOTE_DEVICE_SECRET'
]);

// Safe OS/Node runtime variables that are strictly non-credential
const SAFE_SYSTEM_ENV_KEYS = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'NODE_EXTRA_CA_CERTS'];

function loadAllowlistedEnv(envFilePath) {
  const targetPath = envFilePath || path.resolve(ROOT_DIR, '.env.local');
  if (!fs.existsSync(targetPath)) return {};
  try {
    const loaded = {};
    const content = fs.readFileSync(targetPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const eqIdx = trimmed.indexOf('=');
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (ALLOWED_ENV_KEYS.has(key)) {
        if (!process.env[key] || process.env[key].trim() === '') {
          process.env[key] = val;
        }
        loaded[key] = true;
      }
    }
    return loaded;
  } catch {
    return {};
  }
}

// Load allowlisted environment variables for headless background runs
loadAllowlistedEnv();

function buildBridgeChildEnv(sourceEnv = process.env, port = BRIDGE_PORT) {
  const env = {
    PORT: String(port)
  };
  if (sourceEnv.FEF_BRIDGE_TOKEN && sourceEnv.FEF_BRIDGE_TOKEN.trim() !== '') {
    env.FEF_BRIDGE_TOKEN = sourceEnv.FEF_BRIDGE_TOKEN.trim();
  }
  for (const key of SAFE_SYSTEM_ENV_KEYS) {
    if (sourceEnv[key]) {
      env[key] = sourceEnv[key];
    }
  }
  return env;
}

function buildConnectorChildEnv(sourceEnv = process.env, bridgeUrl = LOCAL_BRIDGE_URL) {
  const env = {
    FEF_LOCAL_BRIDGE_URL: bridgeUrl
  };
  const connectorKeys = [
    'FEF_BRIDGE_TOKEN',
    'FEF_TELEMETRY_DEVICE_SECRET',
    'FEF_TELEMETRY_DEVICE_ID',
    'FEF_CLOUD_TELEMETRY_URL',
    'NEXT_PUBLIC_APP_URL',
    'FEF_REMOTE_RELAY_URL',
    'FEF_REMOTE_DEVICE_ID',
    'FEF_REMOTE_KEY_ID',
    'FEF_REMOTE_DEVICE_SECRET'
  ];
  for (const key of connectorKeys) {
    if (sourceEnv[key] && sourceEnv[key].trim() !== '') {
      env[key] = sourceEnv[key].trim();
    }
  }
  for (const key of SAFE_SYSTEM_ENV_KEYS) {
    if (sourceEnv[key]) {
      env[key] = sourceEnv[key];
    }
  }
  return env;
}

const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

function log(level, message, meta) {
  const ts = new Date().toISOString();
  const metaStr = meta ? " " + JSON.stringify(meta) : "";
  const line = "[" + ts + "] [" + level + "] " + message + metaStr + "\n";
  try {
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE);
      if (stats.size > MAX_LOG_SIZE_BYTES) {
        const backupFile = LOG_FILE + ".old";
        try { if (fs.existsSync(backupFile)) fs.unlinkSync(backupFile); } catch {}
        try { fs.renameSync(LOG_FILE, backupFile); } catch {}
      }
    }
    fs.appendFileSync(LOG_FILE, line);
  } catch {}
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
    this.lastConnectorPush = null;
    this.lastConnectorSuccess = false;

    this.localRepo = null;
    try {
      this.localRepo = new LocalTelemetryRepository();
    } catch (e) {
      log("WARN", "Failed to initialize LocalTelemetryRepository in supervisor: " + e.message);
    }

    this.healthState = {
      supervisor: "STARTING",
      localBridge: "OFFLINE",
      connectorAgent: "OFFLINE",
      localDatabase: "INITIALIZING",
      storageMode: (process.env.FEF_TELEMETRY_STORAGE_MODE || "LOCAL").toUpperCase(),
      cloudSync: "DISABLED",
      localPersistenceAgeMs: null,
      localQuotesCount: 0,
      localCandlesCount: 0,
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
    const bridgeEnv = buildBridgeChildEnv(process.env, BRIDGE_PORT);
    const child = spawn(process.execPath, [BRIDGE_SCRIPT], {
      cwd: ROOT_DIR,
      env: bridgeEnv,
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
    const connectorEnv = buildConnectorChildEnv(process.env, LOCAL_BRIDGE_URL);
    const child = spawn(process.execPath, [CONNECTOR_SCRIPT], {
      cwd: ROOT_DIR,
      env: connectorEnv,
      stdio: ["ignore", "pipe", "pipe"]
    });
    this.connectorProcess = child;

    child.stdout.on("data", (d) => {
      const msg = d.toString().trim();
      if (msg.includes("Successfully pushed") || msg.includes("Authenticated") || msg.includes("Connected") || msg.includes("ERROR") || msg.includes("CONNECTOR")) {
        log("INFO", "[Connector] " + msg);
      }
      if (msg.includes("Successfully pushed")) {
        this.lastConnectorPush = Date.now();
        this.lastConnectorSuccess = true;
      }
    });

    child.stderr.on("data", (d) => {
      const msg = d.toString().trim();
      log("WARN", "[ConnectorStderr] " + msg);
      if (msg.includes("Cloud ingress returned") || msg.includes("STORAGE_UNAVAILABLE") || msg.includes("HTTP 503") || msg.includes("HTTP 429")) {
        this.lastConnectorPush = Date.now();
        this.lastConnectorSuccess = false;
      }
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

      if (this.lastConnectorPush) {
        this.healthState.connectorHeartbeatAgeMs = Date.now() - this.lastConnectorPush;
      }

      const bridgeData = await this.queryLocalBridgeHealth();
      if (bridgeData && (bridgeData.localBridge === "ONLINE" || (bridgeData.success && (bridgeData.port === 5556 || bridgeData.port === "5556")))) {
        this.healthState.localBridge = "ONLINE";
        this.healthState.bridgeHeartbeatAgeMs = bridgeData.heartbeatAgeMs ?? null;

        if (bridgeData.mt5Connected) {
          this.healthState.mt5Terminal = "CONNECTED";
          this.healthState.broker = bridgeData.terminal?.broker || bridgeData.account?.broker || "UNKNOWN";
          this.healthState.server = bridgeData.terminal?.server || bridgeData.account?.server || "UNKNOWN";
        } else {
          this.healthState.mt5Terminal = "DISCONNECTED";
          this.healthState.broker = "UNKNOWN";
          this.healthState.server = "UNKNOWN";
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

      // Check local SQLite database health and freshness
      let isLocalDbFresh = false;
      if (this.localRepo && this.localRepo.isHealthy()) {
        try {
          const connState = this.localRepo.getConnectorState();
          const latestHb = this.localRepo.getLatestHeartbeat();
          const now = Date.now();
          const lastPersist = connState?.last_local_persist || (latestHb ? new Date(latestHb.received_at).getTime() : null);
          const ageMs = lastPersist ? Math.max(0, now - lastPersist) : null;
          this.healthState.localPersistenceAgeMs = ageMs;

          if (ageMs !== null && ageMs < 15000) {
            this.healthState.localDatabase = "ONLINE";
            isLocalDbFresh = true;
          } else if (ageMs !== null) {
            this.healthState.localDatabase = "STALE";
          } else {
            this.healthState.localDatabase = "ONLINE";
            isLocalDbFresh = true;
          }

          const allQuotes = this.localRepo.getAllQuotes();
          this.healthState.localQuotesCount = Object.keys(allQuotes).length;
          const candleMetrics = this.localRepo.getCandleMetrics();
          this.healthState.localCandlesCount = candleMetrics.count;
        } catch {
          this.healthState.localDatabase = "DEGRADED";
        }
      } else {
        this.healthState.localDatabase = "OFFLINE";
      }

      const isConnectorLive = Boolean(
        isLocalDbFresh ||
        (this.lastConnectorSuccess &&
        typeof this.healthState.connectorHeartbeatAgeMs === 'number' &&
        this.healthState.connectorHeartbeatAgeMs < 15000)
      );

      const relayData = await this.queryRemoteRelayHealth();
      if (relayData && relayData.success) {
        this.healthState.remoteRelay = relayData.connected ? "ONLINE" : "DEGRADED";
        this.healthState.connectorAgent = (relayData.connected || isConnectorLive) ? "ONLINE" : "SYNCING";
        this.healthState.remoteRelayHeartbeatAgeMs = relayData.heartbeatAgeMs ?? null;
      } else {
        this.healthState.remoteRelay = "DEGRADED";
        this.healthState.connectorAgent = isConnectorLive ? "ONLINE" : (this.connectorProcess ? "SYNCING" : "OFFLINE");
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
      const parsedUrl = new URL(req.url, "http://127.0.0.1:" + SUPERVISOR_PORT);
      const pathname = parsedUrl.pathname;

      if (pathname === "/health" || pathname === "/api/status" || pathname === "/") {
        res.writeHead(200);
        res.end(JSON.stringify(this.healthState, null, 2));
      } else if (pathname === "/telemetry/quotes") {
        if (this.localRepo && this.localRepo.isHealthy()) {
          const quotes = this.localRepo.getAllQuotes();
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, count: Object.keys(quotes).length, quotes }, null, 2));
        } else {
          res.writeHead(503);
          res.end(JSON.stringify({ success: false, error: "LOCAL_DATABASE_UNAVAILABLE" }));
        }
      } else if (pathname === "/telemetry/candles") {
        const symbol = parsedUrl.searchParams.get("symbol") || "XAUUSD";
        const timeframe = parsedUrl.searchParams.get("timeframe") || "M15";
        const limit = parseInt(parsedUrl.searchParams.get("limit") || "50", 10);
        if (this.localRepo && this.localRepo.isHealthy()) {
          const candles = this.localRepo.getCandles(symbol, timeframe, limit);
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, symbol, timeframe, count: candles.length, candles }, null, 2));
        } else {
          res.writeHead(503);
          res.end(JSON.stringify({ success: false, error: "LOCAL_DATABASE_UNAVAILABLE" }));
        }
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

    // Provision active device credential into local MT5 sandbox
    try {
      const { provisionMt5SandboxCredential } = require('./fef-device-identity');
      const provResult = provisionMt5SandboxCredential();
      if (provResult.provisioned) {
        log("INFO", `✓ MT5 Sandbox credential provisioned (${provResult.paths.length} file paths)`);
      } else if (provResult.error) {
        log("WARN", `MT5 Sandbox provisioning notice: ${provResult.error}`);
      }
    } catch (e) {
      log("WARN", `MT5 Sandbox provisioning exception: ${e.message}`);
    }

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

    if (this.localRepo) {
      try { this.localRepo.close(); } catch {}
      this.localRepo = null;
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

module.exports = {
  ConnectivitySupervisor,
  RUNTIME_DIR,
  PID_FILE,
  STATE_FILE,
  LOG_FILE,
  loadAllowlistedEnv,
  ALLOWED_ENV_KEYS,
  SAFE_SYSTEM_ENV_KEYS,
  buildBridgeChildEnv,
  buildConnectorChildEnv
};
