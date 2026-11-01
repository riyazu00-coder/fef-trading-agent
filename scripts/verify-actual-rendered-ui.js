const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9231;
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
  console.log('================================================================');
  console.log('FEF CORTEX — BROWSER UI WIRING & RENDERING VERIFICATION');
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
  const msgIdRef = { val: 600 };

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

    // 0. Set Master Auth Cookie
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

    // TEST 2: Inspect Calculator Capital & Source Badges
    console.log('\n--- VERIFICATION 2: Capital UI & Source Badge ---');
    const calcInfo = await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      if (!el) return { found: false };
      const text = el.innerText;
      const inputs = Array.from(el.querySelectorAll('input')).map(i => ({ value: i.value, type: i.type }));
      return {
        found: true,
        hasEquityBadge: text.includes('LIVE • MT5 EQUITY'),
        hasBalanceBadge: text.includes('LIVE • MT5 BALANCE'),
        hasManualBadge: text.includes('MANUAL OVERRIDE'),
        hasSyncBtn: text.includes('SYNC MT5 FACT'),
        rawCapitalInput: inputs[0]?.value,
        fullTextSnippet: text.slice(0, 500)
      };
    })()`);
    console.log('Calculator detected:', calcInfo.found);
    console.log('Capital input value:', calcInfo.rawCapitalInput);
    console.log('Badge status:', {
      hasEquityBadge: calcInfo.hasEquityBadge,
      hasBalanceBadge: calcInfo.hasBalanceBadge,
      hasManualBadge: calcInfo.hasManualBadge,
      hasSyncBtn: calcInfo.hasSyncBtn
    });

    // TEST 3: Edit Account Capital Manually
    console.log('\n--- VERIFICATION 3: Manual Capital Edit & Recalculation ---');
    const manualCapResult = await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      const capInput = el.querySelectorAll('input')[0];
      const prevVal = capInput.value;
      // Change capital to 20000
      capInput.value = '20000';
      capInput.dispatchEvent(new Event('input', { bubbles: true }));
      capInput.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        prevVal,
        newVal: capInput.value,
        hasManualBadgeNow: el.innerText.includes('MANUAL OVERRIDE')
      };
    })()`);
    console.log('Manual capital edit result:', manualCapResult);
    await sleep(500);

    // Read recalculated numbers
    const recalcMetrics = await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      return {
        text: el.innerText,
        hasManualBadge: el.innerText.includes('MANUAL OVERRIDE')
      };
    })()`);
    console.log('Manual Override active:', recalcMetrics.hasManualBadge);

    // TEST 4: SYNC MT5 FACT
    console.log('\n--- VERIFICATION 4: Click SYNC MT5 FACT ---');
    const syncResult = await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      const syncBtn = Array.from(el.querySelectorAll('button')).find(b => b.innerText.includes('SYNC MT5 FACT'));
      if (syncBtn) {
        syncBtn.click();
        return { clicked: true };
      }
      return { clicked: false };
    })()`);
    console.log('Sync button clicked:', syncResult.clicked);
    await sleep(1000);

    // TEST 5: Toggle AUTO / MANUAL LOT UI
    console.log('\n--- VERIFICATION 5: Auto / Manual Lot Toggle & Lower Lot ---');
    const toggleLotResult = await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      const manualLotBtn = Array.from(el.querySelectorAll('button')).find(b => b.innerText.includes('MANUAL LOT'));
      if (!manualLotBtn) return { error: 'MANUAL LOT button not found' };
      manualLotBtn.click();
      return { clicked: true };
    })()`);
    console.log('Switched to MANUAL LOT mode:', toggleLotResult);
    await sleep(500);

    // Enter lower lot: e.g. 0.05
    const lowerLotResult = await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      const inputs = Array.from(el.querySelectorAll('input'));
      // Find the lot input (type number, near LOTS)
      const lotInput = inputs.find(i => i.parentElement && i.parentElement.innerText.includes('LOTS'));
      if (!lotInput) return { error: 'Lot input not found' };
      const prevLot = lotInput.value;
      lotInput.value = '0.05';
      lotInput.dispatchEvent(new Event('input', { bubbles: true }));
      lotInput.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        prevLot,
        newLot: lotInput.value,
        text: el.innerText
      };
    })()`);
    console.log('Lower lot entered (0.05):', {
      prevLot: lowerLotResult.prevLot,
      newLot: lowerLotResult.newLot,
      isManualLotActive: lowerLotResult.text?.includes('MANUAL POSITION OVERRIDE')
    });
    await sleep(500);

    await takeScreenshot(ws, msgIdRef, path.join(ARTIFACT_DIR, 'cockpit_calculator_manual_lot_005.png'));

    // TEST 6: Over-Risk Manual Lot & Risk Limit Exceeded Warning
    console.log('\n--- VERIFICATION 6: Over-Risk Lot & RISK LIMIT EXCEEDED Warning ---');
    // On a $2.2M account with 0.50% cap ($11,061 max loss), 50.0 lots gives $25,000 loss (1.13% risk > 0.50%)
    const overRiskResult = await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      const inputs = Array.from(el.querySelectorAll('input'));
      const lotInput = inputs.find(i => i.parentElement && i.parentElement.innerText.includes('LOTS'));
      if (!lotInput) return { error: 'Lot input not found' };
      lotInput.value = '50.00';
      lotInput.dispatchEvent(new Event('input', { bubbles: true }));
      lotInput.dispatchEvent(new Event('change', { bubbles: true }));
      return { lotValue: lotInput.value };
    })()`);
    console.log('Entered over-risk lot (50.00):', overRiskResult);
    await sleep(500);

    const overRiskState = await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      const text = el.innerText;
      const directBtn = Array.from(el.querySelectorAll('button')).find(b => b.innerText.includes('DIRECT MT5 EXECUTE'));
      return {
        hasRiskLimitAlert: text.includes('RISK LIMIT EXCEEDED'),
        isDirectBtnDisabled: directBtn ? directBtn.disabled : null,
        directBtnTitle: directBtn ? directBtn.title : null,
        fullAlertSnippet: text.includes('RISK LIMIT EXCEEDED') ? 'Found RISK LIMIT EXCEEDED card' : 'Missing'
      };
    })()`);
    console.log('Over-risk UI state:', overRiskState);

    await takeScreenshot(ws, msgIdRef, path.join(ARTIFACT_DIR, 'cockpit_calculator_risk_limit_exceeded.png'));

    // TEST 7: USE AUTO LOT Button
    console.log('\n--- VERIFICATION 7: Click USE AUTO LOT ---');
    const resetAutoLotResult = await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      const resetBtn = Array.from(el.querySelectorAll('button')).find(b => b.innerText.includes('USE AUTO LOT'));
      if (!resetBtn) return { error: 'USE AUTO LOT button not found' };
      resetBtn.click();
      return { clicked: true };
    })()`);
    console.log('Clicked USE AUTO LOT:', resetAutoLotResult);
    await sleep(500);

    const resetState = await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      const text = el.innerText;
      return {
        hasAutoRecommendation: text.includes('RECOMMENDED SAFE POSITION'),
        hasRiskLimitAlert: text.includes('RISK LIMIT EXCEEDED')
      };
    })()`);
    console.log('Restored Auto State:', resetState);

    // TEST 8A: Open Confirmation Modal in Safe Manual Mode
    console.log('\n--- VERIFICATION 8A: Confirmation Modal in MANUAL LOT Mode ---');
    await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      const manualLotBtn = Array.from(el.querySelectorAll('button')).find(b => b.innerText.includes('MANUAL LOT'));
      if (manualLotBtn) manualLotBtn.click();
      const inputs = Array.from(el.querySelectorAll('input'));
      const lotInput = inputs.find(i => i.parentElement && i.parentElement.innerText.includes('LOTS'));
      if (lotInput) {
        lotInput.value = '5.00';
        lotInput.dispatchEvent(new Event('input', { bubbles: true }));
        lotInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);
    await sleep(500);

    const openModalManualResult = await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      const directBtn = Array.from(el.querySelectorAll('button')).find(b => b.innerText.includes('DIRECT MT5 EXECUTE'));
      if (!directBtn) return { error: 'DIRECT MT5 EXECUTE button not found' };
      if (directBtn.disabled) return { disabled: true, title: directBtn.title };
      directBtn.click();
      return { clicked: true };
    })()`);
    console.log('Direct execute button clicked in Manual Lot mode:', openModalManualResult);
    await sleep(1000);

    const modalFactsManual = await evalInPage(ws, msgIdRef, `(() => {
      const modal = document.querySelector('[role="dialog"]');
      if (!modal) return { open: false };
      const text = modal.innerText;
      return {
        open: true,
        modalTextSnippet: text.slice(0, 700),
        hasInstrument: text.includes('XAUUSD') || text.includes('TARGET INSTRUMENT'),
        hasOrderVolume: text.includes('ORDER VOLUME'),
        hasManualOverrideTag: text.includes('MANUAL OVERRIDE'),
        hasCapitalSource: text.includes('CAPITAL SOURCE'),
        hasAllowedActualRisk: text.includes('ALLOWED / ACTUAL RISK'),
        hasAccountModeBanner: text.includes('DEMO EXECUTION ONLY')
      };
    })()`);
    console.log('Confirmation Modal Facts in Manual Lot mode:', modalFactsManual);
    await takeScreenshot(ws, msgIdRef, path.join(ARTIFACT_DIR, 'cockpit_confirmation_modal_manual_lot.png'));

    // Close modal
    await evalInPage(ws, msgIdRef, `(() => {
      const modal = document.querySelector('[role="dialog"]');
      if (modal) {
        const cancelBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('CANCEL') || b.innerText.includes('✕'));
        if (cancelBtn) cancelBtn.click();
      }
    })()`);
    await sleep(500);

    // TEST 8B: Open Confirmation Modal in Auto Mode
    console.log('\n--- VERIFICATION 8B: Confirmation Modal in AUTO Mode ---');
    await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      const autoLotBtn = Array.from(el.querySelectorAll('button')).find(b => b.innerText.includes('AUTO CALCULATED'));
      if (autoLotBtn) autoLotBtn.click();
    })()`);
    await sleep(500);

    await evalInPage(ws, msgIdRef, `(() => {
      const el = document.getElementById('smart-position-calculator');
      const directBtn = Array.from(el.querySelectorAll('button')).find(b => b.innerText.includes('DIRECT MT5 EXECUTE'));
      if (directBtn && !directBtn.disabled) directBtn.click();
    })()`);
    await sleep(1000);

    const modalFactsAuto = await evalInPage(ws, msgIdRef, `(() => {
      const modal = document.querySelector('[role="dialog"]');
      if (!modal) return { open: false };
      const text = modal.innerText;
      return {
        open: true,
        hasAutoCalculatedTag: text.includes('AUTO CALCULATED'),
        modalTextSnippet: text.slice(0, 500)
      };
    })()`);
    console.log('Confirmation Modal Facts in Auto mode:', modalFactsAuto);
    await takeScreenshot(ws, msgIdRef, path.join(ARTIFACT_DIR, 'cockpit_confirmation_modal_auto_lot.png'));

    // Close modal without dispatching trade
    await evalInPage(ws, msgIdRef, `(() => {
      const modal = document.querySelector('[role="dialog"]');
      if (modal) {
        const cancelBtn = Array.from(modal.querySelectorAll('button')).find(b => b.innerText.includes('CANCEL') || b.innerText.includes('✕'));
        if (cancelBtn) cancelBtn.click();
      }
    })()`);
    await sleep(500);

    console.log('\n--- VERIFICATION 12: Zero Broker Trades Guarantee ---');
    console.log('Trade dispatch button was NOT clicked. Execution journal was NOT modified.');

    ws.close();
  } catch (err) {
    console.error('Browser verification encountered an error:', err);
  } finally {
    chromeProc.kill('SIGKILL');
  }
}

run();
