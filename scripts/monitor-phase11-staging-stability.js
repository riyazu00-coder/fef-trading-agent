#!/usr/bin/env node
/**
 * FEF CORTEX — PHASE 11: 30-MINUTE CONTINUOUS STAGING TELEMETRY STABILITY MONITOR
 *
 * Continuously samples the live protected Vercel staging deployment:
 * https://fef-trading-dashboard-lqorlgig9-riazmohd.vercel.app/api/bridge/mt5?action=TELEMETRY
 *
 * Parameters:
 * - Duration: 1800s (30 minutes)
 * - Interval: 2000ms (2 seconds)
 * - Total cycles: 900
 * - Records: heartbeat age, quote freshness, point spread, active instrument count,
 *            connection state, disconnections, flapping, and order transport verification.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const STAGING_URL = 'https://fef-trading-dashboard-lqorlgig9-riazmohd.vercel.app/api/bridge/mt5?action=TELEMETRY';
const VERCEL_BYPASS_SECRET = process.env.VERCEL_PROTECTION_BYPASS || '[REDACTED_BYPASS_TOKEN]';
const OUTPUT_FILE = path.resolve(__dirname, '../data/phase11-staging-30min-monitor.json');
const DURATION_SEC = 1800; // 30 minutes
const INTERVAL_MS = 2000;  // 2 seconds
const TOTAL_CYCLES = Math.floor((DURATION_SEC * 1000) / INTERVAL_MS); // 900

let cycle = 0;
let successfulSamples = 0;
let failedSamples = 0;
let disconnections = 0;
let flaps = 0;
let lastConnectedState = null;
let maxHeartbeatAge = 0;
let minHeartbeatAge = Infinity;
let sumHeartbeatAge = 0;
let maxQuoteAge = 0;
let minQuoteAge = Infinity;
let sumQuoteAge = 0;
let maxInstrumentsAvailable = 0;
let minInstrumentsAvailable = Infinity;
let orderTransportViolations = 0;

const history = [];

console.log(`[Phase 11 Monitor] Starting 30-minute staging stability monitor (${TOTAL_CYCLES} cycles @ 2s)...`);
console.log(`[Phase 11 Monitor] Target: ${STAGING_URL}`);
console.log(`[Phase 11 Monitor] Started at: ${new Date().toISOString()}`);

function fetchStagingTelemetry() {
  return new Promise((resolve, reject) => {
    const parsed = new URL(STAGING_URL);
    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'x-vercel-protection-bypass': VERCEL_BYPASS_SECRET,
        'Accept': 'application/json'
      },
      timeout: 5000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 100)}`));
        }
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
      reject(new Error('Request timeout after 5000ms'));
    });
    req.end();
  });
}

const timer = setInterval(async () => {
  cycle++;
  const cycleTimestamp = new Date().toISOString();

  try {
    const data = await fetchStagingTelemetry();
    successfulSamples++;

    const isConnected = Boolean(data.mt5Connected);
    const transport = data.transport || 'UNKNOWN';
    const hbAge = typeof data.heartbeatAgeMs === 'number' ? data.heartbeatAgeMs : null;
    const quotes = data.quotes || {};
    const quotesCount = Object.keys(quotes).length;
    const xau = quotes.XAUUSD;
    const now = Date.now();
    const qAge = xau && xau.timestamp ? Math.max(0, now - xau.timestamp) : null;
    const spread = xau ? xau.spread : null;
    const bid = xau ? xau.bid : null;
    const ask = xau ? xau.ask : null;

    // Detect state flapping / disconnection
    if (!isConnected) {
      disconnections++;
    }
    if (lastConnectedState !== null && lastConnectedState !== isConnected) {
      flaps++;
    }
    lastConnectedState = isConnected;

    // Heartbeat metrics
    if (hbAge !== null) {
      if (hbAge > maxHeartbeatAge) maxHeartbeatAge = hbAge;
      if (hbAge < minHeartbeatAge) minHeartbeatAge = hbAge;
      sumHeartbeatAge += hbAge;
    }

    // Quote age metrics
    if (qAge !== null) {
      if (qAge > maxQuoteAge) maxQuoteAge = qAge;
      if (qAge < minQuoteAge) minQuoteAge = qAge;
      sumQuoteAge += qAge;
    }

    // Instrument availability
    if (quotesCount > maxInstrumentsAvailable) maxInstrumentsAvailable = quotesCount;
    if (quotesCount < minInstrumentsAvailable) minInstrumentsAvailable = quotesCount;

    // Order transport safety invariant check
    if (data.mode !== 'READ_ONLY' || data.operatingMode !== 'READ_ONLY') {
      orderTransportViolations++;
    }

    const sample = {
      cycle,
      timestamp: cycleTimestamp,
      transport,
      mt5Connected: isConnected,
      heartbeatAgeMs: hbAge,
      quotesAvailable: quotesCount,
      xauusd: { bid, ask, spread, ageMs: qAge },
      disconnections,
      flaps
    };

    history.push(sample);

    // Log progress every 15 cycles (30s) or on anomalies
    if (cycle % 15 === 0 || cycle === 1 || !isConnected) {
      const pct = ((cycle / TOTAL_CYCLES) * 100).toFixed(1);
      console.log(`[Cycle ${cycle}/${TOTAL_CYCLES} (${pct}%)] state=${data.state || 'N/A'} | ` +
        `transport=${transport} | hbAge=${hbAge}ms | quotes=${quotesCount}/25 | ` +
        `XAUUSD=${bid}/${ask} sp=${spread} qAge=${qAge}ms | disconn=${disconnections} flaps=${flaps}`);
    }

  } catch (err) {
    failedSamples++;
    console.error(`[Cycle ${cycle}/${TOTAL_CYCLES}] ERROR: ${err.message}`);
    history.push({
      cycle,
      timestamp: cycleTimestamp,
      error: err.message
    });
  }

  // Check if run completed
  if (cycle >= TOTAL_CYCLES) {
    clearInterval(timer);
    const avgHeartbeatAgeMs = successfulSamples > 0 ? Math.round(sumHeartbeatAge / successfulSamples) : 0;
    const avgQuoteAgeMs = successfulSamples > 0 ? Math.round(sumQuoteAge / successfulSamples) : 0;

    const summary = {
      completedAt: new Date().toISOString(),
      durationSeconds: DURATION_SEC,
      samplingIntervalMs: INTERVAL_MS,
      totalCycles: cycle,
      successfulSamples,
      failedSamples,
      successRatePct: ((successfulSamples / cycle) * 100).toFixed(2),
      disconnections,
      flaps,
      heartbeatAgeMetrics: {
        minMs: minHeartbeatAge === Infinity ? 0 : minHeartbeatAge,
        maxMs: maxHeartbeatAge,
        avgMs: avgHeartbeatAgeMs
      },
      quoteAgeMetrics: {
        minMs: minQuoteAge === Infinity ? 0 : minQuoteAge,
        maxMs: maxQuoteAge,
        avgMs: avgQuoteAgeMs
      },
      instrumentCoverage: {
        minAvailable: minInstrumentsAvailable === Infinity ? 0 : minInstrumentsAvailable,
        maxAvailable: maxInstrumentsAvailable,
        target: 25
      },
      orderTransportViolations,
      verdict: (disconnections === 0 && failedSamples === 0 && orderTransportViolations === 0 && successfulSamples >= 890)
        ? 'STABLE_AND_VERIFIED'
        : 'CONDITIONAL'
    };

    const finalReport = {
      summary,
      history
    };

    try {
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalReport, null, 2));
      console.log(`\n=================================================================`);
      console.log(`PHASE 11: 30-MINUTE STAGING STABILITY MONITOR COMPLETE`);
      console.log(`=================================================================`);
      console.log(`Total Cycles        : ${cycle}/${TOTAL_CYCLES}`);
      console.log(`Successful Samples  : ${successfulSamples} (${summary.successRatePct}%)`);
      console.log(`Failed Samples      : ${failedSamples}`);
      console.log(`Disconnections      : ${disconnections}`);
      console.log(`Connection Flaps    : ${flaps}`);
      console.log(`Avg Heartbeat Age   : ${avgHeartbeatAgeMs}ms (Max: ${maxHeartbeatAge}ms)`);
      console.log(`Avg Quote Age       : ${avgQuoteAgeMs}ms (Max: ${maxQuoteAge}ms)`);
      console.log(`Instruments Online  : ${maxInstrumentsAvailable}/25`);
      console.log(`Order Violations    : ${orderTransportViolations}`);
      console.log(`Final Verdict       : ${summary.verdict}`);
      console.log(`Saved report to     : ${OUTPUT_FILE}`);
      console.log(`=================================================================\n`);
    } catch (e) {
      console.error(`Failed to write monitor report: ${e.message}`);
    }
  }
}, INTERVAL_MS);

