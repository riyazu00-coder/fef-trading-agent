const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9225;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
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
    }, 20000);

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

async function evalInPage(ws, msgIdRef, expression) {
  const res = await cdpSend(ws, ++msgIdRef.val, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return res && res.result ? res.result.value : null;
}

async function captureCockpitState(ws, msgIdRef, targetUrl) {
  console.log(`Navigating to ${targetUrl}...`);
  await cdpSend(ws, ++msgIdRef.val, 'Page.navigate', { url: targetUrl });
  // Wait for React hydration and initial polling (6 seconds)
  await sleep(6000);

  const state = await evalInPage(ws, msgIdRef, `(() => {
    // 1. Market Overview Card inspection
    const overviewEl = document.getElementById('market-overview-card');
    const overviewText = overviewEl ? overviewEl.innerText : '';

    // 2. Feed badge & Pricing
    const feedBadge = Array.from(document.querySelectorAll('span')).find(s => s.innerText && s.innerText.includes('FEED:'))?.innerText || 'NOT FOUND';
    const activeSymbol = document.querySelector('#market-overview-card span.text-sm.font-black')?.innerText || 'UNKNOWN';

    // 3. Compact wave & Trend
    const waveHeader = Array.from(document.querySelectorAll('span')).find(s => s.innerText && s.innerText.includes('COMPACT WAVE'))?.innerText || 'NOT FOUND';
    const trendText = Array.from(document.querySelectorAll('span')).find(s => s.innerText && (s.innerText.includes('H4 BULLISH') || s.innerText.includes('H4 BEARISH') || s.innerText.includes('H4 DATA LIMITED') || s.innerText.includes('H4 RANGING')) )?.innerText || 'NOT FOUND';

    // 4. Current AI Decision card
    const decisionCard = document.querySelector('.ghost-glass-panel');
    const decisionText = decisionCard ? decisionCard.innerText : '';

    // 5. Hub scanner / Agent nodes
    const agentNodes = Array.from(document.querySelectorAll('.font-mono')).map(el => el.innerText).filter(t => t && (t.includes('DATA LIMITED') || t.includes('ONLINE') || t.includes('PROCESSING')));

    // 6. Data Sentinel Panel
    const sentinelBadge = Array.from(document.querySelectorAll('span')).find(s => s.innerText && s.innerText.includes('SENTINEL:'))?.innerText || 'NOT FOUND';

    return {
      url: window.location.href,
      activeSymbol,
      feedBadge,
      trendText,
      waveHeader,
      sentinelBadge,
      overviewSnippet: overviewText.slice(0, 500),
      rawBodySnippet: document.body.innerText.slice(0, 1500)
    };
  })()`);

  return state;
}

async function main() {
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1440,900',
    'about:blank'
  ], { stdio: 'ignore' });

  await sleep(3000);
  const msgIdRef = { val: 100 };

  try {
    const list = await getJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const pageTarget = list.find((p) => p.type === 'page');
    if (!pageTarget) throw new Error('No page target found');

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.on('open', res);
      ws.on('error', rej);
    });

    console.log('=== CAPTURING LOCALHOST COCKPIT ===');
    const localState = await captureCockpitState(ws, msgIdRef, 'http://localhost:3000/cockpit');
    console.log('Local Cockpit State:', JSON.stringify(localState, null, 2));

    console.log('\n=== CAPTURING PRODUCTION COCKPIT ===');
    const prodState = await captureCockpitState(ws, msgIdRef, 'https://app.feftradingsolutions.com/cockpit');
    console.log('Prod Cockpit State:', JSON.stringify(prodState, null, 2));

    ws.close();
  } catch (err) {
    console.error('Error during browser inspection:', err);
  } finally {
    try { chromeProc.kill('SIGTERM'); } catch {}
  }
}

main();

