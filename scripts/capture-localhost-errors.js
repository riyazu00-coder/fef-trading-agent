const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9228;

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

    const exceptions = [];
    const consoleLogs = [];

    await cdpSend(ws, ++msgIdRef.val, 'Runtime.enable');
    await cdpSend(ws, ++msgIdRef.val, 'Log.enable');

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.method === 'Runtime.exceptionThrown') {
          exceptions.push(msg.params.exceptionDetails);
        }
        if (msg.method === 'Runtime.consoleAPICalled') {
          consoleLogs.push({
            type: msg.params.type,
            text: msg.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ')
          });
        }
      } catch (e) {}
    });

    console.log('Navigating to http://localhost:3000/cockpit ...');
    await cdpSend(ws, ++msgIdRef.val, 'Page.navigate', { url: 'http://localhost:3000/cockpit' });
    await sleep(6000);

    console.log('\n--- EXCEPTIONS THROWN ---');
    console.log(JSON.stringify(exceptions, null, 2));

    console.log('\n--- CONSOLE LOGS ---');
    consoleLogs.forEach(c => console.log(`[${c.type}] ${c.text}`));

    ws.close();
  } catch (err) {
    console.error('Error:', err);
  } finally {
    try { chromeProc.kill('SIGTERM'); } catch {}
  }
}

main();

