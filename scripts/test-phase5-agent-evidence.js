const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9230;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function cdpSend(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`CDP command ${method} timed out (id: ${id})`));
    }, 25000);

    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === id) {
          clearTimeout(timeout);
          ws.removeListener('message', handler);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      } catch (err) {}
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalInPage(ws, msgIdRef, expr) {
  const res = await cdpSend(ws, ++msgIdRef.val, 'Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });
  return res && res.result ? res.result.value : null;
}

async function runMultiAssetCheck(baseUrl) {
  const symbols = ['XAUUSD', 'AUDUSD', 'NZDUSD', 'EURUSD', 'BTCUSD', 'US100', 'USOIL', 'GER40'];
  const results = {};

  for (const sym of symbols) {
    try {
      const candleData = await getJson(`${baseUrl}/api/candles?symbol=${sym}&timeframe=H1`);
      results[sym] = {
        count: candleData.count || 0,
        provider: candleData.provider || 'UNKNOWN',
        provenance: candleData.provenance || 'UNKNOWN',
        success: Boolean(candleData.success),
      };
    } catch (err) {
      results[sym] = { error: err.message };
    }
  }

  return results;
}

async function run60SecondObservation(ws, msgIdRef, url) {
  console.log(`Navigating to ${url}...`);
  await cdpSend(ws, ++msgIdRef.val, 'Page.navigate', { url });
  await sleep(4000);

  const samples = [];
  const intervals = [0, 5, 10, 20, 30, 60];
  let prev = 0;

  for (const sec of intervals) {
    const delta = (sec - prev) * 1000;
    if (delta > 0) await sleep(delta);
    prev = sec;

    const snapshot = await evalInPage(
      ws,
      msgIdRef,
      `(() => {
        const feed = Array.from(document.querySelectorAll('span')).find(s => s.innerText && s.innerText.includes('FEED:'))?.innerText || 'N/A';
        const wave = Array.from(document.querySelectorAll('span')).find(s => s.innerText && s.innerText.includes('COMPACT WAVE'))?.innerText || 'N/A';
        const price = document.querySelector('#market-overview-card span.text-2xl')?.innerText || 'N/A';
        const trend = Array.from(document.querySelectorAll('span')).find(s => s.innerText && (s.innerText.includes('H4 BULLISH') || s.innerText.includes('H4 BEARISH') || s.innerText.includes('H4 DATA LIMITED')) )?.innerText || 'N/A';
        const atr = Array.from(document.querySelectorAll('div, span')).find(s => s.innerText && s.innerText.includes('ATR computed from verified candles')) ? 'ATR_COMPUTED' : 'ATR_PENDING';
        const matrix = Array.from(document.querySelectorAll('span, div')).find(s => s.innerText && s.innerText.includes('STATE: ARMED')) ? 'ARMED' : 'AWAITING';
        return {
          timeSec: ${sec},
          feed: feed.replace(/\\n/g, ' '),
          wave: wave.replace(/\\n/g, ' '),
          atr,
          matrix
        };
      })()`
    );

    samples.push(snapshot);
    console.log(`[${sec}s]`, JSON.stringify(snapshot));
  }

  return samples;
}

async function main() {
  console.log('====================================================');
  console.log('FEF CORTEX — PHASE 5 AUTOMATED RUNTIME VALIDATION');
  console.log('====================================================');

  console.log('\n--- 1. MULTI-ASSET REFERENCE CANDLES (PRODUCTION) ---');
  const prodAssets = await runMultiAssetCheck('https://app.feftradingsolutions.com');
  console.log(JSON.stringify(prodAssets, null, 2));

  console.log('\n--- 2. LAUNCHING CHROME CDP FOR 60s CONTINUITY ---');
  const chromeProc = spawn(
    CHROME_PATH,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      '--disable-gpu',
      '--no-sandbox',
      '--window-size=1440,900',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  await sleep(3000);
  const msgIdRef = { val: 1 };

  try {
    const list = await getJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const pageTarget = list.find((p) => p.type === 'page');
    if (!pageTarget) throw new Error('No page target found');

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.on('open', res);
      ws.on('error', rej);
    });

    console.log('\n--- 3. 60-SECOND OBSERVATION ON PRODUCTION COCKPIT ---');
    const prodSamples = await run60SecondObservation(ws, msgIdRef, 'https://app.feftradingsolutions.com/cockpit');

    console.log('\n--- 4. LOCALHOST COCKPIT VERIFICATION ---');
    const localSample = await evalInPage(
      ws,
      msgIdRef,
      `(() => {
        return {
          url: window.location.href,
          title: document.title
        };
      })()`
    );
    console.log('Local sample:', localSample);

    ws.close();
  } catch (err) {
    console.error('Error during CDP observation:', err);
  } finally {
    try {
      chromeProc.kill('SIGTERM');
    } catch {}
  }
}

main().catch(console.error);

