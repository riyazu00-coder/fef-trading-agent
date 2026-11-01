const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9252;
const ARTIFACT_DIR = '/Users/mac/.gemini/antigravity/brain/fa54ad24-3b14-4fde-a263-ed5c6dfd2025/screenshots';
const MASTER_SESSION_TOKEN = 'bWFzdGVyXzY0NGIxODE2Zjc2ZjpyaXlhenUwMEBnbWFpbC5jb206TUFTVEVSOjE3OTQ4MzQ4NDkxOTI6Mjg2NzY3MTljMTdiZjdjZjAzM2IyMzEwOWU4ZGEwNDAwOWUxZTI3NjcxMThjMDQ3NmI0ZDY0YzI0NjdlYTk1Mg==';
const JOURNAL_PATH = path.join(process.cwd(), 'data/fef-execution-journal.jsonl');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function countJournalLines() {
  if (!fs.existsSync(JOURNAL_PATH)) return 0;
  return fs.readFileSync(JOURNAL_PATH, 'utf-8').trim().split('\n').filter(Boolean).length;
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
  if (res && res.exceptionDetails) {
    console.error('Eval Exception Details:', res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  }
  return res && res.result ? res.result.value : null;
}

async function captureScreenshot(ws, msgIdRef, filename) {
  if (!fs.existsSync(ARTIFACT_DIR)) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  }
  const filepath = path.join(ARTIFACT_DIR, filename);
  const res = await cdpSend(ws, ++msgIdRef.val, 'Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
  });
  fs.writeFileSync(filepath, Buffer.from(res.data, 'base64'));
  console.log(`Saved screenshot: ${filepath}`);
  return filepath;
}

async function main() {
  console.log('================================================================');
  console.log('FEF CORTEX — TV-EXEC-1 PRODUCTION BROWSER VERIFICATION');
  console.log('TARGET: https://app.feftradingsolutions.com');
  console.log('================================================================\n');

  const initialJournalCount = countJournalLines();
  console.log(`Initial execution journal entries: ${initialJournalCount}`);

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

  await sleep(2500);
  const msgIdRef = { val: 1000 };

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

    // Set Master Session Cookies
    await cdpSend(ws, ++msgIdRef.val, 'Network.setCookie', {
      name: 'fef_session',
      value: MASTER_SESSION_TOKEN,
      domain: 'app.feftradingsolutions.com',
      path: '/',
      httpOnly: false,
      secure: true,
    });
    await cdpSend(ws, ++msgIdRef.val, 'Network.setCookie', {
      name: 'fef_member_session',
      value: MASTER_SESSION_TOKEN,
      domain: 'app.feftradingsolutions.com',
      path: '/',
      httpOnly: false,
      secure: true,
    });
    console.log('Configured Master Session Cookies');

    // -------------------------------------------------------------------------
    // STEP 1: /cockpit Baseline Regression Verification
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 1: /cockpit Baseline Regression Verification ---');
    await cdpSend(ws, ++msgIdRef.val, 'Page.navigate', {
      url: 'https://app.feftradingsolutions.com/cockpit',
    });
    await sleep(7000);

    const cockpitCheck = await evalInPage(
      ws,
      msgIdRef,
      `(() => {
        const text = document.body.innerText;
        return {
          hasSmartCalc: text.includes('SMART POSITION SIZE & RISK CALCULATOR'),
          hasLiveEquityBadge: text.includes('LIVE • MT5 EQUITY'),
          hasSyncFact: text.includes('SYNC MT5 FACT'),
          hasDirectExecute: text.includes('DIRECT MT5 EXECUTE'),
        };
      })()`
    );
    console.log('Cockpit Baseline Check:', JSON.stringify(cockpitCheck, null, 2));
    await captureScreenshot(ws, msgIdRef, 'prod_tv_cockpit_baseline.png');

    // -------------------------------------------------------------------------
    // STEP 2: /tradingview BTCUSD Live Execution Verification
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 2: /tradingview BTCUSD Live Execution Verification ---');
    await cdpSend(ws, ++msgIdRef.val, 'Page.navigate', {
      url: 'https://app.feftradingsolutions.com/tradingview',
    });
    await sleep(7000);

    // Switch to BTCUSD
    console.log('Selecting BTCUSD...');
    await evalInPage(
      ws,
      msgIdRef,
      `(() => {
        const b = Array.from(document.querySelectorAll('button')).find(el => el.innerText.trim() === 'BTCUSD');
        if (b) b.click();
      })()`
    );
    await sleep(3000);

    const btcDockState = await evalInPage(
      ws,
      msgIdRef,
      `(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const buyBtn = buttons.find(b => b.innerText.includes('BUY') && b.innerText.includes('@'));
        const sellBtn = buttons.find(b => b.innerText.includes('SELL') && b.innerText.includes('@'));
        const text = document.body.innerText;
        return {
          activeSymbol: text.includes('BTCUSD') ? 'BTCUSD' : 'UNKNOWN',
          hasLiveBadge: text.includes('LIVE'),
          buyDisabled: buyBtn ? buyBtn.disabled : null,
          buyText: buyBtn ? buyBtn.innerText.replace(/\\s+/g, ' ') : null,
          sellDisabled: sellBtn ? sellBtn.disabled : null,
          sellText: sellBtn ? sellBtn.innerText.replace(/\\s+/g, ' ') : null,
          hasEquityFact: text.includes('Eq'),
        };
      })()`
    );
    console.log('BTCUSD Dock State:', JSON.stringify(btcDockState, null, 2));
    await captureScreenshot(ws, msgIdRef, 'prod_tv_btcusd_dock_ready.png');

    // Click BUY button
    console.log('\nClicking BUY @ button to trigger Safety Confirmation Guard...');
    const clickBuyRes = await evalInPage(
      ws,
      msgIdRef,
      `(() => {
        const buyBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('BUY') && b.innerText.includes('@'));
        if (buyBtn && !buyBtn.disabled) {
          buyBtn.click();
          return { clicked: true, text: buyBtn.innerText.replace(/\\s+/g, ' ') };
        }
        return { clicked: false, disabled: buyBtn ? buyBtn.disabled : 'not found' };
      })()`
    );
    console.log('Click BUY result:', clickBuyRes);
    await sleep(2000);

    const buyModalState = await evalInPage(
      ws,
      msgIdRef,
      `(() => {
        const modal = document.querySelector('div.fixed.inset-0');
        if (!modal) return { hasModal: false };
        const text = modal.innerText;
        const confirmBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('CONFIRM DEMO ORDER'));
        return {
          hasModal: true,
          hasSafetyGuard: text.includes('Safety Confirmation Guard'),
          hasDemoWarning: text.includes('DEMO EXECUTION ONLY'),
          hasCapitalFact: text.includes('LIVE • MT5 EQUITY') || text.includes('LIVE • MT5 BALANCE'),
          hasInstrumentBtc: text.includes('BTCUSD'),
          hasDirectionBuy: text.includes('BUY'),
          hasConfirmDemoOrderBtn: Boolean(confirmBtn),
          confirmBtnDisabled: confirmBtn ? confirmBtn.disabled : null,
          hasFalseRejection: text.includes('MT5 terminal or bridge is not connected'),
          hasLicenseLock: text.includes('LICENSE REQUIRED'),
          modalTextSnippet: text.slice(0, 400),
        };
      })()`
    );
    console.log('BUY Modal State:', JSON.stringify(buyModalState, null, 2));
    await captureScreenshot(ws, msgIdRef, 'prod_tv_btcusd_buy_modal_verified.png');

    // CANCEL MODAL (DO NOT CONFIRM ORDER)
    console.log('Cancelling BUY modal (Zero broker trade policy)...');
    await evalInPage(
      ws,
      msgIdRef,
      `(() => {
        const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText === 'Cancel');
        if (cancelBtn) cancelBtn.click();
      })()`
    );
    await sleep(1500);

    // Click SELL button
    console.log('\nClicking SELL @ button to trigger Safety Confirmation Guard...');
    const clickSellRes = await evalInPage(
      ws,
      msgIdRef,
      `(() => {
        const sellBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('SELL') && b.innerText.includes('@'));
        if (sellBtn && !sellBtn.disabled) {
          sellBtn.click();
          return { clicked: true, text: sellBtn.innerText.replace(/\\s+/g, ' ') };
        }
        return { clicked: false, disabled: sellBtn ? sellBtn.disabled : 'not found' };
      })()`
    );
    console.log('Click SELL result:', clickSellRes);
    await sleep(2000);

    const sellModalState = await evalInPage(
      ws,
      msgIdRef,
      `(() => {
        const modal = document.querySelector('div.fixed.inset-0');
        if (!modal) return { hasModal: false };
        const text = modal.innerText;
        const confirmBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('CONFIRM DEMO ORDER'));
        return {
          hasModal: true,
          hasSafetyGuard: text.includes('Safety Confirmation Guard'),
          hasDemoWarning: text.includes('DEMO EXECUTION ONLY'),
          hasDirectionSell: text.includes('SELL'),
          hasConfirmDemoOrderBtn: Boolean(confirmBtn),
          confirmBtnDisabled: confirmBtn ? confirmBtn.disabled : null,
          hasFalseRejection: text.includes('MT5 terminal or bridge is not connected'),
        };
      })()`
    );
    console.log('SELL Modal State:', JSON.stringify(sellModalState, null, 2));
    await captureScreenshot(ws, msgIdRef, 'prod_tv_btcusd_sell_modal_verified.png');

    // CANCEL MODAL (DO NOT CONFIRM ORDER)
    console.log('Cancelling SELL modal (Zero broker trade policy)...');
    await evalInPage(
      ws,
      msgIdRef,
      `(() => {
        const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText === 'Cancel');
        if (cancelBtn) cancelBtn.click();
      })()`
    );
    await sleep(1500);

    // -------------------------------------------------------------------------
    // STEP 3: /tradingview XAUUSD Checks
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 3: /tradingview XAUUSD Verification ---');
    await evalInPage(
      ws,
      msgIdRef,
      `(() => {
        const xauBtn = Array.from(document.querySelectorAll('button')).find(el => el.innerText.trim() === 'XAUUSD');
        if (xauBtn) xauBtn.click();
      })()`
    );
    await sleep(2000);

    const xauState = await evalInPage(
      ws,
      msgIdRef,
      `(() => {
        const text = document.body.innerText;
        const buyBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('BUY') && b.innerText.includes('@'));
        return {
          activeSymbol: text.includes('XAUUSD') ? 'XAUUSD' : 'UNKNOWN',
          has50PipFloor: text.includes('50') && text.includes('SL (Pips)'),
          isWeekendClosed: text.includes('WEEKEND CLOSED') || text.includes('Market Session Closed'),
          buyDisabled: buyBtn ? buyBtn.disabled : null,
          buyTitle: buyBtn ? buyBtn.title : null,
        };
      })()`
    );
    console.log('XAUUSD State:', JSON.stringify(xauState, null, 2));
    await captureScreenshot(ws, msgIdRef, 'prod_tv_xauusd_dock_verified.png');

    // -------------------------------------------------------------------------
    // STEP 4: Symbol Resolution (US100 & GER40)
    // -------------------------------------------------------------------------
    console.log('\n--- STEP 4: Symbol Resolution (US100 & GER40) ---');
    // US100
    await evalInPage(
      ws,
      msgIdRef,
      `(() => {
        const us100Btn = Array.from(document.querySelectorAll('button')).find(el => el.innerText.trim() === 'US100');
        if (us100Btn) us100Btn.click();
      })()`
    );
    await sleep(2000);

    const us100State = await evalInPage(
      ws,
      msgIdRef,
      `(() => {
        const text = document.body.innerText;
        const buyBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('BUY') && b.innerText.includes('@'));
        return {
          hasUs100: text.includes('US100'),
          hasMarketClosed: text.includes('Market Session Closed') || text.includes('WEEKEND CLOSED'),
          buyDisabled: buyBtn ? buyBtn.disabled : null,
          buyTitle: buyBtn ? buyBtn.title : null,
        };
      })()`
    );
    console.log('US100 State:', JSON.stringify(us100State, null, 2));
    await captureScreenshot(ws, msgIdRef, 'prod_tv_us100_dock_verified.png');

    // Select GER40 from dropdown
    await evalInPage(
      ws,
      msgIdRef,
      `(() => {
        const select = Array.from(document.querySelectorAll('select')).find(s => s.innerText.includes('GER40') || s.value === 'US100');
        if (select) {
          select.value = 'GER40';
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()`
    );
    await sleep(2000);

    const ger40State = await evalInPage(
      ws,
      msgIdRef,
      `(() => {
        const text = document.body.innerText;
        const buyBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('BUY') && b.innerText.includes('@'));
        return {
          hasGer40: text.includes('GER40'),
          buyDisabled: buyBtn ? buyBtn.disabled : null,
          buyTitle: buyBtn ? buyBtn.title : null,
        };
      })()`
    );
    console.log('GER40 State:', JSON.stringify(ger40State, null, 2));
    await captureScreenshot(ws, msgIdRef, 'prod_tv_ger40_dock_verified.png');

    ws.close();
  } finally {
    chromeProc.kill();
  }

  // -------------------------------------------------------------------------
  // STEP 5: Physical Safety Verification
  // -------------------------------------------------------------------------
  const finalJournalCount = countJournalLines();
  console.log('\n================================================================');
  console.log(`Initial Journal Lines: ${initialJournalCount}`);
  console.log(`Final Journal Lines:   ${finalJournalCount}`);
  if (finalJournalCount !== initialJournalCount) {
    console.error('CRITICAL VIOLATION: Execution journal line count changed! Broker trade detected!');
    process.exit(1);
  } else {
    console.log('SAFETY VERIFIED: ZERO broker trades placed during release verification!');
    console.log('================================================================\n');
  }
}

main().catch((err) => {
  console.error('Production TV verification error:', err);
  process.exit(1);
});
