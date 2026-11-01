const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9233;
const ARTIFACT_DIR = '/Users/mac/.gemini/antigravity/brain/fa54ad24-3b14-4fde-a263-ed5c6dfd2025/screenshots';

// Note: Test with both unauthenticated / guest AND with session cookie to see how user experienced it!
// First let's test WITHOUT cookie or with standard visitor flow, then inspect what happens!
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
  console.log('STEP 1 — REPRODUCE EXACT PRODUCTION FAILURE (BTCUSD FLOW)');
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
  const msgIdRef = { val: 800 };

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

    console.log('Navigating to https://app.feftradingsolutions.com/cockpit...');
    await cdpSend(ws, ++msgIdRef.val, 'Page.navigate', { url: 'https://app.feftradingsolutions.com/cockpit' });
    await sleep(7000);

    // 1. Switch active asset to BTCUSD if not already
    console.log('\n--- Switching to BTCUSD ---');
    const switchRes = await evalInPage(ws, msgIdRef, `(() => {
      // Find BTCUSD button or select BTCUSD
      const buttons = Array.from(document.querySelectorAll('button'));
      const btcBtn = buttons.find(b => b.innerText.includes('BTCUSD') || b.innerText.includes('BTC'));
      if (btcBtn) {
        btcBtn.click();
        return { clickedBtcBtn: true };
      }
      return { clickedBtcBtn: false };
    })()`);
    console.log('Switch BTCUSD button:', switchRes);
    await sleep(2000);

    // 2. Read Calculator Stage State
    console.log('\n--- Reading Calculator State ---');
    const calcState = await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      if (!el) return { error: 'Calculator element not found' };
      const text = el.innerText;
      const inputs = Array.from(el.querySelectorAll('input')).map(i => i.value);
      const directBtn = Array.from(el.querySelectorAll('button')).find(b => b.innerText.includes('DIRECT MT5 EXECUTE'));

      return {
        hasCalculator: true,
        capitalInputValue: inputs[0],
        hasManualBadge: text.includes('MANUAL OVERRIDE'),
        hasEquityBadge: text.includes('LIVE • MT5 EQUITY'),
        hasBalanceBadge: text.includes('LIVE • MT5 BALANCE'),
        hasSyncBtn: text.includes('SYNC MT5 FACT'),
        isDirectBtnDisabled: directBtn ? directBtn.disabled : null,
        directBtnClass: directBtn ? directBtn.className : null,
        fullTextSnippet: text.slice(0, 800)
      };
    })()`);
    console.log('Calculator State:', {
      capital: calcState.capitalInputValue,
      hasManualBadge: calcState.hasManualBadge,
      hasEquityBadge: calcState.hasEquityBadge,
      hasBalanceBadge: calcState.hasBalanceBadge,
      isDirectBtnDisabled: calcState.isDirectBtnDisabled
    });

    await takeScreenshot(ws, msgIdRef, path.join(ARTIFACT_DIR, 'reproduce_step1_calculator.png'));

    // 3. Click DIRECT MT5 EXECUTE to open Safety Confirmation Guard
    console.log('\n--- Clicking DIRECT MT5 EXECUTE ---');
    const openModalRes = await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      const directBtn = Array.from(el.querySelectorAll('button')).find(b => b.innerText.includes('DIRECT MT5 EXECUTE'));
      if (!directBtn) return { error: 'No direct execute button' };
      if (directBtn.disabled) return { disabled: true, title: directBtn.title };
      directBtn.click();
      return { clicked: true };
    })()`);
    console.log('Direct Execute click:', openModalRes);
    await sleep(1500);

    // 4. Capture Confirmation Guard State
    console.log('\n--- Reading Safety Confirmation Guard State ---');
    const modalState = await evalInPage(ws, msgIdRef, `(() => {
      const modal = document.querySelector('[role="dialog"]');
      if (!modal) return { open: false };
      const text = modal.innerText;
      const buttons = Array.from(modal.querySelectorAll('button')).map(b => b.innerText.trim());

      return {
        open: true,
        modalTextSnippet: text,
        buttons,
        hasDemoExecutionOnly: text.includes('DEMO EXECUTION ONLY'),
        hasExecutionRejected: text.includes('EXECUTION REJECTED'),
        hasMt5Disconnected: text.includes('MT5 terminal or bridge is not connected') || text.includes('not connected'),
        hasLicenseRequired: text.includes('LICENSE REQUIRED'),
        hasConfirmDemoOrder: text.includes('CONFIRM DEMO ORDER'),
        hasMarketClosed: text.includes('MARKET CLOSED'),
      };
    })()`);
    console.log('Confirmation Guard State:', {
      open: modalState.open,
      buttons: modalState.buttons,
      hasDemoExecutionOnly: modalState.hasDemoExecutionOnly,
      hasExecutionRejected: modalState.hasExecutionRejected,
      hasMt5Disconnected: modalState.hasMt5Disconnected,
      hasLicenseRequired: modalState.hasLicenseRequired,
      hasConfirmDemoOrder: modalState.hasConfirmDemoOrder,
      hasMarketClosed: modalState.hasMarketClosed,
    });
    console.log('Modal snippet:\n', modalState.modalTextSnippet?.slice(0, 1000));

    await takeScreenshot(ws, msgIdRef, path.join(ARTIFACT_DIR, 'reproduce_step1_modal.png'));

    ws.close();
  } catch (err) {
    console.error('Reproduction failed:', err);
  } finally {
    chromeProc.kill('SIGKILL');
  }
}

run();

