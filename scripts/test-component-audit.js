const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function getJson(url) {
  return new Promise((res, rej) => {
    http.get(url, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
}

function cdpSend(ws, id, method, params = {}) {
  return new Promise((resolve) => {
    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === id) {
          ws.removeListener('message', handler);
          resolve(msg.result);
        }
      } catch (e) {}
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function run() {
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--no-sandbox',
    'http://127.0.0.1:3000/cockpit'
  ], { stdio: 'ignore' });
  await sleep(2500);

  try {
    const list = await getJson('http://127.0.0.1:9222/json/list');
    const page = list.find(p => p.type === 'page' && p.url.includes('3000'));
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => ws.on('open', r));

    let msgId = 1;
    await cdpSend(ws, msgId++, 'Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await sleep(1000);

    const audit = await cdpSend(ws, msgId++, 'Runtime.evaluate', {
      expression: `
        (function() {
          const bodyText = document.body.innerText;
          const aiDecisionEl = Array.from(document.querySelectorAll('*')).find(e => e.textContent.includes('AI Market Decision') || e.textContent.includes('MARKET DECISION'));
          const aiText = aiDecisionEl ? aiDecisionEl.closest('.rounded-xl, section, div')?.innerText : '';

          const agents = ['SENTINEL', 'VALUATION', 'MACRO', 'LIQUIDITY', 'EXECUTION', 'PATTERN', 'VISION', 'ARBITRAGE', 'MOMENTUM', 'VOLATILITY', 'CORRELATION', 'ORDERBOOK', 'SMC', 'HARMONIC', 'MICROSTRUCTURE', 'FUNDAMENTAL', 'SENTIMENT', 'NEWS', 'INTERMARKET', 'RISK_GUARDIAN', 'SESSION'];
          const foundAgents = agents.filter(a => bodyText.toUpperCase().includes(a));
          const hubHeading = Array.from(document.querySelectorAll('*')).find(e => e.textContent.includes('Multi-Agent Intelligence Hub') || e.textContent.includes('INTELLIGENCE HUB') || e.textContent.includes('Autonomous Intelligence Swarm'));

          const marketOverviewHeading = Array.from(document.querySelectorAll('*')).find(e => e.textContent.includes('Market Overview') || e.textContent.includes('MARKET OVERVIEW'));
          const marketOverviewText = marketOverviewHeading ? marketOverviewHeading.closest('.rounded-xl, section, div')?.innerText : '';

          const radarHeading = Array.from(document.querySelectorAll('*')).find(e => e.textContent.includes('Opportunity Radar') || e.textContent.includes('RADAR'));
          const radarText = radarHeading ? radarHeading.closest('.rounded-xl, section, div')?.innerText : '';

          return {
            aiDecisionFound: Boolean(aiDecisionEl),
            aiDecisionSnippet: aiText ? aiText.slice(0, 150).replace(/\\n/g, ' ') : null,
            hubHeadingFound: Boolean(hubHeading),
            foundAgentsCount: foundAgents.length,
            foundAgentsList: foundAgents,
            marketOverviewFound: Boolean(marketOverviewHeading),
            marketOverviewSnippet: marketOverviewText ? marketOverviewText.slice(0, 150).replace(/\\n/g, ' ') : null,
            radarFound: Boolean(radarHeading),
            radarSnippet: radarText ? radarText.slice(0, 150).replace(/\\n/g, ' ') : null,
            totalHeight: document.documentElement.scrollHeight,
            bodyHeight: document.body.scrollHeight
          };
        })()
      `,
      returnByValue: true
    });

    console.log('Component-Specific Deep Audit Results:');
    console.log(JSON.stringify(audit.result?.value, null, 2));

    ws.close();
    chromeProc.kill();
  } catch (err) {
    console.error(err);
    chromeProc.kill();
  }
}

run();
