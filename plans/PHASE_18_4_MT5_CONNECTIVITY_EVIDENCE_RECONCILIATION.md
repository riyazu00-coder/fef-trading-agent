# FEF CORTEX — PHASE 18.4
## MT5 CONNECTIVITY EVIDENCE RECONCILIATION REPORT

**Audit Date:** 2026-11-04
**Audit Purpose:** Reconcile production dashboard evidence ("REMOTE MT5 TELEMETRY — LIVE", Exness connected, 0.4s latency) with Phase 18.3 infrastructure findings
**Verification Mode:** STRICT EVIDENCE AUDIT (READ_ONLY, Zero mutating commands, Zero restarts)
**Production Domain:** `https://app.feftradingsolutions.com`
**Remote Relay:** `https://fef-secure-remote-relay.onrender.com`
**Local Bridge:** `http://127.0.0.1:5556`
**Supervisor Health:** `http://127.0.0.1:5558/health`

---

## 1. Executive Summary & Reconciliation Findings

The owner observed the following live state on the production dashboard (`https://app.feftradingsolutions.com`):
- **MT5: EXNESS** — Green connected indicator
- **REMOTE MT5 TELEMETRY — LIVE**
- **Bid: 3938.339 / Ask: 3938.379**
- **Telemetry updated 0.4 seconds ago**
- **Broker: Exness Technologies Ltd**
- **Normal basis: 0 bps**

### The Core Question:
*Does this screenshot prove that MT5 is running independently in the cloud, contradicting the Phase 18.3 finding that the system is tied to the developer's MacBook?*

### The Reconciliation Determination:
**NO. There is no contradiction. The dashboard evidence and Phase 18.3 findings describe two different parts of the same verified pipeline.**

1. **Why the Dashboard Displays "REMOTE MT5 TELEMETRY — LIVE":**
   The word `REMOTE` in the UI does not mean MetaTrader 5 is hosted on a remote cloud server. It indicates that the **Vercel web client** is receiving broker quotes through the **cloud relay (`https://fef-secure-remote-relay.onrender.com`)** via `/api/remote-mt5/telemetry`, rather than directly over `localhost:5556`.
2. **Where the Data Actually Originates:**
   Live empirical inspection proves that the telemetry displayed on Vercel is being **streamed in real time from the local MacBook (`macs-MacBook-Pro.local`)**. The MacBook's Wine MT5 terminal (PID 1138) feeds the local bridge (PID 1368), which feeds the local connector agent (PID 1374), which sends WebSocket frames to Render every 500ms.
3. **What Happens if the MacBook is Closed:**
   Because the MacBook is the sole producer of these ticks, closing the MacBook or letting it sleep stops the WebSocket feed. Within 10 to 30 seconds, Render telemetry ages out, and the dashboard transitions from green `REMOTE MT5 TELEMETRY` to amber `MT5 BROKER (AGING)` and finally red `OFFLINE`.
4. **Is Dashboard Telemetry Sufficient for Autonomous Signals?**
   **NO.** The dashboard is a read-only browser UI that displays quotes for whichever single asset the user has open. It does **not** run the continuous 32-agent scanning loop for all 26 assets, and it **cannot** write to `data/fef-telegram-signals.db` or dispatch signals to Telegram. Only `scripts/fef-background-worker.ts` can generate and dispatch autonomous signals.

---

## 2. End-to-End Telemetry Flow (Actual Implementation)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             ACTUAL DATA PIPELINE                                 │
│                                                                                  │
│  [STEP 1: BROKER]                                                                │
│  Exness Trial 16 Server (Live Market Feeds: Gold, Forex, Crypto, Indices)        │
│         │ (TCP Market Data Stream)                                               │
│         ▼                                                                        │
│  [STEP 2: LOCAL MACBOOK — WINE SUBSYSTEM]                                        │
│  C:\Program Files\MetaTrader 5\terminal64.exe (PID 1138)                         │
│  Running Expert Advisor: FEF_HTTP_Bridge.mq5 (Native WebRequest push)            │
│         │ (HTTP POST loopback: http://127.0.0.1:5556/mt5/quote)                  │
│         ▼                                                                        │
│  [STEP 3: LOCAL MACBOOK — NODE.JS BRIDGE]                                        │
│  scripts/mt5-http-bridge-service.js (PID 1368, Port 5556)                        │
│  Stores 27 active quotes in RAM; enforces READ_ONLY                              │
│         │ (HTTP GET loopback: http://127.0.0.1:5556/api/status)                  │
│         ▼                                                                        │
│  [STEP 4: LOCAL MACBOOK — CONNECTOR AGENT]                                       │
│  scripts/fef-local-connector-agent.js (PID 1374)                                 │
│  - Persists candles to local SQLite (data/fef-cortex.db)                         │
│  - Pushes outbound WebSocket packets to Render cloud                             │
│         │ (TLS WebSocket Outbound: wss://fef-secure-remote-relay.onrender.com)   │
│         ▼                                                                        │
│  [STEP 5: CLOUD — RENDER PAAS RELAY]                                             │
│  https://fef-secure-remote-relay.onrender.com (Node.js RAM-only proxy)           │
│  Stores latest snapshot in memory: telemetrySnapshots.set('fef-connector-primary')│
│         │ (HTTPS GET: /device/fef-connector-primary-01/telemetry)                │
│         ▼                                                                        │
│  [STEP 6: CLOUD — VERCEL SERVERLESS FRONTEND]                                    │
│  https://app.feftradingsolutions.com/api/remote-mt5/telemetry                    │
│  Serverless function fetches snapshot from Render and forwards to browser        │
│         │ (JSON Response)                                                        │
│         ▼                                                                        │
│  [STEP 7: USER BROWSER DASHBOARD]                                                │
│  Cockpit Page -> MarketOverviewCard.tsx                                          │
│  Renders:                                                                        │
│    - "REMOTE MT5 TELEMETRY" (Cyan badge with pulsing dot)                        │
│    - "MT5: EXNESS" (Green connected indicator)                                   │
│    - Bid / Ask: 3938.339 / 3938.379 (Updated 0.4s ago)                           │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Empirical Verification Evidence

During this audit (2026-11-04 09:00–09:03 UTC+5:30), each hop was directly tested with live commands:

### A. Render Remote Relay Verification
Direct query to `https://fef-secure-remote-relay.onrender.com/device/fef-connector-primary-01/telemetry`:
```json
{
  "connected": true,
  "connectionState": "ONLINE",
  "broker": "Exness Technologies Ltd",
  "server": "Exness-MT5Trial16",
  "quoteTimestamp": 1793763023000,
  "latencyAgeMs": 149.6,
  "quoteCount": 27,
  "XAUUSD": {
    "bid": 3939.538,
    "ask": 3939.578,
    "spread": 40,
    "freshness": "FRESH",
    "isStale": false,
    "ageMs": 1043
  }
}
```
**Evidence:** The remote relay on Render is receiving live ticks from the connector with **sub-second freshness (149.6ms age)**.

### B. Local MT5 HTTP Bridge Verification
Direct authenticated query to `http://127.0.0.1:5556/api/status` using local device token:
```json
{
  "statusCode": 200,
  "success": true,
  "mt5Connected": true,
  "broker": "Exness Technologies Ltd",
  "quoteCount": 27,
  "XAUUSD": {
    "bid": 3938.592,
    "ask": 3938.632,
    "spread": 40,
    "freshness": "FRESH",
    "isStale": false,
    "ageMs": 1561
  }
}
```
**Evidence:** The local bridge on the MacBook is actively receiving ticks from `FEF_HTTP_Bridge.mq5` running in Wine MT5. The bid/ask prices match the live gold market and match the price regime shown in the owner's screenshot.

### C. Local Supervisor Health Verification
Direct query to `http://127.0.0.1:5558/health`:
```json
{
  "supervisor": "ONLINE",
  "localBridge": "ONLINE",
  "connectorAgent": "ONLINE",
  "localDatabase": "ONLINE",
  "localCandlesCount": 24066,
  "remoteRelay": "ONLINE",
  "mt5Terminal": "CONNECTED",
  "broker": "Exness Technologies Ltd",
  "server": "Exness-MT5Trial16",
  "symbol": "XAUUSD",
  "bid": 3939.133,
  "ask": 3939.173,
  "uptimeSec": 83180,
  "feedStatus": "LIVE"
}
```
**Evidence:** The supervisor daemon (PID 1125) has been continuously managing the bridge and connector for **83,180 seconds (~23.1 hours)**.

---

## 4. Component-by-Component Status Matrix

| Component | Status | Empirical Findings | Limitations / Dependencies |
| :--- | :---: | :--- | :--- |
| **Dashboard MT5 Connection** | **VERIFIED** | Web UI consumes `/api/remote-mt5/telemetry`. Renders green "MT5: EXNESS" badge, cyan "REMOTE MT5 TELEMETRY", and live bid/ask with < 1s latency. | Passive client display only. Does not run multi-asset scanning or signal generation. |
| **Remote MT5 Telemetry** | **VERIFIED** | Render cloud relay (`fef-secure-remote-relay.onrender.com`) actively receives WebSocket push and serves JSON telemetry with 150ms freshness. | RAM-only proxy. Does not run MT5; holds no persistent database; goes dark if MacBook disconnects. |
| **Local MT5 Terminal** | **VERIFIED WITH LIMITATIONS** | Wine MT5 (`terminal64.exe` PID 1138) connected to `Exness-MT5Trial16`. Executing `FEF_HTTP_Bridge.mq5`. | Runs inside Wine on a macOS laptop with sleep enabled (`sleep = 1`). Requires user GUI session. |
| **HTTP Bridge** | **VERIFIED** | `scripts/mt5-http-bridge-service.js` (PID 1368) listening on `127.0.0.1:5556`. Authenticated queries return 27 live quotes. | Dependent on local Wine MT5 terminal and loopback network. |
| **Connector Agent** | **VERIFIED** | `scripts/fef-local-connector-agent.js` (PID 1374) streams quotes to Render via WebSocket and persists candles to SQLite. | Dependent on MacBook Wi-Fi and power. |
| **Supervisor** | **VERIFIED WITH LIMITATIONS** | `scripts/fef-bridge-supervisor.js` (PID 1125) active under macOS launchd. Uptime: 23+ hours. Health port 5558 online. | Running 23h-old process instance that has not reloaded the code to spawn the background worker child. |
| **Background Worker** | **VERIFIED WITH LIMITATIONS** | `scripts/fef-background-worker.ts` code is complete, tested, and verified. | Currently idle. Not running as an active daemon child because PID 1125 has not been restarted. |
| **Market Scanning** | **VERIFIED WITH LIMITATIONS** | Connector agent is actively syncing candles into SQLite (24,066 candles). Multi-timeframe pipeline verified across 25 assets. | Autonomous periodic scanning across all assets requires the background worker to be running. |
| **Signal Generation** | **VERIFIED WITH LIMITATIONS** | 21-gate eligibility engine, TP2 R:R >= 2.0, ranging WAIT posture, and direction logic fully tested and verified. | Currently triggered on-demand via cockpit UI or test replay; autonomous trigger requires active worker loop. |
| **Telegram Delivery Pipeline**| **VERIFIED WITH LIMITATIONS** | `candidateIntakeCoordinator`, SQLite queue, deduplication keys, and dry-run dispatch pipeline verified. | `TELEGRAM_SIGNAL_DRY_RUN = true`. 0 live messages dispatched to `@forexmetalsignals` pending authorization. |

---

## 5. Why the Dashboard Telemetry is NOT Sufficient for Autonomous Trading Signals

It is natural to assume that because the dashboard shows live quotes, the trading robot is automatically scanning and signaling. **This is not how the architecture works:**

1. **Dashboard is Client-Driven:**
   The browser cockpit only evaluates the **single active asset** currently displayed on screen (e.g. `XAUUSD`). It does not run background analysis on the other 25 assets.
2. **Dashboard Cannot Write to Telegram Queue:**
   The browser runs client-side JavaScript. Institutional signal dispatch requires atomic server-side transactions in `data/fef-telegram-signals.db`. The browser client has no database write access.
3. **Candidate Intake Coordinator Isolation:**
   `candidateIntakeCoordinator.evaluateAndDispatchCandidates()` is **only** invoked by `scripts/fef-background-worker.ts` (and test harnesses). It is never invoked from browser page renders.
4. **Conclusion:**
   The dashboard's live telemetry proves that **data ingress is healthy**, but **signal generation requires the background worker process to continuously evaluate that data across all assets**.

---

## 6. Reconciliation of Phase 18.3 Report

| Topic | Apparent Impression | Reconciled Reality |
| :--- | :--- | :--- |
| **"REMOTE MT5" Label** | Suggested MT5 was hosted in the cloud. | Denotes that Vercel is reading from the **cloud relay** instead of localhost. MT5 itself is running locally under Wine on the MacBook. |
| **Live Telemetry vs. MacBook Dependence** | "If it's live on Vercel, it must not depend on the MacBook." | The live data on Vercel **is being produced by the MacBook right now**. The MacBook is currently on, awake, and streaming ticks. |
| **Travel Readiness** | Phase 18.3 verdict: NOT READY for travel. | **This verdict remains 100% accurate.** If the owner packs the MacBook into a travel bag, Wine MT5 and the connector stop. The dashboard will go offline within 30 seconds. |
| **Zero Signals Received** | Why no signals if telemetry is green? | Because the background worker process (`fef-background-worker.ts`) is not actively running as a daemon child under the 23-hour-old supervisor PID 1125. |

---

## 7. Next Actions (Awaiting Owner Authorization)

In compliance with instructions:
- Zero lines of working connection code were modified.
- Zero service restarts were performed.
- Zero broker orders were sent (`READ_ONLY` strictly maintained).
- Zero Telegram messages were broadcast.
- The execution journal remains untouched (17 lines, exact SHA-256).

**When the owner authorizes:**
1. Reload the launchd supervisor (`launchctl kickstart -k gui/$(id -u)/com.fef.mt5-connectivity`) so that `scripts/fef-background-worker.ts` is spawned as an active child daemon.
2. Once the worker is running alongside the connector, autonomous multi-asset scanning and candidate intake will begin processing all 26 assets every 15 seconds.
3. For travel readiness, plan the migration of MT5 and the supervisor to an always-on Windows/Linux VPS.
