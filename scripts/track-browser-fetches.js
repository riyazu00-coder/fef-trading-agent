const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9227;

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
    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.on('open', res);
      ws.on('error', rej);
    });

    // Intercept console.log, console.error, console.warn from the browser
    await cdpSend(ws, ++msgIdRef.val, 'Runtime.enable');
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.method === 'Runtime.consoleAPICalled') {
          console.log(`[BROWSER CONSOLE ${msg.params.type}]`, ...msg.params.args.map(a => a.value || a.description || ''));
        }
      } catch (e) {}
    });

    // Inject fetch wrapper before navigating to record all fetches
    await cdpSend(ws, ++msgIdRef.val, 'Page.addScriptToEvaluateOnNewDocument', {
      source: `
        window.__feftracker = [];
        const origFetch = window.fetch;
        window.fetch = async function(...args) {
          const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
          const t0 = Date.now();
          try {
            const res = await origFetch.apply(this, args);
            const clone = res.clone();
            let body = null;
            try { body = await clone.json(); } catch(e) { body = await clone.text(); }
            window.__feftracker.push({ url, status: res.status, ok: res.ok, durationMs: Date.now() - t0, bodySnippet: JSON.stringify(body).slice(0, 300) });
            return res;
          } catch(err) {
            window.__feftracker.push({ url, error: err.message, durationMs: Date.now() - t0 });
            throw err;
          }
        };
      `
    });

    console.log('Navigating to http://localhost:3000/cockpit ...');
    await cdpSend(ws, ++msgIdRef.val, 'Page.navigate', { url: 'http://localhost:3000/cockpit' });
    await sleep(8000);

    const result = await cdpSend(ws, ++msgIdRef.val, 'Runtime.evaluate', {
      expression: `(() => {
        return {
          fetches: window.__feftracker,
          priceText: document.querySelector('#market-overview-card')?.innerText,
        };
      })()`,
      returnByValue: true
    });

    console.log('\n--- FETCHES MADE BY BROWSER ---');
    (result.result.value.fetches || []).forEach(f => {
      console.log(`${f.ok ? 'OK' : 'FAIL'} ${f.status || 'ERR'} ${f.url} (${f.durationMs}ms)`);
      if (f.error) console.log('  Error:', f.error);
      if (f.bodySnippet) console.log('  Body:', f.bodySnippet);
    });

    console.log('\n--- OVERVIEW TEXT ---');
    console.log(result.result.value.priceText);

    ws.close();
  } catch (err) {
    console.error('Error:', err);
  } finally {
    try { chromeProc.kill('SIGTERM'); } catch {}
  }
}

main();

