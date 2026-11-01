const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

async function test() {
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--remote-debugging-port=9254',
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1440,900',
    'about:blank'
  ], { stdio: 'ignore' });

  await new Promise(r => setTimeout(r, 2000));
  const pages = await new Promise(r => http.get('http://127.0.0.1:9254/json/list', res => {
    let d = ''; res.on('data', c => d += c); res.on('end', () => r(JSON.parse(d)));
  }));
  const ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));
  let id = 1000;
  function send(m, p = {}) {
    return new Promise(r => {
      const cur = ++id;
      const h = (d) => {
        const msg = JSON.parse(d.toString());
        if (msg.id === cur) { ws.removeListener('message', h); r(msg.result); }
      };
      ws.on('message', h);
      ws.send(JSON.stringify({ id: cur, method: m, params: p }));
    });
  }
  await send('Page.enable');
  await send('Network.enable');

  await send('Page.navigate', { url: 'https://app.feftradingsolutions.com/tradingview' });
  await new Promise(r => setTimeout(r, 5000));

  const apiRaw = await send('Runtime.evaluate', {
    expression: `(async () => {
      const res = await fetch('/api/bridge/mt5?action=TELEMETRY');
      const data = await res.json();
      return {
        keys: Object.keys(data),
        transport: data.transport,
        localBridge: data.localBridge,
        mt5Connected: data.mt5Connected,
        symbolsType: typeof data.symbols,
        symbolsIsArray: Array.isArray(data.symbols),
        symbolsLength: data.symbols ? data.symbols.length : null,
        symbols: data.symbols,
        resolvedMap: data.resolvedMap,
        assetDiagnostics: data.assetDiagnostics ? Object.keys(data.assetDiagnostics) : null
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('Details:', JSON.stringify(apiRaw.result.value, null, 2));

  chrome.kill();
  process.exit(0);
}
test().catch(console.error);

