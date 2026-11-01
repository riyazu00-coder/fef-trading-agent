import assert from 'node:assert';
import { generateGlobalRadarIntelligence, getRadarOpportunityTier } from '../src/lib/radar/opportunity-radar-engine';
import { INITIAL_LIVE_ASSETS, LiveMarketAsset } from '../src/lib/providers/real-market-api';

console.log('============================================================');
console.log('FEF CORTEX — DISABLED CRYPTO RADAR ISOLATION TEST');
console.log('============================================================');

const testAssets: Record<string, LiveMarketAsset> = { ...INITIAL_LIVE_ASSETS };

// Full enabled crypto: BTCUSD, ETHUSD
testAssets['BTCUSD'] = {
  ...testAssets['BTCUSD'],
  tradeMode: 'FULL',
  marketAvailable: true,
  isTradeDisabled: false,
  feedStatus: 'LIVE',
  price: 82500,
  bid: 82490,
  ask: 82510,
};

testAssets['ETHUSD'] = {
  ...testAssets['ETHUSD'],
  tradeMode: 'FULL',
  marketAvailable: true,
  isTradeDisabled: false,
  feedStatus: 'LIVE',
  price: 2450,
  bid: 2449,
  ask: 2451,
};

// Disabled crypto from broker: SOLUSD, XRPUSD, BNBUSD
testAssets['SOLUSD'] = {
  ...testAssets['SOLUSD'],
  tradeMode: 'DISABLED',
  marketAvailable: false,
  isTradeDisabled: true,
  feedStatus: 'LIVE',
  price: 108,
  bid: 107.8,
  ask: 108.2,
};

testAssets['XRPUSD'] = {
  ...testAssets['XRPUSD'],
  tradeMode: 'DISABLED',
  marketAvailable: false,
  isTradeDisabled: true,
  feedStatus: 'LIVE',
  price: 1.33,
  bid: 1.329,
  ask: 1.331,
};

testAssets['BNBUSD'] = {
  ...testAssets['BNBUSD'],
  tradeMode: 'DISABLED',
  marketAvailable: false,
  isTradeDisabled: true,
  feedStatus: 'LIVE',
  price: 740,
  bid: 739.5,
  ask: 740.5,
};

// Weekend date so traditional markets are closed
const weekendUtc = new Date(Date.UTC(2026, 9, 17, 12, 0, 0));
const radar = generateGlobalRadarIntelligence(testAssets, 'H1', undefined, undefined, weekendUtc);

const btc = radar.rankedOpportunities.find(o => o.symbol === 'BTCUSD')!;
const eth = radar.rankedOpportunities.find(o => o.symbol === 'ETHUSD')!;
const sol = radar.rankedOpportunities.find(o => o.symbol === 'SOLUSD')!;
const xrp = radar.rankedOpportunities.find(o => o.symbol === 'XRPUSD')!;
const bnb = radar.rankedOpportunities.find(o => o.symbol === 'BNBUSD')!;
const ger = radar.rankedOpportunities.find(o => o.symbol === 'GER40')!;

console.log(`BTCUSD: Tier=${getRadarOpportunityTier(btc)} State=${btc.state} Executable=${btc.tradeExecutable} Rank=${btc.rank}`);
console.log(`ETHUSD: Tier=${getRadarOpportunityTier(eth)} State=${eth.state} Executable=${eth.tradeExecutable} Rank=${eth.rank}`);
console.log(`SOLUSD: Tier=${getRadarOpportunityTier(sol)} State=${sol.state} Executable=${sol.tradeExecutable} Rank=${sol.rank}`);
console.log(`XRPUSD: Tier=${getRadarOpportunityTier(xrp)} State=${xrp.state} Executable=${xrp.tradeExecutable} Rank=${xrp.rank}`);
console.log(`BNBUSD: Tier=${getRadarOpportunityTier(bnb)} State=${bnb.state} Executable=${bnb.tradeExecutable} Rank=${bnb.rank}`);
console.log(`GER40 : Tier=${getRadarOpportunityTier(ger)} State=${ger.state} Executable=${ger.tradeExecutable} Rank=${ger.rank}`);

// Assertions
assert.strictEqual(getRadarOpportunityTier(btc), 0, 'BTCUSD must be Tier 0');
assert.strictEqual(getRadarOpportunityTier(eth), 0, 'ETHUSD must be Tier 0');
assert.strictEqual(getRadarOpportunityTier(sol), 1, 'SOLUSD must be Tier 1');
assert.strictEqual(getRadarOpportunityTier(xrp), 1, 'XRPUSD must be Tier 1');
assert.strictEqual(getRadarOpportunityTier(bnb), 1, 'BNBUSD must be Tier 1');
assert.strictEqual(getRadarOpportunityTier(ger), 2, 'GER40 must be Tier 2 (UNAVAILABLE)');

assert.strictEqual(sol.tradeExecutable, false, 'SOLUSD must never be trade executable');
assert.strictEqual(xrp.tradeExecutable, false, 'XRPUSD must never be trade executable');
assert.strictEqual(bnb.tradeExecutable, false, 'BNBUSD must never be trade executable');

assert.ok(btc.rank < sol.rank, 'BTCUSD must rank higher than disabled SOLUSD');
assert.ok(eth.rank < sol.rank, 'ETHUSD must rank higher than disabled SOLUSD');
assert.ok(sol.rank < ger.rank, 'Tier 1 SOLUSD must rank higher than Tier 2 GER40');

console.log('\n[PASS] All disabled crypto isolation checks passed cleanly!');
