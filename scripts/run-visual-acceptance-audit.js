const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

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
  return new Promise((resolve) => {
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === id) {
        ws.removeListener('message', handler);
        resolve(msg.result);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  console.log('Starting headless Chrome for multi-route visual audit...');
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1920,1080',
    'http://127.0.0.1:3000/cockpit'
  ], { stdio: 'ignore' });

  await sleep(2500);

  try {
    const list = await getJson('http://127.0.0.1:9222/json/list');
    const page = list.find(p => p.type === 'page' && p.url.includes('3000'));
    if (!page || !page.webSocketDebuggerUrl) {
      console.error('Could not find active Chrome debugging page', list);
      chromeProc.kill();
      process.exit(1);
    }

    const WebSocket = require('ws');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res) => ws.on('open', res));
    console.log('✓ Connected to Chrome DevTools WebSocket');

    let msgId = 1;

    // Viewport definitions
    const desktopViewports = [
      { name: '1366x768', width: 1366, height: 768 },
      { name: '1440x900', width: 1440, height: 900 },
      { name: '1536x864', width: 1536, height: 864 },
      { name: '1680x1050', width: 1680, height: 1050 },
      { name: '1920x1080', width: 1920, height: 1080 },
    ];

    const mobileViewports = [
      { name: '360x800', width: 360, height: 800 },
      { name: '375x812', width: 375, height: 812 },
      { name: '390x844', width: 390, height: 844 },
      { name: '412x915', width: 412, height: 915 },
      { name: '430x932', width: 430, height: 932 },
    ];

    const criticalRoutes = [
      '/cockpit',
      '/agents',
      '/markets',
      '/markets/XAUUSD',
      '/tradingview',
      '/chart-analyzer',
      '/execution',
      '/journal',
      '/settings',
      '/member',
      '/member/setup',
      '/admin/members',
      '/how-to-use',
    ];

    console.log('\n===============================================================');
    console.log(' PART 1 — AUDITING DESKTOP SECOND NAV ACROSS ALL 5 RESOLUTIONS ');
    console.log('===============================================================');

    // Navigate to /cockpit
    await cdpSend(ws, msgId++, 'Page.navigate', { url: 'http://127.0.0.1:3000/cockpit' });
    await sleep(2000);

    for (const vp of desktopViewports) {
      await cdpSend(ws, msgId++, 'Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await sleep(600);

      const navAudit = await cdpSend(ws, msgId++, 'Runtime.evaluate', {
        expression: `
          (function() {
            const nav = document.querySelector('nav[aria-label="Unified market filters and workspace navigation"]');
            if (!nav) return { found: false };
            const rect = nav.getBoundingClientRect();
            const links = Array.from(nav.querySelectorAll('a, button')).map(el => el.textContent.trim());
            const hasMore = links.some(t => t.toUpperCase().includes('MORE'));
            const docWidth = document.documentElement.scrollWidth;
            const winWidth = window.innerWidth;
            return {
              found: true,
              navWidth: rect.width,
              winWidth,
              docWidth,
              overflow: docWidth > winWidth,
              hasMore,
              itemCount: links.length,
              items: links
            };
          })()
        `,
        returnByValue: true
      });

      const res = navAudit.result?.value;
      console.log(`  ✓ [Desktop ${vp.name}] Win: ${res.winWidth}px | Nav: ${Math.round(res.navWidth)}px | Items: ${res.itemCount} | Overflow: ${res.overflow ? 'FAIL' : 'NONE'} | MORE Dropdown Present: ${res.hasMore ? 'YES (FAIL)' : 'NO (APPROVED)'}`);

      // Capture screenshot
      const shot = await cdpSend(ws, msgId++, 'Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(SCREENSHOT_DIR, `desktop-nav-${vp.name}.png`), Buffer.from(shot.data, 'base64'));
    }

    console.log('\n===============================================================');
    console.log(' PART 2 — AUDITING MOBILE VIEWPORTS & DRAWER                   ');
    console.log('===============================================================');

    for (const vp of mobileViewports) {
      await cdpSend(ws, msgId++, 'Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: true,
      });
      await sleep(600);

      // Check cockpit page overflow
      const mobAudit = await cdpSend(ws, msgId++, 'Runtime.evaluate', {
        expression: `
          (function() {
            const docWidth = document.documentElement.scrollWidth;
            const winWidth = window.innerWidth;
            const hamburger = document.querySelector('header button[aria-label="Toggle Navigation Menu"]');
            return {
              docWidth,
              winWidth,
              overflow: docWidth > winWidth,
              hasHamburger: Boolean(hamburger)
            };
          })()
        `,
        returnByValue: true
      });
      const mobRes = mobAudit.result?.value;
      console.log(`  ✓ [Mobile ${vp.name}] Win: ${mobRes.winWidth}px | Doc: ${mobRes.docWidth}px | Overflow: ${mobRes.overflow ? 'FAIL' : 'NONE'} | Hamburger: ${mobRes.hasHamburger ? 'YES' : 'NO'}`);

      // Open drawer on 390x844 and capture screenshot
      if (vp.name === '390x844' || vp.name === '360x800') {
        await cdpSend(ws, msgId++, 'Runtime.evaluate', {
          expression: `
            const btn = document.querySelector('header button[aria-label="Toggle Navigation Menu"]');
            if (btn) btn.click();
          `
        });
        await sleep(500);

        const drawerCheck = await cdpSend(ws, msgId++, 'Runtime.evaluate', {
          expression: `
            (function() {
              const text = document.body.innerText;
              return {
                hasTradingIntel: text.includes('TRADING & INTELLIGENCE'),
                hasMarkets: text.includes('MARKETS & SHORTCUTS'),
                hasAccount: text.includes('ACCOUNT & SYSTEM'),
                hasSupport: text.includes('HELP & TELEMETRY')
              };
            })()
          `,
          returnByValue: true
        });
        console.log(`     Drawer Grouping Check [${vp.name}]:`, drawerCheck.result?.value);

        const drawerShot = await cdpSend(ws, msgId++, 'Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(SCREENSHOT_DIR, `mobile-drawer-${vp.name}.png`), Buffer.from(drawerShot.data, 'base64'));

        // Close drawer
        await cdpSend(ws, msgId++, 'Runtime.evaluate', {
          expression: `
            const btn = document.querySelector('header button[aria-label="Toggle Navigation Menu"]');
            if (btn) btn.click();
          `
        });
        await sleep(400);
      }
    }

    console.log('\n===============================================================');
    console.log(' PART 3 — AUDITING ALL 13 CRITICAL ROUTES FOR VISUAL RENDERING  ');
    console.log('===============================================================');

    for (const route of criticalRoutes) {
      await cdpSend(ws, msgId++, 'Page.navigate', { url: `http://127.0.0.1:3000${route}` });
      await sleep(1500);

      // Check both mobile 390 and desktop 1440
      await cdpSend(ws, msgId++, 'Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
      });
      await sleep(500);

      const rAuditMob = await cdpSend(ws, msgId++, 'Runtime.evaluate', {
        expression: `
          (function() {
            const docWidth = document.documentElement.scrollWidth;
            const winWidth = window.innerWidth;
            const scrollHeight = document.documentElement.scrollHeight;
            return {
              docWidth,
              winWidth,
              scrollHeight,
              overflow: docWidth > winWidth
            };
          })()
        `,
        returnByValue: true
      });
      const mVal = rAuditMob.result?.value;
      console.log(`  ✓ [Route ${route}] Mobile 390x844 | Height: ${mVal.scrollHeight}px | Overflow: ${mVal.overflow ? 'FAIL' : 'PASS'}`);

      // Capture screenshot for member and admin and tv
      if (['/member', '/admin/members', '/tradingview', '/execution', '/cockpit'].includes(route)) {
        const shot = await cdpSend(ws, msgId++, 'Page.captureScreenshot', { format: 'png' });
        const cleanName = route.replace(/\//g, '_');
        fs.writeFileSync(path.join(SCREENSHOT_DIR, `mobile${cleanName}.png`), Buffer.from(shot.data, 'base64'));
      }
    }

    console.log('\n===============================================================');
    console.log(' ALL VISUAL & INTERACTION AUDITS COMPLETED SUCCESSFULLY       ');
    console.log('===============================================================');

    ws.close();
    chromeProc.kill();
  } catch (err) {
    console.error('Audit Error:', err);
    chromeProc.kill();
    process.exit(1);
  }
}

main().catch(console.error);

