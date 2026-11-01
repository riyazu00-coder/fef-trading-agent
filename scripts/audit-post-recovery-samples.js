const http = require("http");
const { DatabaseSync } = require("node:sqlite");
const path = require("path");

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

function getSqliteData() {
  const db = new DatabaseSync(path.join(process.env.HOME, ".fef/data/fef-cortex.db"), { readOnly: true });
  const quotes = db.prepare("SELECT symbol, bid, ask, spread, quote_timestamp, captured_at, received_at FROM quote_snapshot WHERE symbol IN ('XAUUSD', 'BTCUSD', 'EURUSD', 'USDJPY') ORDER BY symbol").all();
  const hb = db.prepare("SELECT sequence, quotes_count, terminal_connected, received_at FROM terminal_heartbeat ORDER BY received_at DESC LIMIT 1").get();
  const conn = db.prepare("SELECT * FROM connector_state WHERE device_id = 'fef-mac-primary-01'").get();
  return { quotes, hb, conn };
}

async function takeSample(sampleId) {
  const health = await getJson("http://127.0.0.1:5558/health");
  const bridge = await getJson("http://127.0.0.1:5556/api/status");
  const sqlite = getSqliteData();
  return {
    sampleId,
    wallTime: new Date().toISOString(),
    health: {
      supervisor: health.supervisor,
      mt5Terminal: health.mt5Terminal,
      broker: health.broker,
      symbol: health.symbol,
      bid: health.bid,
      ask: health.ask,
      quoteTimestamp: health.quoteTimestamp,
      brokerQuoteAgeMs: health.brokerQuoteAgeMs,
      priceAuthority: health.priceAuthority,
      feedStatus: health.feedStatus,
    },
    bridge: {
      mt5Connected: bridge.mt5Connected,
      heartbeatCount: bridge.heartbeatCount,
      heartbeatAgeMs: bridge.heartbeatAgeMs,
      quotesAvailable: bridge.quotesAvailable,
      xauQuote: bridge.quotes?.XAUUSD ? { bid: bridge.quotes.XAUUSD.bid, ask: bridge.quotes.XAUUSD.ask, time: bridge.quotes.XAUUSD.time, timestamp: bridge.quotes.XAUUSD.timestamp } : null,
      btcQuote: bridge.quotes?.BTCUSD ? { bid: bridge.quotes.BTCUSD.bid, ask: bridge.quotes.BTCUSD.ask, time: bridge.quotes.BTCUSD.time, timestamp: bridge.quotes.BTCUSD.timestamp } : null,
    },
    sqlite: {
      hb: sqlite.hb,
      conn: sqlite.conn,
      quotes: sqlite.quotes,
    }
  };
}

async function run() {
  console.log("=== TAKING SAMPLE 1 ===");
  const s1 = await takeSample(1);
  console.log("Sample 1 wallTime:", s1.wallTime, "XAU Bid:", s1.health.bid, "BTC Bid:", s1.bridge.btcQuote?.bid, "XAU quoteTs:", s1.health.quoteTimestamp);
  console.log("Waiting 30 seconds for Sample 2...");
  await new Promise(r => setTimeout(r, 30000));
  
  console.log("=== TAKING SAMPLE 2 ===");
  const s2 = await takeSample(2);
  console.log("Sample 2 wallTime:", s2.wallTime, "XAU Bid:", s2.health.bid, "BTC Bid:", s2.bridge.btcQuote?.bid, "XAU quoteTs:", s2.health.quoteTimestamp);
  console.log("Waiting 30 seconds for Sample 3...");
  await new Promise(r => setTimeout(r, 30000));

  console.log("=== TAKING SAMPLE 3 ===");
  const s3 = await takeSample(3);
  console.log("Sample 3 wallTime:", s3.wallTime, "XAU Bid:", s3.health.bid, "BTC Bid:", s3.bridge.btcQuote?.bid, "XAU quoteTs:", s3.health.quoteTimestamp);

  console.log("\n=== COMPREHENSIVE 3-SAMPLE RESULT ===");
  console.log(JSON.stringify({ s1, s2, s3 }, null, 2));
}

run().catch(console.error);

