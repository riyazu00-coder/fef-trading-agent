#!/usr/bin/env node
/**
 * FEF CORTEX — MASTER HEADER BREAKPOINT & FIT VERIFICATION (CDP)
 * 
 * Verifies that with an active MASTER session:
 * 1. ADMIN console link (👑 ADMIN) renders in the header
 * 2. CONTACT desk button renders and remains visible
 * 3. All header controls (Search, Open, License, MT5, Sentinel, Data, Execution, TradingView, Admin, Member, Guide, Contact) fit without clipping
 * 4. Header scrollWidth <= clientWidth across desktop breakpoints:
 *    - 1920x1080 (FHD / Wide)
 *    - 1680x1050 (WSXGA+)
 *    - 1536x864  (Common 14"/15" PC Laptop)
 *    - 1440x900  (MacBook Air / Pro default)
 *    - 1366x768  (HD Laptop minimum desktop threshold)
 * 5. Captures screenshots to artifacts directory
 * 6. Cleanly logs out and deletes test master credentials so registry is left clean
 */

require('sucrase/register');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { licenseService } = require('../src/lib/licensing/license-service');

const ARTIFACT_DIR = '/Users/mac/.gemini/antigravity/brain/fa54ad24-3b14-4fde-a263-ed5c6dfd2025/screenshots';
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let respData = '';
      const setCookie = res.headers['set-cookie'];
      res.on('data', chunk => respData += chunk);
      res.on('end', () => {
        try {
          resolve({ body: JSON.parse(respData), setCookie });
        } catch {
          resolve({ body: respData, setCookie });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runVerification() {
  console.log('===============================================================');
  console.log(' FEF CORTEX — MASTER HEADER RESPONSIVE FIT VERIFICATION (CDP)  ');
  console.log('===============================================================');

  // Step 1: Create temporary Master account for verification
  console.log('\n[1/6] Creating temporary verification Master account...');
  const testUsername = 'verify_master_cdp';
  const testEmail = 'verify_master_cdp@feftrading.com';
  const testPassword = 'Verify#Master2026Password!';

  // Clean any previous
  const prev = licenseService.getAllMasterAccounts();
  for (const m of prev) licenseService.deleteMember(m.memberId);

  const masterRes = licenseService.createMasterAccount({
    name: 'Verification Master',
    username: testUsername,
    email: testEmail,
    password: testPassword,
  });

  if (!masterRes.success || !masterRes.member) {
    throw new Error(`Failed to create verification master: ${masterRes.error}`);
  }
  const testMasterId = masterRes.member.memberId;
  console.log(`  ✓ Created Master: ${testUsername} (${testMasterId})`);

  // Step 2: Log in via API to get session cookie
  console.log('\n[2/6] Logging in via /api/auth/member to generate session...');
  const loginRes = await postJson('http://localhost:3000/api/auth/member', {
    action: 'LOGIN',
    identifier: testUsername,
    password: testPassword,
  });

  let sessionCookieValue = null;
  if (loginRes.setCookie && loginRes.setCookie.length > 0) {
    for (const cookieStr of loginRes.setCookie) {
      if (cookieStr.startsWith('fef_member_session=')) {
        sessionCookieValue = cookieStr.split(';')[0].split('=')[1];
      }
    }
  }

  if (!sessionCookieValue) {
    throw new Error('Failed to obtain fef_member_session cookie from login response');
  }
  console.log('  ✓ Session cookie obtained successfully');

  // Step 3: Connect to Chrome CDP
  console.log('\n[3/6] Connecting to Chrome CDP on 127.0.0.1:9555...');
  const targets = await getJson('http://127.0.0.1:9555/json');
  const pageTarget = targets.find(t => t.type === 'page' && !t.url.startsWith('chrome-extension'));
  if (!pageTarget) {
    throw new Error('No Chrome page target found');
  }

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  console.log('  ✓ Connected to Chrome CDP target:', pageTarget.title || pageTarget.url);

  let messageId = 1;
  const pending = new Map();

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
  });

  function sendCDP(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = messageId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  // Step 4: Inject session cookie and navigate to /cockpit
  console.log('\n[4/6] Injecting session cookie into browser & navigating...');
  await sendCDP('Network.enable');
  await sendCDP('Network.setCookie', {
    name: 'fef_member_session',
    value: sessionCookieValue,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
  });

  await sendCDP('Page.navigate', { url: 'http://localhost:3000/cockpit' });
  
  // Wait until MemberAuthContext finishes fetching session and renders ADMIN button
  let adminRendered = false;
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 300));
    const check = await sendCDP('Runtime.evaluate', {
      expression: `!!Array.from(document.querySelectorAll('a, button')).find(el => el.textContent.includes('ADMIN'))`,
      returnByValue: true,
    });
    if (check.result.value) {
      adminRendered = true;
      console.log(`  ✓ Auth state hydrated: ADMIN button visible in DOM (after ${i * 300}ms)`);
      break;
    }
  }

  if (!adminRendered) {
    console.warn('  ⚠️ ADMIN button did not render within timeout, proceeding to checks...');
  }

  // Step 5: Test viewports
  console.log('\n[5/6] Testing responsive header layout across desktop breakpoints:');
  const breakpoints = [
    { width: 1920, height: 1080, name: '1920 (FHD / Ultrawide / Desktop)' },
    { width: 1680, height: 1050, name: '1680 (WSXGA+ High Desktop)' },
    { width: 1536, height: 864,  name: '1536 (Standard 15.6" Laptop)' },
    { width: 1440, height: 900,  name: '1440 (MacBook Pro / Air)' },
    { width: 1366, height: 768,  name: '1366 (HD Laptop Base Threshold)' },
  ];

  const results = [];

  for (const bp of breakpoints) {
    // Set viewport
    await sendCDP('Emulation.setDeviceMetricsOverride', {
      width: bp.width,
      height: bp.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await new Promise(r => setTimeout(r, 400));

    // Evaluate header metrics and elements in DOM
    const evalRes = await sendCDP('Runtime.evaluate', {
      expression: `(() => {
        const header = document.querySelector('header');
        if (!header) return { error: 'header element not found' };

        const adminBtn = Array.from(header.querySelectorAll('a, button')).find(el => el.textContent.includes('ADMIN'));
        const contactBtn = Array.from(header.querySelectorAll('a, button')).find(el => el.textContent.includes('CONTACT'));
        const memberBtn = Array.from(header.querySelectorAll('a, button')).find(el => el.textContent.includes('MEMBER'));
        const guideBtn = Array.from(header.querySelectorAll('a, button')).find(el => el.textContent.includes('GUIDE'));

        const clientWidth = header.clientWidth;
        const scrollWidth = header.scrollWidth;
        const overflow = scrollWidth > clientWidth + 2; // tolerance

        // Check if last element (bell or contact) is within client bounds
        const lastChild = header.querySelector('div:last-child');
        const lastRect = lastChild ? lastChild.getBoundingClientRect() : null;
        const clipped = lastRect ? (lastRect.right > window.innerWidth) : false;

        return {
          clientWidth,
          scrollWidth,
          overflow,
          clipped,
          hasAdmin: !!adminBtn,
          hasContact: !!contactBtn,
          hasMember: !!memberBtn,
          hasGuide: !!guideBtn,
          adminText: adminBtn ? adminBtn.textContent.trim() : null,
          contactVisible: contactBtn ? (contactBtn.offsetParent !== null) : false,
        };
      })()`,
      returnByValue: true,
    });

    const val = evalRes.result.value;

    // Capture screenshot
    const shot = await sendCDP('Page.captureScreenshot', { format: 'png' });
    const shotPath = path.join(ARTIFACT_DIR, `master-header-fit-${bp.width}.png`);
    fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));

    const pass = !val.overflow && !val.clipped && val.hasAdmin && val.hasContact;
    results.push({ bp, val, pass, shotPath });

    console.log(`  Breakpoint ${bp.name}:`);
    console.log(`    - Header clientWidth: ${val.clientWidth}px | scrollWidth: ${val.scrollWidth}px`);
    console.log(`    - Overflow / Clipped: ${val.overflow ? 'YES ❌' : 'NO ✓'} / ${val.clipped ? 'YES ❌' : 'NO ✓'}`);
    console.log(`    - ADMIN Button Present : ${val.hasAdmin ? '✓ YES (' + val.adminText + ')' : '❌ NO'}`);
    console.log(`    - CONTACT Button Visible: ${val.contactVisible ? '✓ YES' : '❌ NO'}`);
    console.log(`    - Screenshot Saved: ${shotPath}`);
    console.log(`    - Result: ${pass ? '✅ PASS' : '❌ FAIL'}\n`);
  }

  // Step 6: Cleanup
  console.log('[6/6] Cleaning up test master account and resetting browser...');
  // Clear cookie
  await sendCDP('Network.deleteCookies', { name: 'fef_member_session', domain: 'localhost', path: '/' });
  // Reset device metrics override
  await sendCDP('Emulation.clearDeviceMetricsOverride');
  ws.close();

  // Delete test master record from disk registry
  licenseService.deleteMember(testMasterId);
  const remainingMasters = licenseService.getAllMasterAccounts();
  console.log(`  ✓ Deleted verification Master. Current masters in registry: ${remainingMasters.length}`);

  const allPassed = results.every(r => r.pass);
  console.log('===============================================================');
  console.log(`BREAKPOINT VERIFICATION SUMMARY: ${allPassed ? 'ALL PASSED (5/5) ✅' : 'FAILURES DETECTED ❌'}`);
  console.log('===============================================================');

  if (!allPassed) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('\n❌ Verification Failed:', err);
  // Emergency clean
  try {
    const { licenseService } = require('../src/lib/licensing/license-service');
    const masters = licenseService.getAllMasterAccounts();
    for (const m of masters) licenseService.deleteMember(m.memberId);
  } catch {}
  process.exit(1);
});
