const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9245;
const ARTIFACT_DIR = '/Users/mac/.gemini/antigravity/brain/fa54ad24-3b14-4fde-a263-ed5c6dfd2025/screenshots';
const MASTER_SESSION_TOKEN = 'bWFzdGVyXzY0NGIxODE2Zjc2ZjpyaXlhenUwMEBnbWFpbC5jb206TUFTVEVSOjE3OTQ4MzQ4NDkxOTI6Mjg2NzY3MTljMTdiZjdjZjAzM2IyMzEwOWU4ZGEwNDAwOWUxZTI3NjcxMThjMDQ3NmI0ZDY0YzI0NjdlYTk1Mg==';

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

async function takeElementScreenshot(ws, msgIdRef, selector, outputPath) {
  const box = await evalInPage(ws, msgIdRef, `
    (() => {
      const el = document.querySelector("${selector}");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    })()
  `);

  if (!box) {
    console.warn(`Element ${selector} not found for screenshot, taking full viewport`);
    const res = await cdpSend(ws, ++msgIdRef.val, 'Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, Buffer.from(res.data, 'base64'));
    return;
  }

  const res = await cdpSend(ws, ++msgIdRef.val, 'Page.captureScreenshot', {
    format: 'png',
    clip: {
      x: Math.max(0, box.x),
      y: Math.max(0, box.y),
      width: box.width,
      height: box.height,
      scale: 1,
    },
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, Buffer.from(res.data, 'base64'));
  console.log(`Saved screenshot: ${outputPath}`);
}

async function main() {
  console.log('Starting Next.js dev server...');
  const nextProc = spawn('npm', ['run', 'dev'], {
    cwd: '/Users/mac/.gemini/antigravity/scratch/fef-trading-solution',
    stdio: 'ignore',
  });

  // Poll until localhost:3000 is ready
  let ready = false;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    try {
      const statusCode = await new Promise((resolve) => {
        const req = http.get('http://127.0.0.1:3000/cockpit', (res) => resolve(res.statusCode));
        req.on('error', () => resolve(0));
      });
      if (statusCode === 200 || statusCode === 307 || statusCode === 302) {
        ready = true;
        break;
      }
    } catch {}
  }

  if (!ready) {
    console.error('Next.js dev server failed to start within 30 seconds');
    nextProc.kill();
    process.exit(1);
  }

  console.log('Dev server ready! Launching headless Chrome...');
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1440,900',
    'about:blank',
  ], { stdio: 'ignore' });

  await sleep(2000);
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

    await cdpSend(ws, ++msgIdRef.val, 'Page.enable');
    await cdpSend(ws, ++msgIdRef.val, 'DOM.enable');
    await cdpSend(ws, ++msgIdRef.val, 'Network.enable');

    await cdpSend(ws, ++msgIdRef.val, 'Network.setCookie', {
      name: 'fef_session',
      value: MASTER_SESSION_TOKEN,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: false,
      secure: false,
    });
    await cdpSend(ws, ++msgIdRef.val, 'Network.setCookie', {
      name: 'fef_session',
      value: MASTER_SESSION_TOKEN,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
    });

    console.log('Navigating to http://localhost:3000/cockpit...');
    await cdpSend(ws, ++msgIdRef.val, 'Page.navigate', { url: 'http://localhost:3000/cockpit' });
    await sleep(4000);

    // Capture screenshot of the Central Intelligence Hub
    const hubScreenshotPath = path.join(ARTIFACT_DIR, 'hub_header_aligned.png');
    await takeElementScreenshot(ws, msgIdRef, '#central-intelligence-hub', hubScreenshotPath);

    // Verify positioning via DOM metrics
    const metrics = await evalInPage(ws, msgIdRef, `
      (() => {
        const hub = document.querySelector("#central-intelligence-hub");
        if (!hub) return { error: "Hub not found" };
        const hubRect = hub.getBoundingClientRect();
        
        // Find HUD summary plate
        const hudPlate = Array.from(hub.querySelectorAll("div")).find(d => d.textContent.includes("CONTRIBUTING") && d.textContent.includes("21 VIS"));
        const hudRect = hudPlate ? hudPlate.getBoundingClientRect() : null;
        
        // Find left title
        const titleEl = Array.from(hub.querySelectorAll("h2")).find(h => h.textContent.includes("CENTRAL MULTI-AGENT INTELLIGENCE HUB"));
        const titleRect = titleEl ? titleEl.getBoundingClientRect() : null;
        
        return {
          hubWidth: hubRect.width,
          hubRight: hubRect.right,
          hudRight: hudRect ? hudRect.right : null,
          hudWidth: hudRect ? hudRect.width : null,
          rightInset: hudRect ? (hubRect.right - hudRect.right) : null,
          titleLeft: titleRect ? titleRect.left : null,
          titleRight: titleRect ? titleRect.right : null,
        };
      })()
    `);

    console.log('Hub Layout Metrics:', JSON.stringify(metrics, null, 2));

    ws.close();
  } finally {
    chromeProc.kill();
    nextProc.kill();
    console.log('Cleanup complete.');
  }
}

main().catch((err) => {
  console.error('Error in verification:', err);
  process.exit(1);
});

