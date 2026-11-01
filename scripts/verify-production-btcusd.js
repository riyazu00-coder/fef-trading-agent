const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9248;
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

async function evalInPage(ws, msgIdRef, expression) {
  const res = await cdpSend(ws, ++msgIdRef.val, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return res && res.result ? res.result.value : null;
}

async function takeScreenshot(ws, msgIdRef, outputPath) {
  const res = await cdpSend(ws, ++msgIdRef.val, 'Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
  });
  if (res && res.data) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, Buffer.from(res.data, 'base64'));
    console.log(`Saved screenshot: ${outputPath}`);
  }
}

async function run() {
  console.log('================================================================');
  console.log('FEF CORTEX — PRODUCTION P0 VERIFICATION: BTCUSD FLOW');
  console.log('Target: https://app.feftradingsolutions.com/cockpit');
  console.log('================================================================\n');

  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1440,900',
    'about:blank'
  ], { stdio: 'ignore' });

  await sleep(2500);
  const msgIdRef = { val: 2000 };

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

    // Set Master Auth Cookie
    await cdpSend(ws, ++msgIdRef.val, 'Network.setCookie', {
      name: 'fef_session',
      value: MASTER_SESSION_TOKEN,
      domain: 'app.feftradingsolutions.com',
      path: '/',
      httpOnly: false,
      secure: true,
    });

    console.log('[1/5] Navigating to https://app.feftradingsolutions.com/cockpit...');
    await cdpSend(ws, ++msgIdRef.val, 'Page.navigate', { url: 'https://app.feftradingsolutions.com/cockpit' });
    
    // Wait for telemetry fetch
    console.log('Waiting for telemetry roundtrip from Render relay...');
    await sleep(7000);

    // 1. Initial State on XAUUSD
    console.log('\n--- 1. Initial State (XAUUSD) ---');
    const xauState = await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      if (!el) return { error: 'Calculator not found' };
      const text = el.innerText;
      const inputs = Array.from(el.querySelectorAll('input')).map(i => i.value);
      return {
        symbol: 'XAUUSD',
        capital: inputs[0],
        hasEquityBadge: text.includes('LIVE • MT5 EQUITY'),
        hasManualBadge: text.includes('MANUAL OVERRIDE'),
        hasMarketClosed: text.includes('MARKET CLOSED'),
        hasSyncBtn: text.includes('SYNC MT5 FACT'),
      };
    })()`);
    console.log('XAUUSD Calculator State:', xauState);
    await takeScreenshot(ws, msgIdRef, path.join(ARTIFACT_DIR, 'prod_live_xauusd_initial.png'));

    // 2. Switch to BTCUSD (Open 24/7)
    console.log('\n--- 2. Switching to BTCUSD ---');
    await evalInPage(ws, msgIdRef, `(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btc = buttons.find(b => b.innerText.includes('BTCUSD') || b.innerText.trim() === 'BTC');
      if (btc) btc.click();
    })()`);
    await sleep(2500);

    const btcInitialState = await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      if (!el) return { error: 'Calculator not found' };
      const text = el.innerText;
      const inputs = Array.from(el.querySelectorAll('input')).map(i => i.value);
      const directBtn = Array.from(el.querySelectorAll('button')).find(b => b.innerText.includes('DIRECT MT5 EXECUTE') || b.innerText.includes('BRIDGE OFFLINE') || b.innerText.includes('MARKET CLOSED'));
      return {
        capital: inputs[0],
        hasEquityBadge: text.includes('LIVE • MT5 EQUITY'),
        hasManualBadge: text.includes('MANUAL OVERRIDE'),
        directBtnText: directBtn ? directBtn.innerText.replace(/\\n/g, ' ') : null,
        isDirectBtnDisabled: directBtn ? directBtn.disabled : null,
      };
    })()`);
    console.log('BTCUSD Initial Calculator State:', btcInitialState);
    await takeScreenshot(ws, msgIdRef, path.join(ARTIFACT_DIR, 'prod_live_btcusd_initial.png'));

    // 3. Test Manual Capital Override & SYNC MT5 FACT
    console.log('\n--- 3. Testing Manual Capital Override & SYNC MT5 FACT ---');
    await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      const chip50k = Array.from(el.querySelectorAll('button')).find(b => b.innerText.trim() === '$50k');
      if (chip50k) chip50k.click();
    })()`);
    await sleep(500);

    const manualCapState = await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      const text = el.innerText;
      const inputs = Array.from(el.querySelectorAll('input')).map(i => i.value);
      return {
        capital: inputs[0],
        hasManualBadge: text.includes('MANUAL OVERRIDE'),
        hasEquityBadge: text.includes('LIVE • MT5 EQUITY'),
      };
    })()`);
    console.log('After clicking $50k chip:', manualCapState);

    // Click SYNC MT5 FACT
    await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      const syncBtn = Array.from(el.querySelectorAll('button')).find(b => b.innerText.includes('SYNC MT5 FACT'));
      if (syncBtn) syncBtn.click();
    })()`);
    await sleep(500);

    const resyncedCapState = await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      const text = el.innerText;
      const inputs = Array.from(el.querySelectorAll('input')).map(i => i.value);
      return {
        capital: inputs[0],
        hasManualBadge: text.includes('MANUAL OVERRIDE'),
        hasEquityBadge: text.includes('LIVE • MT5 EQUITY'),
      };
    })()`);
    console.log('After clicking SYNC MT5 FACT:', resyncedCapState);
    await takeScreenshot(ws, msgIdRef, path.join(ARTIFACT_DIR, 'prod_live_btcusd_resynced.png'));

    // 4. Test Manual Lot Mode (0.10 lot)
    console.log('\n--- 4. Testing Manual Lot Mode (0.10 lot) ---');
    await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      const manualLotBtn = Array.from(el.querySelectorAll('button')).find(b => b.innerText.trim() === 'MANUAL LOT');
      if (manualLotBtn) manualLotBtn.click();
    })()`);
    await sleep(500);

    await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      const inputs = Array.from(el.querySelectorAll('input'));
      if (inputs[1]) {
        inputs[1].value = '0.10';
        inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);
    await sleep(500);

    const manualLotState = await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      const text = el.innerText;
      const inputs = Array.from(el.querySelectorAll('input')).map(i => i.value);
      const directBtn = Array.from(el.querySelectorAll('button')).find(b => b.innerText.includes('DIRECT MT5 EXECUTE'));
      return {
        capital: inputs[0],
        lot: inputs[1],
        directBtnText: directBtn ? directBtn.innerText.replace(/\\n/g, ' ') : null,
        isDirectBtnDisabled: directBtn ? directBtn.disabled : null,
      };
    })()`);
    console.log('BTCUSD Manual Lot 0.10 State:', manualLotState);
    await takeScreenshot(ws, msgIdRef, path.join(ARTIFACT_DIR, 'prod_live_btcusd_manual_lot.png'));

    // 5. Open Safety Confirmation Guard Modal
    console.log('\n--- 5. Opening Safety Confirmation Guard Modal ---');
    const openRes = await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      const directBtn = Array.from(el.querySelectorAll('button')).find(b => b.innerText.includes('DIRECT MT5 EXECUTE'));
      if (!directBtn) return { error: 'No direct execute button found' };
      if (directBtn.disabled) return { disabled: true, text: directBtn.innerText };
      directBtn.click();
      return { clicked: true };
    })()`);
    console.log('Direct Execute click:', openRes);
    await sleep(1500);

    const modalState = await evalInPage(ws, msgIdRef, `(() => {
      const modal = document.querySelector('[role="dialog"]');
      if (!modal) return { open: false };
      const text = modal.innerText;
      const buttons = Array.from(modal.querySelectorAll('button')).map(b => b.innerText.trim());

      return {
        open: true,
        buttons,
        hasBTC: text.includes('BTCUSD'),
        hasDemoExecutionOnly: text.includes('DEMO EXECUTION ONLY'),
        hasTerminalOnline: text.includes('MT5 Terminal: ONLINE') || text.includes('ONLINE'),
        hasExecutionRejected: text.includes('EXECUTION REJECTED'),
        hasMt5Disconnected: text.includes('MT5 terminal or bridge is not connected'),
        hasLicenseRequired: text.includes('LICENSE REQUIRED'),
        hasConfirmDemoOrder: buttons.some(b => b.includes('CONFIRM DEMO ORDER')),
        hasMarketClosed: buttons.some(b => b.includes('MARKET CLOSED')),
        capitalSourceEvidence: text.match(/LIVE MT5 [^\\n]+/i) ? text.match(/LIVE MT5 [^\\n]+/i)[0] : null,
        lotSourceEvidence: text.includes('MANUAL OVERRIDE') || text.includes('0.10 LOTS'),
        textSnippet: text.slice(0, 1000)
      };
    })()`);
    console.log('Production Safety Confirmation Guard State:', modalState);
    await takeScreenshot(ws, msgIdRef, path.join(ARTIFACT_DIR, 'prod_live_btcusd_modal.png'));

    ws.close();
  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    chromeProc.kill('SIGKILL');
  }
}

run();

