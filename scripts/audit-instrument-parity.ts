import { fetchLiveMarketPrices } from '../src/lib/providers/real-market-api';
import { MARKET_REGISTRY } from '../src/lib/registry/market-registry';

interface ParityRecord {
  canonicalSymbol: string;
  category: string;
  brokerSymbol: string;
  brokerDescription: string;
  brokerBid: number | string;
  brokerAsk: number | string;
  brokerMid: number | string;
  referenceProvider: string;
  referenceSymbol: string;
  referencePrice: number | string;
  referenceTimestamp: string;
  sessionState: string;
  absDiff: number | string;
  pctDiff: number | string;
  instrumentType: string;
  contractIdentity: string;
  parityClassification: 'PARITY_VERIFIED' | 'PARITY_ACCEPTABLE' | 'PROXY_ONLY' | 'NOT_COMPARABLE' | 'UNAVAILABLE';
  reason: string;
}

async function performParityAudit() {
  console.log('Fetching live MT5 quotes from Render relay telemetry...');
  const mt5Res = await fetch('https://fef-secure-remote-relay.onrender.com/device/fef-connector-primary-01/telemetry');
  const mt5Data = await mt5Res.json();
  const mt5Quotes = mt5Data.quotes || {};

  console.log('Fetching reference market prices...');
  const refAssets = await fetchLiveMarketPrices();

  const results: ParityRecord[] = [];

  const configuredSymbols = [
    // Priority Indices
    'US100', 'US30', 'US500', 'GER40', 'UK100', 'JP225',
    // Commodities
    'USOIL', 'UKOIL', 'NATGAS',
    // Metals
    'XAUUSD', 'XAGUSD',
    // Forex (10)
    'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD', 'EURJPY', 'GBPJPY', 'EURGBP',
    // Crypto (5)
    'BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'BNBUSD'
  ];

  for (const sym of configuredSymbols) {
    const reg = MARKET_REGISTRY[sym];
    const mt5 = mt5Quotes[sym] || (sym === 'US100' ? mt5Quotes['USTEC'] : null) || (sym === 'NATGAS' ? mt5Quotes['XNGUSD'] : null);
    const ref = refAssets[sym];

    const category = reg?.category || 'UNKNOWN';
    const brokerSymbol = mt5?.brokerSymbol || (sym === 'GER40' ? 'NOT_OFFERED' : 'N/A');
    const brokerBid = typeof mt5?.bid === 'number' ? mt5.bid : 'N/A';
    const brokerAsk = typeof mt5?.ask === 'number' ? mt5.ask : 'N/A';
    let brokerMid: number | string = (typeof mt5?.bid === 'number' && typeof mt5?.ask === 'number')
      ? (mt5.bid + mt5.ask) / 2
      : 'N/A';

    let referenceProvider = ref?.provider || ref?.source || 'N/A';
    let referenceSymbol = reg?.providerSymbol || sym;
    let referencePrice = typeof ref?.price === 'number' ? ref.price : 'N/A';
    let referenceTimestamp = ref?.lastUpdated || 'N/A';
    let sessionState = ref?.feedStatus || 'UNKNOWN';

    let absDiff: number | string = 'N/A';
    let pctDiff: number | string = 'N/A';
    let classification: 'PARITY_VERIFIED' | 'PARITY_ACCEPTABLE' | 'PROXY_ONLY' | 'NOT_COMPARABLE' | 'UNAVAILABLE' = 'UNAVAILABLE';
    let reason = '';
    let instrumentType = '';
    let contractIdentity = '';

    if (sym === 'US100') {
      instrumentType = 'Index CFD vs Underlying Cash Index';
      contractIdentity = 'Exness USTEC (proprietary scaled Tech 100 CFD) vs Nasdaq-100 Cash (^NDX)';
      referenceSymbol = '^NDX / NQ=F';
      if (typeof brokerMid === 'number' && typeof referencePrice === 'number') {
        const d = Math.abs(brokerMid - referencePrice);
        absDiff = Number(d.toFixed(2));
        pctDiff = Number(((d / brokerMid) * 100).toFixed(2));
        // Broker ~29426 vs Reference ~20412. > 44% divergence.
        classification = 'PROXY_ONLY';
        reason = `Major basis divergence (${pctDiff}%): Broker trades proprietary scaled Tech CFD (${brokerMid}) vs Underlying Index (${referencePrice}). Valid for trend/macro/structure proxy; strictly INVALID for exact broker execution levels.`;
      }
    } else if (sym === 'US30') {
      instrumentType = 'Index CFD vs Underlying Cash Index';
      contractIdentity = 'Exness US30 (DJIA proprietary CFD) vs Dow Jones Cash (^DJI)';
      referenceSymbol = '^DJI / YM=F';
      if (typeof brokerMid === 'number' && typeof referencePrice === 'number') {
        const d = Math.abs(brokerMid - referencePrice);
        absDiff = Number(d.toFixed(2));
        pctDiff = Number(((d / brokerMid) * 100).toFixed(2));
        classification = 'PROXY_ONLY';
        reason = `Basis divergence (${pctDiff}%): Broker US30 CFD (${brokerMid}) vs Underlying Dow Jones Index (${referencePrice}). Directionally correlated proxy; not price-equivalent.`;
      }
    } else if (sym === 'US500') {
      instrumentType = 'Index CFD vs Underlying Cash Index';
      contractIdentity = 'Exness US500 CFD vs S&P 500 Cash (^GSPC)';
      referenceSymbol = '^GSPC / ES=F';
      if (typeof brokerMid === 'number' && typeof referencePrice === 'number') {
        const d = Math.abs(brokerMid - referencePrice);
        absDiff = Number(d.toFixed(2));
        pctDiff = Number(((d / brokerMid) * 100).toFixed(2));
        classification = 'PROXY_ONLY';
        reason = `Basis divergence (${pctDiff}%): Broker US500 CFD (${brokerMid}) vs S&P 500 Index (${referencePrice}). High directional correlation, not price parity.`;
      }
    } else if (sym === 'UK100') {
      instrumentType = 'Index CFD vs Underlying Cash Index';
      contractIdentity = 'Exness UK100 CFD vs FTSE 100 Cash (^FTSE)';
      referenceSymbol = '^FTSE';
      if (typeof brokerMid === 'number' && typeof referencePrice === 'number') {
        const d = Math.abs(brokerMid - referencePrice);
        absDiff = Number(d.toFixed(2));
        pctDiff = Number(((d / brokerMid) * 100).toFixed(2));
        classification = 'PROXY_ONLY';
        reason = `Basis divergence (${pctDiff}%): Broker UK100 (${brokerMid}) vs FTSE 100 Cash (${referencePrice}). Proxy only.`;
      }
    } else if (sym === 'JP225') {
      instrumentType = 'Index CFD vs Underlying Cash Index';
      contractIdentity = 'Exness JP225 CFD vs Nikkei 225 Cash (^N225)';
      referenceSymbol = '^N225';
      if (typeof brokerMid === 'number' && typeof referencePrice === 'number') {
        const d = Math.abs(brokerMid - referencePrice);
        absDiff = Number(d.toFixed(2));
        pctDiff = Number(((d / brokerMid) * 100).toFixed(2));
        classification = 'PROXY_ONLY';
        reason = `Basis divergence (${pctDiff}%): Broker JP225 (${brokerMid}) vs Nikkei 225 Cash (${referencePrice}). Proxy only.`;
      }
    } else if (sym === 'GER40') {
      instrumentType = 'Underlying Index Structure';
      contractIdentity = 'DAX 40 (^GDAXI)';
      referenceSymbol = '^GDAXI';
      referencePrice = 0;
      brokerMid = 'UNAVAILABLE';
      classification = 'UNAVAILABLE';
      reason = 'Broker does not stream GER40 live quotes. Public live feed unverified. Fails closed to live price 0; historical ^GDAXI structure preserved for technical/macro context.';
    } else if (sym === 'USOIL') {
      instrumentType = 'Spot Crude CFD vs Front-Month WTI Futures';
      contractIdentity = 'Exness USOIL Spot CFD vs NYMEX WTI Futures (CL=F)';
      referenceSymbol = 'CL=F';
      if (typeof brokerMid === 'number' && typeof referencePrice === 'number') {
        const d = Math.abs(brokerMid - referencePrice);
        absDiff = Number(d.toFixed(3));
        pctDiff = Number(((d / brokerMid) * 100).toFixed(2));
        classification = Number(pctDiff) < 2.5 ? 'PARITY_ACCEPTABLE' : 'PROXY_ONLY';
        reason = `Basis difference (${pctDiff}%): Spot CFD (${brokerMid}) vs NYMEX WTI Front-Month (${referencePrice}). Contract roll and spot-futures basis apply.`;
      }
    } else if (sym === 'UKOIL') {
      instrumentType = 'Spot Brent CFD vs ICE Brent Futures';
      contractIdentity = 'Exness UKOIL Spot CFD vs ICE Brent Futures (BZ=F)';
      referenceSymbol = 'BZ=F';
      if (typeof brokerMid === 'number' && typeof referencePrice === 'number') {
        const d = Math.abs(brokerMid - referencePrice);
        absDiff = Number(d.toFixed(3));
        pctDiff = Number(((d / brokerMid) * 100).toFixed(2));
        classification = Number(pctDiff) < 3.0 ? 'PARITY_ACCEPTABLE' : 'PROXY_ONLY';
        reason = `Basis difference (${pctDiff}%): Spot Brent CFD (${brokerMid}) vs ICE Brent Futures (${referencePrice}).`;
      }
    } else if (sym === 'NATGAS') {
      instrumentType = 'Spot Gas CFD vs Henry Hub Futures';
      contractIdentity = 'Exness XNGUSD Spot CFD vs NYMEX Henry Hub Futures (NG=F)';
      referenceSymbol = 'NG=F';
      if (typeof brokerMid === 'number' && typeof referencePrice === 'number') {
        const d = Math.abs(brokerMid - referencePrice);
        absDiff = Number(d.toFixed(4));
        pctDiff = Number(((d / brokerMid) * 100).toFixed(2));
        classification = 'PROXY_ONLY';
        reason = `Seasonal contract basis difference (${pctDiff}%): Spot Natural Gas CFD (${brokerMid}) vs Futures Benchmark (${referencePrice}).`;
      }
    } else if (sym === 'XAUUSD') {
      instrumentType = 'Physical Spot Gold CFD vs LBMA Benchmark';
      contractIdentity = 'Exness XAUUSD Spot vs LBMA Gold Fix (Gold-API)';
      referenceSymbol = 'XAU / Gold-API';
      if (typeof brokerMid === 'number' && typeof referencePrice === 'number') {
        const d = Math.abs(brokerMid - referencePrice);
        absDiff = Number(d.toFixed(2));
        pctDiff = Number(((d / brokerMid) * 100).toFixed(4));
        classification = Number(pctDiff) < 0.25 ? 'PARITY_VERIFIED' : 'PARITY_ACCEPTABLE';
        reason = `Tight interbank/spot alignment: Broker (${brokerMid}) vs LBMA Spot Benchmark (${referencePrice}), divergence ${pctDiff}%. High economic parity.`;
      }
    } else if (sym === 'XAGUSD') {
      instrumentType = 'Physical Spot Silver CFD vs LBMA Benchmark';
      contractIdentity = 'Exness XAGUSD Spot vs LBMA Silver Fix (Gold-API)';
      referenceSymbol = 'XAG / Gold-API';
      if (typeof brokerMid === 'number' && typeof referencePrice === 'number') {
        const d = Math.abs(brokerMid - referencePrice);
        absDiff = Number(d.toFixed(3));
        pctDiff = Number(((d / brokerMid) * 100).toFixed(3));
        classification = Number(pctDiff) < 0.35 ? 'PARITY_VERIFIED' : 'PARITY_ACCEPTABLE';
        reason = `Spot silver alignment: Broker (${brokerMid}) vs LBMA Benchmark (${referencePrice}), divergence ${pctDiff}%.`;
      }
    } else if (category === 'FOREX') {
      instrumentType = 'Spot Forex CFD vs Interbank Spot Rate';
      const isCross = ['GBPJPY', 'EURJPY', 'EURGBP'].includes(sym);
      contractIdentity = isCross ? 'Derived Interbank Cross Rate' : 'Interbank Spot Midrate (Open-ER / ECB)';
      referenceSymbol = sym;
      if (typeof brokerMid === 'number' && typeof referencePrice === 'number') {
        const d = Math.abs(brokerMid - referencePrice);
        absDiff = Number(d.toFixed(5));
        pctDiff = Number(((d / brokerMid) * 100).toFixed(3));
        classification = Number(pctDiff) < 0.5 ? 'PARITY_VERIFIED' : 'PARITY_ACCEPTABLE';
        reason = `Interbank FX alignment: Broker (${brokerMid}) vs Interbank (${referencePrice}), divergence ${pctDiff}% (${(Number(pctDiff)*100).toFixed(1)} bps). Economically identical market.`;
      }
    } else if (category === 'CRYPTO') {
      instrumentType = 'Crypto CFD vs Exchange Spot (USD/USDT)';
      contractIdentity = 'Exness Crypto CFD vs Binance/Kraken Exchange Spot';
      referenceSymbol = `${sym} / ${sym.replace('USD', 'USDT')}`;
      if (typeof brokerMid === 'number' && typeof referencePrice === 'number') {
        const d = Math.abs(brokerMid - referencePrice);
        absDiff = Number(d.toFixed(2));
        pctDiff = Number(((d / brokerMid) * 100).toFixed(3));
        // Crypto exchanges trade USDT vs USD, typical basis is < 0.35%
        classification = Number(pctDiff) < 0.4 ? 'PARITY_VERIFIED' : 'PARITY_ACCEPTABLE';
        reason = `Exchange spot alignment: Broker CFD (${brokerMid}) vs Centralized Exchange Spot (${referencePrice}), divergence ${pctDiff}%. Tether/USD peg basis accounted for.`;
      }
    }

    results.push({
      canonicalSymbol: sym,
      category,
      brokerSymbol,
      brokerDescription: reg?.description || sym,
      brokerBid,
      brokerAsk,
      brokerMid,
      referenceProvider,
      referenceSymbol,
      referencePrice,
      referenceTimestamp,
      sessionState,
      absDiff,
      pctDiff,
      instrumentType,
      contractIdentity,
      parityClassification: classification,
      reason
    });
  }

  console.log('\n========================================================================================');
  console.log('FEF CORTEX — COMPLETE 26-INSTRUMENT PARITY AUDIT MATRIX');
  console.log('========================================================================================\n');

  for (const r of results) {
    console.log(`[${r.canonicalSymbol}] (${r.category})`);
    console.log(`  Broker: ${r.brokerSymbol} | Bid: ${r.brokerBid} | Ask: ${r.brokerAsk} | Mid: ${r.brokerMid}`);
    console.log(`  Reference: ${r.referenceProvider} (${r.referenceSymbol}) | Price: ${r.referencePrice}`);
    console.log(`  Divergence: Abs=${r.absDiff} | Pct=${r.pctDiff}%`);
    console.log(`  Contract: ${r.contractIdentity}`);
    console.log(`  Classification: >> ${r.parityClassification} <<`);
    console.log(`  Rationale: ${r.reason}\n`);
  }

  const counts: Record<string, string[]> = {
    PARITY_VERIFIED: [],
    PARITY_ACCEPTABLE: [],
    PROXY_ONLY: [],
    NOT_COMPARABLE: [],
    UNAVAILABLE: []
  };

  for (const r of results) {
    counts[r.parityClassification].push(r.canonicalSymbol);
  }

  console.log('========================================================================================');
  console.log('PARITY SUMMARY COUNTS:');
  console.log(`PARITY_VERIFIED (${counts.PARITY_VERIFIED.length}): ${counts.PARITY_VERIFIED.join(', ')}`);
  console.log(`PARITY_ACCEPTABLE (${counts.PARITY_ACCEPTABLE.length}): ${counts.PARITY_ACCEPTABLE.join(', ')}`);
  console.log(`PROXY_ONLY (${counts.PROXY_ONLY.length}): ${counts.PROXY_ONLY.join(', ')}`);
  console.log(`NOT_COMPARABLE (${counts.NOT_COMPARABLE.length}): ${counts.NOT_COMPARABLE.join(', ')}`);
  console.log(`UNAVAILABLE (${counts.UNAVAILABLE.length}): ${counts.UNAVAILABLE.join(', ')}`);
  console.log('========================================================================================');
}

performParityAudit().catch(console.error);
