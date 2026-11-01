const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9251;
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
  console.log('DIAGNOSING TRADINGVIEW MANUAL EXECUTION FAILURE');
  console.log('Target: https://app.feftradingsolutions.com/tradingview');
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
  const msgIdRef = { val: 500 };

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

    // Capture console API logs
    await cdpSend(ws, ++msgIdRef.val, 'Runtime.enable');
    ws.on('message', (d) => {
      try {
        const msg = JSON.parse(d.toString());
        if (msg.method === 'Runtime.consoleAPICalled') {
          console.log('[BROWSER CONSOLE]', msg.params.type, msg.params.args.map(a => a.value || a.description).join(' '));
        }
      } catch (e) {}
    });

    // Set Master Auth Cookie
    await cdpSend(ws, ++msgIdRef.val, 'Network.setCookie', {
      name: 'fef_session',
      value: MASTER_SESSION_TOKEN,
      domain: 'app.feftradingsolutions.com',
      path: '/',
      httpOnly: false,
      secure: true,
    });

    console.log('Navigating to https://app.feftradingsolutions.com/tradingview...');
    await cdpSend(ws, ++msgIdRef.val, 'Page.navigate', { url: 'https://app.feftradingsolutions.com/tradingview' });
    await sleep(7000);

    // 1. First check what buttons exist on the page
    const pageInfo = await evalInPage(ws, msgIdRef, `(() => {
      const allButtons = Array.from(document.querySelectorAll('button')).map(b => ({
        text: b.innerText.trim().replace(/\\n/g, ' '),
        disabled: b.disabled,
        title: b.title,
        classes: b.className
      }));

      const dock = document.querySelector('.bg-\\\\[\\\\#060D1E\\\\]\\\\/95') || document.querySelector('[title*=\"Quick Scalp\"]');

      return {
        title: document.title,
        buttonCount: allButtons.length,
        buttons: allButtons.filter(b => b.text.length > 0 && b.text.length < 40),
        hasDock: Boolean(dock),
        dockText: dock ? dock.innerText.slice(0, 300) : null
      };
    })()`);
    console.log('Page Info:', pageInfo);
    await takeScreenshot(ws, msgIdRef, path.join(ARTIFACT_DIR, 'tv_initial_page.png'));

    // 2. Switch to BTCUSD so session is open
    console.log('\n--- Switching to BTCUSD ---');
    await evalInPage(ws, msgIdRef, `(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btc = buttons.find(b => b.innerText.includes('BTCUSD') || b.innerText.trim() === 'BTC');
      if (btc) btc.click();
    })()`);
    await sleep(2500);

    const btcPageInfo = await evalInPage(ws, msgIdRef, `(() => {
      const allButtons = Array.from(document.querySelectorAll('button')).map(b => ({
        text: b.innerText.trim().replace(/\\n/g, ' '),
        disabled: b.disabled,
        title: b.title
      }));
      const sellBtn = allButtons.find(b => b.text.includes('SELL'));
      const buyBtn = allButtons.find(b => b.text.includes('BUY'));

      return {
        sellBtn,
        buyBtn,
      };
    })()`);
    console.log('BTC Buttons:', btcPageInfo);

    // 3. Click BUY button
    console.log('\n--- Clicking BUY Button in QuickScalpDock ---');
    const clickRes = await evalInPage(ws, msgIdRef, `(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const buyBtn = buttons.find(b => b.innerText.includes('BUY'));
      if (!buyBtn) return { error: 'No BUY button found' };
      if (buyBtn.disabled) return { error: 'BUY button is disabled', title: buyBtn.title };
      buyBtn.click();
      return { clicked: true };
    })()`);
    console.log('BUY button click result:', clickRes);
    await sleep(1500);

    // 4. Check if modal opened
    const modalCheck = await evalInPage(ws, msgIdRef, `(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return { hasDialog: false };
      const text = dialog.innerText;
      const btns = Array.from(dialog.querySelectorAll('button')).map(b => b.innerText.trim().replace(/\\n/g, ' '));

      return {
        hasDialog: true,
        textSnippet: text.slice(0, 600),
        buttons: btns,
        isMemberAccessModal: text.includes('MEMBER ACCESS REQUIRED'),
        isSafetyGuardModal: text.includes('CONFIRM ORDER DISPATCH') || text.includes('SAFETY CONFIRMATION GUARD'),
      };
    })()`);
    console.log('Modal Check Result:', modalCheck);
    await takeScreenshot(ws, msgIdRef, path.join(ARTIFACT_DIR, 'tv_after_buy_click.png'));

    ws.close();
  } catch (err) {
    console.error('Diagnosis error:', err);
  } finally {
    chromeProc.kill('SIGKILL');
  }
}

run();

