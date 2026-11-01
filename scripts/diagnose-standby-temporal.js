const http = require('http');
const https = require('https');
const { resolveActiveBridgeToken } = require('./fef-device-identity');

const TOKEN = resolveActiveBridgeToken().token;
const LOCAL_BRIDGE_URL = `http://127.0.0.1:5556/api/status?token=${encodeURIComponent(TOKEN)}`;
const RELAY_STATUS_URL = 'https://fef-secure-remote-relay.onrender.com/device/fef-connector-primary-01/status';
const RELAY_TELEMETRY_URL = 'https://fef-secure-remote-relay.onrender.com/device/fef-connector-primary-01/telemetry';
const VERCEL_BRIDGE_URL = 'https://app.feftradingsolutions.com/api/bridge/mt5?action=TELEMETRY';
const VERCEL_FALLBACK_URL = 'https://app.feftradingsolutions.com/api/remote-mt5/telemetry';

function fetchUrl(url, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const isHttps = url.startsWith('https:');
    const lib = isHttps ? https : http;
    const req = lib.get(url, {
      timeout: timeoutMs,
      headers: { 'Cache-Control': 'no-cache' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: JSON.parse(data) });
        } catch (e) {
          resolve({ ok: false, status: res.statusCode, error: 'JSON_PARSE_ERROR' });
        }
      });
    });
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'TIMEOUT' });
    });
  });
}

// Client UI evaluation replication
function evaluateClientUI(bridgeRes, fallbackRes, stateRef) {
  let data = null;
  let localOnline = false;
  let mt5Online = false;
  let isRemote = false;

  if (bridgeRes?.ok && bridgeRes?.json && typeof bridgeRes.json === 'object') {
    data = bridgeRes.json;
    localOnline = data.localBridge === 'ONLINE' || data.success === true;
    mt5Online = Boolean(data.mt5Connected);
    isRemote = false;
  }

  if (!mt5Online) {
    if (fallbackRes?.ok && fallbackRes?.json?.connected && fallbackRes?.json?.success) {
      data = fallbackRes.json;
      localOnline = true;
      mt5Online = true;
      isRemote = true;
    }
  }

  const HEARTBEAT_FRESH_THRESHOLD_MS = 10_000;
  const HEARTBEAT_WARNING_THRESHOLD_MS = 20_000;
  const HEARTBEAT_EXPIRED_THRESHOLD_MS = 20_000;
  const MAX_TRANSIENT_POLL_FAILURES = 6;

  const rawHeartbeatAge = data && typeof data.heartbeatAgeMs === 'number' ? data.heartbeatAgeMs : null;
  const isAuthoritativeConnected = Boolean(data && mt5Online);

  let nextState = 'OFFLINE';
  let isMt5Connected = false;

  if (isAuthoritativeConnected) {
    if (rawHeartbeatAge === null || rawHeartbeatAge <= HEARTBEAT_FRESH_THRESHOLD_MS) {
      nextState = 'ONLINE';
      isMt5Connected = true;
      stateRef.consecutiveFailures = 0;
      stateRef.lastSuccessTime = Date.now();
    } else if (rawHeartbeatAge <= HEARTBEAT_WARNING_THRESHOLD_MS) {
      nextState = 'DEGRADED';
      isMt5Connected = true;
      stateRef.consecutiveFailures = 0;
      stateRef.lastSuccessTime = Date.now();
    } else {
      nextState = 'OFFLINE';
      isMt5Connected = false;
      stateRef.consecutiveFailures++;
    }
  } else {
    stateRef.consecutiveFailures++;
    const timeSinceLastSuccess = Date.now() - stateRef.lastSuccessTime;
    const isWithinGrace = timeSinceLastSuccess <= HEARTBEAT_WARNING_THRESHOLD_MS &&
                          stateRef.consecutiveFailures < MAX_TRANSIENT_POLL_FAILURES &&
                          stateRef.previousState !== 'OFFLINE';
    if (isWithinGrace) {
      nextState = 'DEGRADED';
      isMt5Connected = true;
    } else {
      nextState = 'OFFLINE';
      isMt5Connected = false;
    }
  }

  stateRef.previousState = nextState;

  const uiBadge = !isMt5Connected
    ? 'MT5 STANDBY'
    : (nextState === 'DEGRADED' ? 'MT5: EXNESS (SYNCING)' : 'MT5: EXNESS');

  const execBadge = !isMt5Connected
    ? 'STANDBY'
    : (data?.account?.tradeMode === 'REAL' ? 'REAL' : 'DEMO');

  return {
    nextState,
    isMt5Connected,
    uiBadge,
    execBadge,
    source: isRemote ? 'REMOTE_FALLBACK' : (data ? 'VERCEL_BRIDGE' : 'NONE')
  };
}

async function runTemporalAudit() {
  console.log('================================================================');
  console.log('FEF CORTEX — TEMPORAL RUNTIME STABILITY AUDIT (2.5 MIN)');
  console.log('================================================================\n');

  const stateRef = {
    previousState: 'ONLINE',
    consecutiveFailures: 0,
    lastSuccessTime: Date.now()
  };

  const samples = [];
  const TOTAL_SAMPLES = 30; // 30 samples * 5s = 150 seconds (2.5 minutes)

  for (let i = 1; i <= TOTAL_SAMPLES; i++) {
    const tStart = Date.now();
    const [local, relayStatus, vercelBridge, vercelFallback] = await Promise.all([
      fetchUrl(LOCAL_BRIDGE_URL),
      fetchUrl(RELAY_STATUS_URL),
      fetchUrl(VERCEL_BRIDGE_URL),
      fetchUrl(VERCEL_FALLBACK_URL)
    ]);

    const uiResult = evaluateClientUI(vercelBridge, vercelFallback, stateRef);

    const btcQuote = local.json?.quotes?.BTCUSD;
    const btcAgeMs = btcQuote?.timestamp ? Date.now() - btcQuote.timestamp : null;

    const sample = {
      i,
      time: new Date().toISOString().slice(11, 19),
      localBridge: local.ok ? 'ONLINE' : (local.error || 'OFFLINE'),
      localHbAgeMs: local.json?.heartbeatAgeMs ?? null,
      relayConnected: relayStatus.json?.connected ?? null,
      relayConnState: relayStatus.json?.connectionState ?? relayStatus.error,
      relayHbAgeMs: relayStatus.json?.heartbeatAgeMs ?? null,
      vercelBridgeOk: vercelBridge.ok,
      vercelBridgeMt5: vercelBridge.json?.mt5Connected ?? null,
      vercelFallbackOk: vercelFallback.ok,
      vercelFallbackConn: vercelFallback.json?.connected ?? null,
      uiBadge: uiResult.uiBadge,
      execBadge: uiResult.execBadge,
      isMt5Connected: uiResult.isMt5Connected,
      btcAgeMs,
      durationMs: Date.now() - tStart
    };

    samples.push(sample);
    console.log(
      `[${sample.time}] #${String(i).padStart(2, '0')} | ` +
      `Local: ${sample.localBridge} (hb: ${sample.localHbAgeMs}ms) | ` +
      `Relay: ${sample.relayConnState} (hb: ${sample.relayHbAgeMs}ms) | ` +
      `Bridge: ${sample.vercelBridgeMt5 ? 'MT5_ON' : 'ERR/OFF'} | ` +
      `Fallback: ${sample.vercelFallbackConn ? 'CONN' : 'ERR'} | ` +
      `UI: [${sample.uiBadge}] Exec: [${sample.execBadge}]`
    );

    const elapsed = Date.now() - tStart;
    const sleepMs = Math.max(0, 5000 - elapsed);
    if (i < TOTAL_SAMPLES) await new Promise(r => setTimeout(r, sleepMs));
  }

  console.log('\n================================================================');
  console.log('TEMPORAL AUDIT COMPLETE — STATISTICAL SUMMARY');
  console.log('================================================================');

  const standbyCount = samples.filter(s => s.uiBadge === 'MT5 STANDBY').length;
  const syncingCount = samples.filter(s => s.uiBadge.includes('SYNCING')).length;
  const onlineCount = samples.filter(s => s.uiBadge === 'MT5: EXNESS').length;
  const relayDownCount = samples.filter(s => s.relayConnected !== true).length;
  const bridgeDownCount = samples.filter(s => s.vercelBridgeMt5 !== true).length;

  console.log(`Total Samples:          ${TOTAL_SAMPLES} (over 2.5 minutes)`);
  console.log(`MT5 ONLINE (Green):     ${onlineCount} (${((onlineCount/TOTAL_SAMPLES)*100).toFixed(1)}%)`);
  console.log(`MT5 SYNCING (Degraded): ${syncingCount} (${((syncingCount/TOTAL_SAMPLES)*100).toFixed(1)}%)`);
  console.log(`MT5 STANDBY:            ${standbyCount} (${((standbyCount/TOTAL_SAMPLES)*100).toFixed(1)}%)`);
  console.log(`Relay Not Connected:    ${relayDownCount} (${((relayDownCount/TOTAL_SAMPLES)*100).toFixed(1)}%)`);
  console.log(`Bridge Not Connected:   ${bridgeDownCount} (${((bridgeDownCount/TOTAL_SAMPLES)*100).toFixed(1)}%)`);

  if (standbyCount > 0) {
    console.log('\nSTANDBY SAMPLES CAPTURED:');
    samples.filter(s => s.uiBadge === 'MT5 STANDBY').forEach(s => console.log(JSON.stringify(s)));
  } else {
    console.log('\nZERO STANDBY occurrences observed during the 2.5 minute window.');
  }
}

runTemporalAudit().catch(console.error);

