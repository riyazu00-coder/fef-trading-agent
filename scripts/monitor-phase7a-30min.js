#!/usr/bin/env node
/**
 * FEF CORTEX — Phase 7A 30-Minute Continuous Live Telemetry Monitor
 * Samples every 2 seconds for 1800 seconds (900 cycles).
 * Records heartbeat age, quote freshness, spread, and disconnections.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.resolve(__dirname, '../data/phase7a-30min-monitor.json');
const DURATION_SEC = 1800; // 30 minutes
const INTERVAL_MS = 2000;
const TOTAL_CYCLES = Math.floor((DURATION_SEC * 1000) / INTERVAL_MS);

let cycle = 0;
let disconnections = 0;
let staleQuotes = 0;
let freshQuotes = 0;
let maxHeartbeatAge = 0;
let maxQuoteAge = 0;
let history = [];

console.log(`[Phase 7A Monitor] Starting 30-minute continuous telemetry monitor (${TOTAL_CYCLES} cycles @ 2s)...`);

function fetchTelemetry() {
  return new Promise((resolve, reject) => {
    const req = http.get('http://localhost:3000/api/bridge/mt5?action=TELEMETRY', { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

const timer = setInterval(async () => {
  cycle++;
  const now = new Date().toISOString();
  try {
    const data = await fetchTelemetry();
    const xau = data.quotes?.XAUUSD;
    const isConnected = Boolean(data.mt5Connected);
    const hbAge = data.heartbeatAgeMs || 0;
    const qAge = xau?.ageMs || 0;
    const spread = xau?.spread ?? null;
    const bid = xau?.bid ?? null;
    const ask = xau?.ask ?? null;
    const freshness = xau?.freshness || 'UNKNOWN';

    if (!isConnected) disconnections++;
    if (freshness === 'FRESH') freshQuotes++;
    else staleQuotes++;

    if (hbAge > maxHeartbeatAge) maxHeartbeatAge = hbAge;
    if (qAge > maxQuoteAge) maxQuoteAge = qAge;

    const sample = {
      cycle,
      timestamp: now,
      mt5Connected: isConnected,
      feedStatus: data.feedStatus,
      hbAge,
      bid,
      ask,
      spread,
      qAge,
      freshness
    };

    history.push(sample);
    if (history.length > 50) history.shift(); // keep sliding window of recent samples

    if (cycle % 15 === 0 || !isConnected || cycle === 1) {
      console.log(`[Cycle ${cycle}/${TOTAL_CYCLES} (${Math.round((cycle/TOTAL_CYCLES)*100)}%)] mt5Connected=${isConnected} | feed=${data.feedStatus} | hbAge=${hbAge}ms | XAUUSD: ${bid}/${ask} sp=${spread} age=${qAge}ms (${freshness}) | disconn=${disconnections}`);
    }

    // Persist status
    const status = {
      startedAt: history[0]?.timestamp || now,
      updatedAt: now,
      elapsedSec: Math.round((cycle * INTERVAL_MS) / 1000),
      totalCycles: TOTAL_CYCLES,
      currentCycle: cycle,
      progressPercent: Math.round((cycle / TOTAL_CYCLES) * 100),
      isComplete: cycle >= TOTAL_CYCLES,
      metrics: {
        disconnections,
        freshQuotes,
        staleQuotes,
        maxHeartbeatAge,
        maxQuoteAge
      },
      latestSample: sample,
      recentHistory: history.slice(-10)
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(status, null, 2));

  } catch (err) {
    disconnections++;
    console.error(`[Cycle ${cycle}] Error sampling telemetry:`, err.message);
  }

  if (cycle >= TOTAL_CYCLES) {
    clearInterval(timer);
    console.log(`[Phase 7A Monitor] Completed 30-minute monitoring window. Total samples: ${cycle}, Disconnections: ${disconnections}`);
  }
}, INTERVAL_MS);

