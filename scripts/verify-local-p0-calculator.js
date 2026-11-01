const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9240;
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
  console.log('Starting headless Chrome for P0 Local Cockpit Execution Verification...');
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1440,900',
    'about:blank'
  ], { stdio: 'ignore' });

  await sleep(2500);
  const msgIdRef = { val: 900 };

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

    // Set Master Auth Cookie for localhost
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
    
    // Wait for telemetry poll to complete
    console.log('Waiting for initial telemetry fetch...');
    await sleep(6000);

    // 1. Read Calculator State
    console.log('\n--- 1. Reading Calculator State ---');
    const calcState = await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      if (!el) return { error: 'Calculator element not found' };
      const text = el.innerText;
      const inputs = Array.from(el.querySelectorAll('input')).map(i => i.value);
      const buttons = Array.from(el.querySelectorAll('button')).map(b => b.innerText.trim());
      const directBtn = Array.from(el.querySelectorAll('button')).find(b => b.innerText.includes('DIRECT MT5 EXECUTE') || b.innerText.includes('MT5 BRIDGE OFFLINE'));

      return {
        hasCalculator: true,
        capitalInputValue: inputs[0],
        hasManualBadge: text.includes('MANUAL OVERRIDE'),
        hasEquityBadge: text.includes('LIVE • MT5 EQUITY'),
        hasBalanceBadge: text.includes('LIVE • MT5 BALANCE'),
        hasSyncBtn: text.includes('SYNC MT5 FACT'),
        directBtnText: directBtn ? directBtn.innerText.trim() : null,
        isDirectBtnDisabled: directBtn ? directBtn.disabled : null,
        buttons: buttons.filter(b => b.length > 0 && b.length < 30)
      };
    })()`);
    console.log('Calculator Initial State:', calcState);
    await takeScreenshot(ws, msgIdRef, path.join(ARTIFACT_DIR, 'p0_verified_calculator_initial.png'));

    // 2. Open Safety Confirmation Guard
    console.log('\n--- 2. Opening Safety Confirmation Modal ---');
    const openRes = await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      const directBtn = Array.from(el.querySelectorAll('button')).find(b => b.innerText.includes('DIRECT MT5 EXECUTE'));
      if (!directBtn) return { error: 'No direct execute button' };
      if (directBtn.disabled) return { disabled: true, text: directBtn.innerText };
      directBtn.click();
      return { clicked: true };
    })()`);
    console.log('Direct Execute click result:', openRes);
    await sleep(1500);

    // 3. Inspect Confirmation Guard Modal
    console.log('\n--- 3. Reading Safety Confirmation Guard ---');
    const modalState = await evalInPage(ws, msgIdRef, `(() => {
      const modal = document.querySelector('[role="dialog"]');
      if (!modal) return { open: false };
      const text = modal.innerText;
      const buttons = Array.from(modal.querySelectorAll('button')).map(b => b.innerText.trim());

      return {
        open: true,
        buttons,
        hasDemoExecutionOnly: text.includes('DEMO EXECUTION ONLY'),
        hasTerminalOnline: text.includes('ONLINE') || text.includes('CONNECTED'),
        hasExecutionRejected: text.includes('EXECUTION REJECTED'),
        hasMt5Disconnected: text.includes('MT5 terminal or bridge is not connected'),
        hasLicenseRequired: text.includes('LICENSE REQUIRED'),
        hasConfirmDemoOrder: buttons.some(b => b.includes('CONFIRM DEMO ORDER')),
        hasMarketClosed: buttons.some(b => b.includes('MARKET CLOSED')),
        hasMt5DisconnectedBtn: buttons.some(b => b.includes('MT5 DISCONNECTED')),
        textSnippet: text.slice(0, 1000)
      };
    })()`);
    console.log('Modal State:', modalState);
    await takeScreenshot(ws, msgIdRef, path.join(ARTIFACT_DIR, 'p0_verified_modal_state.png'));

    // 4. Test Manual Capital Override
    console.log('\n--- 4. Testing Manual Capital Override & SYNC MT5 FACT ---');
    // Close modal first
    await evalInPage(ws, msgIdRef, `(() => {
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('CANCEL'));
      if (cancelBtn) cancelBtn.click();
    })()`);
    await sleep(1000);

    // Click $50,000 chip
    await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      const chip50k = Array.from(el.querySelectorAll('button')).find(b => b.innerText.trim() === '$50k');
      if (chip50k) chip50k.click();
    })()`);
    await sleep(500);

    const manualState = await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      const text = el.innerText;
      const inputs = Array.from(el.querySelectorAll('input')).map(i => i.value);
      return {
        capitalInputValue: inputs[0],
        hasManualBadge: text.includes('MANUAL OVERRIDE'),
        hasEquityBadge: text.includes('LIVE • MT5 EQUITY'),
      };
    })()`);
    console.log('After clicking $50k chip:', manualState);

    // Click SYNC MT5 FACT
    await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      const syncBtn = Array.from(el.querySelectorAll('button')).find(b => b.innerText.includes('SYNC MT5 FACT'));
      if (syncBtn) syncBtn.click();
    })()`);
    await sleep(500);

    const resyncedState = await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      const text = el.innerText;
      const inputs = Array.from(el.querySelectorAll('input')).map(i => i.value);
      return {
        capitalInputValue: inputs[0],
        hasManualBadge: text.includes('MANUAL OVERRIDE'),
        hasEquityBadge: text.includes('LIVE • MT5 EQUITY'),
      };
    })()`);
    console.log('After clicking SYNC MT5 FACT:', resyncedState);
    await takeScreenshot(ws, msgIdRef, path.join(ARTIFACT_DIR, 'p0_verified_resynced.png'));

    ws.close();
  } catch (err) {
    console.error('Test run failed:', err);
  } finally {
    chromeProc.kill('SIGKILL');
  }
}

run();

