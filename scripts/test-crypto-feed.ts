/**
 * Test Suite: Production Crypto Live-Feed Fallback & Truthful Provenance
 * Verifies conditions A through H as specified in FEF AI Trading requirements:
 *
 * Condition A: Binance success -> Binance primary, classification LIVE
 * Condition B: Binance 451 -> Secondary live provider (Kraken) used
 * Condition C: Binance timeout -> Secondary live provider (Kraken) used
 * Condition D: Binance malformed response -> Secondary live provider (Kraken) used
 * Condition E: Binance + secondary fail -> DATA LIMITED / UNAVAILABLE, no static registry price masquerading as LIVE
 * Condition F: Provider provenance -> actual provider label matches source
 * Condition G: priceType -> LAST / SPOT / MID / DERIVED truthfully classified
 * Condition H: All registered crypto symbols -> mapped or explicitly degraded
 */

import {
  CRYPTO_SYMBOL_MAPPINGS,
  fetchCryptoQuotesWithFallback,
  CryptoFeedQuote
} from '../src/lib/providers/crypto-feed-service';
import { MARKET_REGISTRY } from '../src/lib/registry/market-registry';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

async function runTests() {
  console.log('====================================================');
  console.log('FEF CRYPTO FEED FALLBACK & PROVENANCE TEST SUITE');
  console.log('====================================================\n');

  // ---------------------------------------------------------------------------
  // Condition A: Binance success -> Binance remains primary, classification LIVE
  // ---------------------------------------------------------------------------
  console.log('Condition A: Binance success');
  {
    const mockFetch: typeof fetch = async (input: any) => {
      const url = String(input);
      if (url.includes('api.binance.com')) {
        return new Response(
          JSON.stringify({
            symbol: 'BTCUSDT',
            lastPrice: '77500.25',
            bidPrice: '77498.00',
            askPrice: '77502.50',
            priceChangePercent: '1.85',
            highPrice: '78200.00',
            lowPrice: '76100.00'
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error('Unexpected fallback invocation');
    };

    const quotes = await fetchCryptoQuotesWithFallback(['BTCUSD'], { customFetch: mockFetch });
    const btc = quotes.BTCUSD;
    assert(btc !== undefined, 'BTCUSD quote returned');
    assert(btc.price === 77500.25, 'Price matches Binance live price');
    assert(btc.provider === 'Binance Spot API', 'Provider is Binance Spot API');
    assert(btc.classification === 'LIVE', 'Classification is LIVE');
    assert(btc.feedStatus === 'LIVE', 'feedStatus is LIVE');
    assert(btc.priceType === 'LAST', 'priceType is LAST');
    assert(btc.source.includes('Binance'), 'source contains Binance');
  }

  // ---------------------------------------------------------------------------
  // Condition B: Binance 451 -> Secondary live provider used (Kraken)
  // ---------------------------------------------------------------------------
  console.log('\nCondition B: Binance 451');
  {
    const mockFetch: typeof fetch = async (input: any) => {
      const url = String(input);
      if (url.includes('api.binance.com')) {
        return new Response(
          JSON.stringify({ code: 0, msg: 'Service unavailable from a restricted location' }),
          { status: 451, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('api.kraken.com')) {
        return new Response(
          JSON.stringify({
            error: [],
            result: {
              XXBTZUSD: {
                a: ['77410.50', '1', '1.000'],
                b: ['77405.20', '1', '1.000'],
                c: ['77408.00', '0.05'],
                h: ['78100.00', '78150.00'],
                l: ['76200.00', '76200.00'],
                o: '76500.00'
              }
            }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    };

    const quotes = await fetchCryptoQuotesWithFallback(['BTCUSD'], { customFetch: mockFetch });
    const btc = quotes.BTCUSD;
    assert(btc !== undefined, 'BTCUSD quote returned');
    assert(btc.price === 77408.00, 'Price matches Kraken live price');
    assert(btc.bid === 77405.20, 'Bid matches Kraken live bid');
    assert(btc.ask === 77410.50, 'Ask matches Kraken live ask');
    assert(btc.provider === 'Kraken Public API', 'Provider is Kraken Public API');
    assert(btc.classification === 'LIVE FALLBACK', 'Classification is LIVE FALLBACK');
    assert(btc.feedStatus === 'LIVE', 'feedStatus is LIVE');
    assert(btc.priceType === 'LAST', 'priceType is LAST');
  }

  // ---------------------------------------------------------------------------
  // Condition C: Binance timeout -> Secondary live provider used
  // ---------------------------------------------------------------------------
  console.log('\nCondition C: Binance timeout');
  {
    const mockFetch: typeof fetch = async (input: any) => {
      const url = String(input);
      if (url.includes('api.binance.com')) {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      }
      if (url.includes('api.kraken.com')) {
        return new Response(
          JSON.stringify({
            error: [],
            result: {
              XETHZUSD: {
                a: ['2510.50', '2', '2.000'],
                b: ['2510.00', '3', '3.000'],
                c: ['2510.25', '0.1'],
                h: ['2550.00', '2550.00'],
                l: ['2480.00', '2480.00'],
                o: '2500.00'
              }
            }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    };

    const quotes = await fetchCryptoQuotesWithFallback(['ETHUSD'], { customFetch: mockFetch });
    const eth = quotes.ETHUSD;
    assert(eth !== undefined, 'ETHUSD quote returned');
    assert(eth.price === 2510.25, 'Price matches Kraken after Binance timeout');
    assert(eth.provider === 'Kraken Public API', 'Provider is Kraken Public API');
    assert(eth.classification === 'LIVE FALLBACK', 'Classification is LIVE FALLBACK');
    assert(eth.feedStatus === 'LIVE', 'feedStatus is LIVE');
  }

  // ---------------------------------------------------------------------------
  // Condition D: Binance malformed response -> Secondary live provider used
  // ---------------------------------------------------------------------------
  console.log('\nCondition D: Binance malformed response');
  {
    const mockFetch: typeof fetch = async (input: any) => {
      const url = String(input);
      if (url.includes('api.binance.com')) {
        return new Response(
          JSON.stringify({ symbol: 'SOLUSDT', lastPrice: 'INVALID_NOT_A_NUMBER' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('api.kraken.com')) {
        return new Response(
          JSON.stringify({
            error: [],
            result: {
              SOLUSD: {
                a: ['101.50', '10', '10.000'],
                b: ['101.40', '5', '5.000'],
                c: ['101.45', '1.0'],
                h: ['103.00', '103.00'],
                l: ['98.00', '98.00'],
                o: '100.00'
              }
            }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    };

    const quotes = await fetchCryptoQuotesWithFallback(['SOLUSD'], { customFetch: mockFetch });
    const sol = quotes.SOLUSD;
    assert(sol !== undefined, 'SOLUSD quote returned');
    assert(sol.price === 101.45, 'Price matches Kraken after malformed Binance response');
    assert(sol.provider === 'Kraken Public API', 'Provider is Kraken Public API');
    assert(sol.classification === 'LIVE FALLBACK', 'Classification is LIVE FALLBACK');
  }

  // ---------------------------------------------------------------------------
  // Condition E: Binance + secondary provider fail -> DATA LIMITED / UNAVAILABLE
  // NO static registry price masquerading as LIVE
  // ---------------------------------------------------------------------------
  console.log('\nCondition E: Binance + secondary provider fail');
  {
    const mockFetch: typeof fetch = async () => {
      return new Response('Service Unavailable', { status: 503 });
    };

    const quotes = await fetchCryptoQuotesWithFallback(['BTCUSD', 'ETHUSD'], { customFetch: mockFetch });
    const btc = quotes.BTCUSD;
    const eth = quotes.ETHUSD;

    const btcBasePrice = MARKET_REGISTRY.BTCUSD.basePrice;
    assert(btc !== undefined, 'BTCUSD quote returned');
    assert(btc.classification === 'DATA LIMITED', 'Classification is DATA LIMITED');
    assert(btc.feedStatus === 'DATA LIMITED', 'feedStatus is DATA LIMITED');
    assert(btc.provider === 'None', 'Provider is None');
    assert(btc.source === 'None', 'Source is None');
    assert(btc.price !== btcBasePrice, `Price (${btc.price}) is NOT static basePrice (${btcBasePrice}) claiming to be live`);
    assert(btc.price === 0, 'Price is 0 when all live providers fail');
    assert(btc.referencePrice === btcBasePrice, 'Static registry price preserved strictly as referencePrice metadata');

    assert(eth.classification === 'DATA LIMITED', 'ETH classification is DATA LIMITED');
    assert(eth.feedStatus === 'DATA LIMITED', 'ETH feedStatus is DATA LIMITED');
    assert(eth.price === 0, 'ETH price is 0 when all providers fail');
  }

  // ---------------------------------------------------------------------------
  // Condition F: Provider provenance -> actual provider label matches source
  // ---------------------------------------------------------------------------
  console.log('\nCondition F: Provider provenance truthfulness');
  {
    // Test Coinbase fallback when Binance and Kraken both fail
    const mockFetchCoinbase: typeof fetch = async (input: any) => {
      const url = String(input);
      if (url.includes('api.binance.com') || url.includes('api.kraken.com')) {
        return new Response('Failed', { status: 500 });
      }
      if (url.includes('api.coinbase.com')) {
        return new Response(
          JSON.stringify({ data: { amount: '1.3520', base: 'XRP', currency: 'USD' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const quotes = await fetchCryptoQuotesWithFallback(['XRPUSD'], { customFetch: mockFetchCoinbase });
    const xrp = quotes.XRPUSD;
    assert(xrp.provider === 'Coinbase Public Spot API', 'Provider is Coinbase Public Spot API');
    assert(xrp.source === 'Coinbase Public Spot API', 'Source matches Coinbase provider');
    assert(xrp.classification === 'LIVE FALLBACK', 'Classification is LIVE FALLBACK');
  }

  // ---------------------------------------------------------------------------
  // Condition G: priceType -> LAST / SPOT / MID / DERIVED truthfully classified
  // ---------------------------------------------------------------------------
  console.log('\nCondition G: Truthful priceType classification');
  {
    // 1. Binance returns LAST
    const mockBinance: typeof fetch = async () =>
      new Response(JSON.stringify({ symbol: 'BTCUSDT', lastPrice: '77000', bidPrice: '76990', askPrice: '77010', priceChangePercent: '1', highPrice: '77500', lowPrice: '76500' }), { status: 200 });
    const qBinance = await fetchCryptoQuotesWithFallback(['BTCUSD'], { customFetch: mockBinance });
    assert(qBinance.BTCUSD.priceType === 'LAST', 'Binance quote priceType is LAST');

    // 2. Kraken returns LAST
    const mockKraken: typeof fetch = async (input: any) => {
      if (String(input).includes('api.binance.com')) return new Response('451', { status: 451 });
      return new Response(JSON.stringify({ error: [], result: { XXBTZUSD: { a: ['77010'], b: ['76990'], c: ['77000'], h: ['77500','77500'], l: ['76500','76500'], o: '76800' } } }), { status: 200 });
    };
    const qKraken = await fetchCryptoQuotesWithFallback(['BTCUSD'], { customFetch: mockKraken });
    assert(qKraken.BTCUSD.priceType === 'LAST', 'Kraken quote priceType is LAST');

    // 3. Coinbase returns SPOT
    const mockCoinbase: typeof fetch = async (input: any) => {
      if (String(input).includes('api.binance.com') || String(input).includes('api.kraken.com')) return new Response('500', { status: 500 });
      return new Response(JSON.stringify({ data: { amount: '77000' } }), { status: 200 });
    };
    const qCoinbase = await fetchCryptoQuotesWithFallback(['BTCUSD'], { customFetch: mockCoinbase });
    assert(qCoinbase.BTCUSD.priceType === 'SPOT', 'Coinbase quote priceType is SPOT');

    // 4. Degraded returns DERIVED
    const mockDegraded: typeof fetch = async () => new Response('500', { status: 500 });
    const qDegraded = await fetchCryptoQuotesWithFallback(['BTCUSD'], { customFetch: mockDegraded });
    assert(qDegraded.BTCUSD.priceType === 'DERIVED', 'Degraded quote priceType is DERIVED');
  }

  // ---------------------------------------------------------------------------
  // Condition H: All registered crypto symbols mapped or explicitly degraded
  // ---------------------------------------------------------------------------
  console.log('\nCondition H: All registered crypto symbols coverage');
  {
    const requiredSymbols = [
      'BTCUSD',
      'ETHUSD',
      'SOLUSD',
      'XRPUSD',
      'BNBUSD',
      'ADAUSD',
      'DOGEUSD',
      'LTCUSD',
      'AVAXUSD',
      'LINKUSD'
    ];

    for (const sym of requiredSymbols) {
      const mapping = CRYPTO_SYMBOL_MAPPINGS[sym];
      assert(mapping !== undefined, `Symbol ${sym} has explicit mapping`);
      assert(Boolean(mapping.binance), `Symbol ${sym} has Binance mapping (${mapping?.binance})`);
      assert(Boolean(mapping.kraken), `Symbol ${sym} has Kraken mapping (${mapping?.kraken})`);
      assert(Boolean(mapping.coinbase), `Symbol ${sym} has Coinbase mapping (${mapping?.coinbase})`);
      assert(mapping.decimalPrecision >= 0, `Symbol ${sym} has decimalPrecision`);
      assert(mapping.typicalSpread > 0, `Symbol ${sym} has typicalSpread`);
    }

    // Verify all MARKET_REGISTRY CRYPTO assets are present in mapping
    for (const [sym, def] of Object.entries(MARKET_REGISTRY)) {
      if (def.category === 'CRYPTO') {
        assert(CRYPTO_SYMBOL_MAPPINGS[sym] !== undefined, `Registry crypto symbol ${sym} is mapped in CRYPTO_SYMBOL_MAPPINGS`);
      }
    }
  }

  console.log('\n====================================================');
  console.log('ALL 8 CRYPTO FEED FALLBACK CONDITIONS PASSED (8/8)');
  console.log('====================================================\n');
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
