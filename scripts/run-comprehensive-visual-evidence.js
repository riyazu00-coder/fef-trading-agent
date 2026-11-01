const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SCREENSHOT_DIR = path.resolve(__dirname, '../artifacts_visual');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

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
    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === id) {
          ws.removeListener('message', handler);
          if (msg.error) {
            reject(new Error(msg.error.message));
          } else {
            resolve(msg.result);
          }
        }
      } catch (e) {
        // ignore other messages
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function captureScreenshot(ws, idRef, filename, clip = null) {
  const params = { format: 'png' };
  if (clip) params.clip = clip;
  const shot = await cdpSend(ws, idRef.val++, 'Page.captureScreenshot', params);
  const outPath = path.join(SCREENSHOT_DIR, filename);
  fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
  console.log(`Saved screenshot: ${filename}`);
}

async function main() {
  console.log('Starting headless Chrome for Comprehensive Visual Evidence...');
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1920,1080',
    'http://127.0.0.1:3000/cockpit'
  ], { stdio: 'ignore' });

  await sleep(2500);

  const idRef = { val: 1 };

  try {
    const list = await getJson('http://127.0.0.1:9222/json/list');
    const page = list.find(p => p.type === 'page' && p.url.includes('3000'));
    if (!page || !page.webSocketDebuggerUrl) {
      throw new Error('Chrome page not found');
    }

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res) => ws.on('open', res));
    console.log('✓ Connected to CDP');

    // =========================================================================
    // 1. DESKTOP NAV AT 1366, 1440, 1536, 1680, 1920
    // =========================================================================
    console.log('\n--- 1. DESKTOP NAV AUDIT & SCREENSHOTS ---');
    const desktopViewports = [
      { name: '1366x768', width: 1366, height: 768 },
      { name: '1440x900', width: 1440, height: 900 },
      { name: '1536x864', width: 1536, height: 864 },
      { name: '1680x1050', width: 1680, height: 1050 },
      { name: '1920x1080', width: 1920, height: 1080 },
    ];

    await cdpSend(ws, idRef.val++, 'Page.navigate', { url: 'http://127.0.0.1:3000/cockpit' });
    await sleep(2000);

    for (const vp of desktopViewports) {
      await cdpSend(ws, idRef.val++, 'Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await sleep(800);

      const navMetrics = await cdpSend(ws, idRef.val++, 'Runtime.evaluate', {
        expression: `
          (function() {
            const nav = document.querySelector('nav[aria-label="Unified market filters and workspace navigation"]');
            if (!nav) return { found: false };
            const parent = nav.parentElement;
            const navRect = nav.getBoundingClientRect();
            const parentRect = parent ? parent.getBoundingClientRect() : null;
            const items = Array.from(nav.querySelectorAll('a, button')).map(el => {
              const r = el.getBoundingClientRect();
              return {
                text: el.textContent.trim(),
                x: r.x,
                right: r.right,
                width: r.width,
                visible: r.width > 0 && r.right <= window.innerWidth
              };
            });

            const hasMore = items.some(i => i.text.toUpperCase().includes('MORE'));
            const requiredKeywords = ['ALL', 'MEMBER', 'SETTINGS', 'JOURNAL', 'CHART ANALYZER', 'EXECUTION'];
            const foundRequired = requiredKeywords.every(k => items.some(i => i.text.toUpperCase().includes(k)));
            
            // Check if nav wraps into multiple rows
            const yPositions = new Set(items.map(i => Math.round(i.x))); // let's check top positions
            const topPositions = new Set(Array.from(nav.querySelectorAll('a, button')).map(el => Math.round(el.getBoundingClientRect().top)));

            return {
              found: true,
              winWidth: window.innerWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              navWidth: navRect.width,
              navScrollWidth: nav.scrollWidth,
              parentWidth: parentRect ? parentRect.width : null,
              hasMore,
              foundRequired,
              rowCount: topPositions.size,
              itemCount: items.length,
              items: items.map(i => ({ text: i.text, width: Math.round(i.width), right: Math.round(i.right) })),
              allVisible: items.every(i => i.visible)
            };
          })()
        `,
        returnByValue: true
      });

      console.log(`[Desktop ${vp.name}]`, JSON.stringify({
        winWidth: navMetrics.result?.value?.winWidth,
        navWidth: Math.round(navMetrics.result?.value?.navWidth || 0),
        navScrollWidth: navMetrics.result?.value?.navScrollWidth,
        parentWidth: Math.round(navMetrics.result?.value?.parentWidth || 0),
        hasMore: navMetrics.result?.value?.hasMore,
        rowCount: navMetrics.result?.value?.rowCount,
        itemCount: navMetrics.result?.value?.itemCount,
        allVisible: navMetrics.result?.value?.allVisible,
        foundRequired: navMetrics.result?.value?.foundRequired
      }, null, 2));

      // Capture header + second nav row (clip top 180px)
      await captureScreenshot(ws, idRef, `desktop-nav-${vp.name}.png`, {
        x: 0,
        y: 0,
        width: vp.width,
        height: Math.min(220, vp.height),
        scale: 1
      });
    }

    // =========================================================================
    // 2. MOBILE 390x844 SCREENSHOTS & COMPONENT CHECKS
    // =========================================================================
    console.log('\n--- 2. MOBILE 390x844 CHECKS & EVIDENCE ---');
    await cdpSend(ws, idRef.val++, 'Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await sleep(600);

    // /cockpit top
    await cdpSend(ws, idRef.val++, 'Runtime.evaluate', { expression: 'window.scrollTo(0, 0);' });
    await sleep(600);
    await captureScreenshot(ws, idRef, 'mobile-cockpit-top.png');

    // Focus on AI Market Decision
    const aiDecisionBox = await cdpSend(ws, idRef.val++, 'Runtime.evaluate', {
      expression: `
        (function() {
          const el = Array.from(document.querySelectorAll('h2, h3, div')).find(e => e.textContent.includes('AI Market Decision') || e.textContent.includes('MARKET DECISION'));
          const container = el ? el.closest('.rounded-xl, .rounded-lg, section') || el : null;
          if (container) {
            container.scrollIntoView({ behavior: 'instant', block: 'center' });
            const r = container.getBoundingClientRect();
            return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(390, r.width), height: r.height };
          }
          return null;
        })()
      `,
      returnByValue: true
    });
    await sleep(500);
    await captureScreenshot(ws, idRef, 'mobile-cockpit-ai-decision.png');

    // Focus on Central Multi-Agent Intelligence Hub (21 nodes)
    const hubBox = await cdpSend(ws, idRef.val++, 'Runtime.evaluate', {
      expression: `
        (function() {
          const headings = Array.from(document.querySelectorAll('h2, h3, span'));
          const hubH = headings.find(e => e.textContent.includes('Multi-Agent Intelligence Hub') || e.textContent.includes('INTELLIGENCE HUB') || e.textContent.includes('Autonomous Intelligence Swarm'));
          const container = hubH ? hubH.closest('.rounded-xl, .rounded-lg, section') || hubH : null;
          if (container) {
            container.scrollIntoView({ behavior: 'instant', block: 'start' });
            return true;
          }
          return false;
        })()
      `,
      returnByValue: true
    });
    await sleep(500);
    await captureScreenshot(ws, idRef, 'mobile-cockpit-hub-21nodes.png');

    // Audit Hub 21 nodes count and labels
    const hubAudit = await cdpSend(ws, idRef.val++, 'Runtime.evaluate', {
      expression: `
        (function() {
          // Count agent circles or cards in hub
          const svgs = document.querySelectorAll('svg');
          // Look for 21 nodes or swarm agent cards
          const agentItems = Array.from(document.querySelectorAll('*')).filter(el => {
            const t = el.textContent.trim();
            return ['SENTINEL', 'VALUATION', 'MACRO', 'EXECUTION', 'PATTERN', 'SWARM'].some(k => t === k);
          });
          return {
            agentItemsFound: agentItems.length,
            sampleAgents: agentItems.slice(0, 10).map(e => e.textContent.trim())
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Hub agent nodes check:', hubAudit.result?.value);

    // Focus on Market Overview
    await cdpSend(ws, idRef.val++, 'Runtime.evaluate', {
      expression: `
        (function() {
          const el = Array.from(document.querySelectorAll('h2, h3, span')).find(e => e.textContent.includes('Market Overview') || e.textContent.includes('MARKET OVERVIEW'));
          const container = el ? el.closest('.rounded-xl, section') || el : null;
          if (container) container.scrollIntoView({ behavior: 'instant', block: 'start' });
        })()
      `
    });
    await sleep(500);
    await captureScreenshot(ws, idRef, 'mobile-cockpit-market-overview.png');

    // Focus on Global Opportunity Radar
    await cdpSend(ws, idRef.val++, 'Runtime.evaluate', {
      expression: `
        (function() {
          const el = Array.from(document.querySelectorAll('h2, h3, span')).find(e => e.textContent.includes('Opportunity Radar') || e.textContent.includes('RADAR'));
          const container = el ? el.closest('.rounded-xl, section') || el : null;
          if (container) container.scrollIntoView({ behavior: 'instant', block: 'start' });
        })()
      `
    });
    await sleep(500);
    await captureScreenshot(ws, idRef, 'mobile-cockpit-radar.png');

    // /cockpit bottom
    await cdpSend(ws, idRef.val++, 'Runtime.evaluate', { expression: 'window.scrollTo(0, document.body.scrollHeight);' });
    await sleep(600);
    await captureScreenshot(ws, idRef, 'mobile-cockpit-bottom.png');

    // Audit full Cockpit page height for large empty gaps
    const gapAudit = await cdpSend(ws, idRef.val++, 'Runtime.evaluate', {
      expression: `
        (function() {
          const scrollHeight = document.documentElement.scrollHeight;
          // check empty space
          return {
            totalHeight: scrollHeight,
            viewportWidth: window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            hasHorizontalScroll: document.documentElement.scrollWidth > window.innerWidth
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Cockpit gap & dimensions audit:', gapAudit.result?.value);

    // =========================================================================
    // 3. CAPTURE ALL REQUIRED ROUTES AT 390x844
    // =========================================================================
    const routesToCapture = [
      { route: '/agents', name: 'mobile-agents.png' },
      { route: '/markets', name: 'mobile-markets.png' },
      { route: '/markets/XAUUSD', name: 'mobile-markets-XAUUSD.png' },
      { route: '/markets/EURUSD', name: 'mobile-markets-EURUSD.png' },
      { route: '/markets/US100', name: 'mobile-markets-US100.png' },
      { route: '/markets/USOIL', name: 'mobile-markets-USOIL.png' },
      { route: '/markets/BTCUSD', name: 'mobile-markets-BTCUSD.png' },
      { route: '/tradingview', name: 'mobile-tradingview.png' },
      { route: '/execution', name: 'mobile-execution.png' },
      { route: '/journal', name: 'mobile-journal.png' },
      { route: '/settings', name: 'mobile-settings.png' },
      { route: '/member', name: 'mobile-member-unauthenticated.png' },
      { route: '/member/setup', name: 'mobile-member-setup.png' },
      { route: '/admin/members', name: 'mobile-admin-members.png' },
      { route: '/how-to-use', name: 'mobile-how-to-use.png' },
    ];

    console.log('\n--- 3. CAPTURING ALL 15 MANDATORY ROUTES AT 390x844 ---');
    for (const r of routesToCapture) {
      await cdpSend(ws, idRef.val++, 'Page.navigate', { url: `http://127.0.0.1:3000${r.route}` });
      await sleep(1500);
      await cdpSend(ws, idRef.val++, 'Runtime.evaluate', { expression: 'window.scrollTo(0, 0);' });
      await sleep(400);

      const pageStatus = await cdpSend(ws, idRef.val++, 'Runtime.evaluate', {
        expression: `
          ({
            url: window.location.pathname,
            title: document.title,
            scrollHeight: document.documentElement.scrollHeight,
            scrollWidth: document.documentElement.scrollWidth,
            overflow: document.documentElement.scrollWidth > window.innerWidth
          })
        `,
        returnByValue: true
      });
      console.log(`[Route ${r.route}]`, pageStatus.result?.value);
      await captureScreenshot(ws, idRef, r.name);
    }

    // =========================================================================
    // 4. OPEN MOBILE DRAWER AT 360x800 AND 430x932
    // =========================================================================
    console.log('\n--- 4. MOBILE DRAWER AT 360x800 & 430x932 ---');
    const drawerResolutions = [
      { name: '360x800', width: 360, height: 800 },
      { name: '430x932', width: 430, height: 932 },
    ];

    for (const dr of drawerResolutions) {
      await cdpSend(ws, idRef.val++, 'Emulation.setDeviceMetricsOverride', {
        width: dr.width,
        height: dr.height,
        deviceScaleFactor: 1,
        mobile: true,
      });
      await cdpSend(ws, idRef.val++, 'Page.navigate', { url: 'http://127.0.0.1:3000/cockpit' });
      await sleep(1500);

      // Click menu toggle
      await cdpSend(ws, idRef.val++, 'Runtime.evaluate', {
        expression: `
          const btn = document.querySelector('header button[aria-label="Toggle Navigation Menu"]');
          if (btn) btn.click();
        `
      });
      await sleep(600);

      const drawerVerification = await cdpSend(ws, idRef.val++, 'Runtime.evaluate', {
        expression: `
          (function() {
            const bodyText = document.body.innerText;
            return {
              hasTradingIntel: bodyText.includes('TRADING & INTELLIGENCE'),
              hasMarketsShortcuts: bodyText.includes('MARKETS & SHORTCUTS'),
              hasAccountSystem: bodyText.includes('ACCOUNT & SYSTEM'),
              hasHelpTelemetry: bodyText.includes('HELP & TELEMETRY')
            };
          })()
        `,
        returnByValue: true
      });
      console.log(`Drawer verification [${dr.name}]:`, drawerVerification.result?.value);

      await captureScreenshot(ws, idRef, `mobile-drawer-${dr.name}.png`);
    }

    // =========================================================================
    // 5. OVERLAYS & MODALS CHECK (NOTIFICATION, DIALOGS WITHOUT ORDER PLACEMENT)
    // =========================================================================
    console.log('\n--- 5. OVERLAYS & MODALS CHECK ---');
    // Revert to 390x844
    await cdpSend(ws, idRef.val++, 'Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await cdpSend(ws, idRef.val++, 'Page.navigate', { url: 'http://127.0.0.1:3000/cockpit' });
    await sleep(1500);

    // Open notifications drawer / bell
    const bellClicked = await cdpSend(ws, idRef.val++, 'Runtime.evaluate', {
      expression: `
        (function() {
          const bell = document.querySelector('header button[aria-label="System telemetry"]');
          if (bell) {
            bell.click();
            return true;
          }
          return false;
        })()
      `,
      returnByValue: true
    });
    await sleep(600);
    if (bellClicked.result?.value) {
      await captureScreenshot(ws, idRef, 'mobile-overlay-notifications.png');
      // close it
      await cdpSend(ws, idRef.val++, 'Runtime.evaluate', {
        expression: `
          const bell = document.querySelector('header button[aria-label="System telemetry"]');
          if (bell) bell.click();
        `
      });
      await sleep(400);
    }

    // Check execution page confirmation modal (SAFE, NO BROKER ORDERS)
    await cdpSend(ws, idRef.val++, 'Page.navigate', { url: 'http://127.0.0.1:3000/execution' });
    await sleep(1500);

    // Capture execution base view
    await captureScreenshot(ws, idRef, 'mobile-execution-dialog-base.png');

    console.log('\n===============================================================');
    console.log(' ALL VISUAL EVIDENCE CAPTURED SUCCESSFULLY ');
    console.log('===============================================================');

    ws.close();
    chromeProc.kill();
  } catch (err) {
    console.error('Evidence Gathering Error:', err);
    chromeProc.kill();
    process.exit(1);
  }
}

main().catch(console.error);
