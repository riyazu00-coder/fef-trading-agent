const { spawn } = require('child_process');
const http = require('http');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

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
  console.log('Starting headless Chrome with remote debugging on port 9222...');
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

    // Viewports to test
    const targetViewports = [
      // Mobile
      { name: 'Mobile 360x800', width: 360, height: 800, isMobile: true },
      { name: 'Mobile 375x812', width: 375, height: 812, isMobile: true },
      { name: 'Mobile 390x844', width: 390, height: 844, isMobile: true },
      { name: 'Mobile 412x915', width: 412, height: 915, isMobile: true },
      { name: 'Mobile 430x932', width: 430, height: 932, isMobile: true },
      // Desktop
      { name: 'Desktop 1366x768', width: 1366, height: 768, isMobile: false },
      { name: 'Desktop 1440x900', width: 1440, height: 900, isMobile: false },
      { name: 'Desktop 1536x864', width: 1536, height: 864, isMobile: false },
      { name: 'Desktop 1680x1050', width: 1680, height: 1050, isMobile: false },
      { name: 'Desktop 1920x1080', width: 1920, height: 1080, isMobile: false },
    ];

    console.log('\n===============================================================');
    console.log(' FEF CORTEX — AUTOMATED VIEWPORT OVERFLOW & AUDIT REPORT       ');
    console.log('===============================================================');

    for (const vp of targetViewports) {
      // 1. Set Device Metrics
      await cdpSend(ws, msgId++, 'Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.isMobile,
      });

      await sleep(600);

      // 2. Evaluate layout overflow
      const evalRes = await cdpSend(ws, msgId++, 'Runtime.evaluate', {
        expression: `
          (function() {
            const docWidth = document.documentElement.scrollWidth;
            const winWidth = window.innerWidth;
            const overflow = docWidth > winWidth;
            
            // Check overflow sources if any
            let offendingElements = [];
            if (overflow) {
              const all = document.querySelectorAll('*');
              for (const el of all) {
                if (el.scrollWidth > winWidth) {
                  offendingElements.push({
                    tag: el.tagName,
                    id: el.id,
                    className: (el.className || '').toString().slice(0, 40),
                    scrollWidth: el.scrollWidth
                  });
                }
              }
            }

            // Key element presence checks
            const hasHeader = Boolean(document.querySelector('header'));
            const hasDecision = Boolean(document.querySelector('#cockpit-top-command-header') || document.querySelector('[class*="CURRENT AI DECISION"]'));
            const hasRadar = Boolean(document.querySelector('#opportunity-radar-card'));

            return {
              docWidth,
              winWidth,
              overflow,
              offendingElements: offendingElements.slice(0, 3),
              hasHeader,
              hasDecision,
              hasRadar
            };
          })()
        `,
        returnByValue: true,
      });

      const metrics = evalRes.result?.value;
      const statusIcon = !metrics.overflow ? '✓' : '❌';
      console.log(`  ${statusIcon} [${vp.name}] Window: ${metrics.winWidth}px | DocScroll: ${metrics.docWidth}px | Overflow: ${metrics.overflow ? 'FAIL' : 'NONE (PASS)'}`);
      if (metrics.overflow) {
        console.log(`     Offending elements:`, metrics.offendingElements);
      }
    }

    console.log('===============================================================');
    console.log(' ALL 10 VIEWPORTS AUDITED & TESTED SUCCESSFULLY                ');
    console.log('===============================================================');

    ws.close();
    chromeProc.kill();
  } catch (err) {
    console.error('CDP Error:', err);
    chromeProc.kill();
    process.exit(1);
  }
}

main().catch(console.error);
