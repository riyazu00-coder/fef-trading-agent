const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9229;
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
  const msgIdRef = { val: 400 };

  try {
    const list = await getJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const pageTarget = list.find((p) => p.type === 'page');
    if (!pageTarget) throw new Error('No page target found');

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.on('open', res);
      ws.on('error', rej);
    });

    // 0. Inject Master session cookie
    await cdpSend(ws, ++msgIdRef.val, 'Network.enable');
    await cdpSend(ws, ++msgIdRef.val, 'Network.setCookie', {
      name: 'fef_member_session',
      value: MASTER_SESSION_TOKEN,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
    });
    console.log('✓ Master auth cookie injected into browser session');

    // -------------------------------------------------------------
    // 1. TRADINGVIEW WORKSPACE MANUAL CONTROLS & CONFIRMATION MODAL
    // -------------------------------------------------------------
    console.log('\n--- Navigating to /tradingview ---');
    await cdpSend(ws, ++msgIdRef.val, 'Page.navigate', { url: 'http://localhost:3000/tradingview' });
    await sleep(6000);

    // Switch active symbol to BTCUSD (active open market)
    console.log('Switching to BTCUSD (open market)...');
    const btcSwitched = await evalInPage(ws, msgIdRef, `(() => {
      const btcBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.trim() === 'BTCUSD');
      if (btcBtn) {
        btcBtn.click();
        return true;
      }
      return false;
    })()`);
    console.log('BTCUSD button clicked:', btcSwitched);
    await sleep(3000);

    // Click BUY button in QuickScalpDock to open confirmation modal
    console.log('Clicking BUY button in QuickScalpDock for BTCUSD...');
    const modalTriggered = await evalInPage(ws, msgIdRef, `(() => {
      const buyBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('BUY') && !b.disabled);
      if (buyBtn) {
        buyBtn.click();
        return true;
      }
      return false;
    })()`);
    console.log('TradingView Modal Triggered:', modalTriggered);
    await sleep(2000);

    // Verify confirmation modal content
    const tvModalState = await evalInPage(ws, msgIdRef, `(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      if (!dialog) return { hasDialog: false };
      const text = dialog.innerText;
      return {
        hasDialog: true,
        hasDemoLabel: text.includes('DEMO EXECUTION ONLY'),
        hasConfirmButton: text.includes('CONFIRM DEMO ORDER'),
        snippet: text.slice(0, 500),
      };
    })()`);
    console.log('TradingView Modal Verification:', tvModalState);

    // Capture screenshot of TradingView confirmation modal
    await takeScreenshot(ws, msgIdRef, path.join(ARTIFACT_DIR, 'tradingview_manual_confirm_modal.png'));

    // Close modal
    await evalInPage(ws, msgIdRef, `(() => {
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('CANCEL'));
      if (cancelBtn) cancelBtn.click();
    })()`);
    await sleep(1000);

    // -------------------------------------------------------------
    // 2. COCKPIT MANUAL CONTROLS & CONFIRMATION MODAL
    // -------------------------------------------------------------
    console.log('\n--- Navigating to /cockpit ---');
    await cdpSend(ws, ++msgIdRef.val, 'Page.navigate', { url: 'http://localhost:3000/cockpit' });
    await sleep(6000);

    // Switch active symbol to BTCUSD
    console.log('Switching Cockpit to BTCUSD...');
    await evalInPage(ws, msgIdRef, `(() => {
      const btcBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.trim() === 'BTCUSD');
      if (btcBtn) btcBtn.click();
    })()`);
    await sleep(3000);

    // Scroll to FullSmartPositionCalculator and click DIRECT MT5 EXECUTE
    console.log('Locating DIRECT MT5 EXECUTE Button in Cockpit...');
    const cockpitModalTriggered = await evalInPage(ws, msgIdRef, `(() => {
      const execBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('DIRECT MT5 EXECUTE') && !b.disabled);
      if (execBtn) {
        execBtn.scrollIntoView({ behavior: 'instant', block: 'center' });
        execBtn.click();
        return true;
      }
      return false;
    })()`);
    console.log('Cockpit Execution Button Clicked:', cockpitModalTriggered);
    await sleep(2000);

    const cockpitModalState = await evalInPage(ws, msgIdRef, `(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      if (!dialog) return { hasDialog: false };
      const text = dialog.innerText;
      return {
        hasDialog: true,
        hasDemoLabel: text.includes('DEMO EXECUTION ONLY'),
        hasConfirmButton: text.includes('CONFIRM DEMO ORDER'),
        snippet: text.slice(0, 500),
      };
    })()`);
    console.log('Cockpit Modal Verification:', cockpitModalState);

    // Capture screenshot of Cockpit confirmation modal
    await takeScreenshot(ws, msgIdRef, path.join(ARTIFACT_DIR, 'cockpit_manual_confirm_modal.png'));

    ws.close();
    console.log('\n✓ Visual inspection & modal verification complete!');
  } catch (err) {
    console.error('Error during browser inspection:', err);
  } finally {
    try { chromeProc.kill('SIGTERM'); } catch {}
  }
}

main();

