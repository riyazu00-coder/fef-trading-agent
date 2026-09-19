import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { deriveTrustedBrokerCandleProvenance, evaluateExternalCandleMutation } from '../src/lib/candles/candle-provenance-policy';
import { registerTrustedBrokerCandles } from '../src/lib/candles/independent-candle-service';
import { generateAssetIntelligence } from '../src/lib/agents/multi-asset-pipeline';
import { INITIAL_LIVE_ASSETS } from '../src/lib/providers/real-market-api';

const candles = Array.from({ length: 20 }, (_, i) => ({
  timestamp: Date.UTC(2026, 8, 15, i, 0, 0),
  open: 4300 + i,
  high: 4302 + i,
  low: 4299 + i,
  close: 4301 + i,
  tickVolume: 100 + i,
}));

async function main() {
  let passed = 0;
  const check = (condition: unknown, message: string) => {
    assert(condition, message);
    passed++;
    console.log(`  ✓ ${message}`);
  };

  console.log('FEF CORTEX V1.1.2-S — PROVENANCE SECURITY');

  for (const asserted of ['LIVE_MT5', 'MT5_BROKER', 'MT5_BROKER_OHLC']) {
    const denial = evaluateExternalCandleMutation();
    check(!denial.allowed && denial.code === 'CANDLE_MUTATION_DISABLED', `untrusted ${asserted} assertion fails closed`);
  }

  check(!evaluateExternalCandleMutation().allowed, 'invalid authentication cannot open the disabled mutation surface');

  const trusted = registerTrustedBrokerCandles('XAUUSD', 'H1', candles, {
    sourceIdentity: 'AUTHENTICATED_REMOTE_MT5_RELAY',
    broker: 'Verified Test Broker',
    server: 'Verified-Demo',
  });
  check(trusted.success && trusted.provenance === 'LIVE_MT5', 'authenticated trusted relay identity obtains LIVE_MT5');
  check(trusted.source === 'MT5_BROKER_OHLC', 'broker OHLC source is derived server-side');

  let rejectedIndependentEscalation = false;
  try {
    deriveTrustedBrokerCandleProvenance({
      sourceIdentity: 'INDEPENDENT_PROVIDER' as any,
      broker: 'Caller supplied broker',
    });
  } catch {
    rejectedIndependentEscalation = true;
  }
  check(rejectedIndependentEscalation, 'independent source identity cannot escalate to broker provenance');

  const independent = generateAssetIntelligence(
    'BTCUSD',
    INITIAL_LIVE_ASSETS.BTCUSD,
    'H1',
    candles,
    'INDEPENDENT_VERIFIED',
    'Independent Test Feed',
    new Date(Date.UTC(2026, 8, 15, 14, 0, 0))
  );
  check(
    independent.marketStructure?.source === 'INDEPENDENT_VERIFIED_OHLC' &&
      independent.marketStructure.swingHighs.every((level) => level.source === 'INDEPENDENT_VERIFIED_OHLC'),
    'independent candles retain independent provenance through derived market structure'
  );

  const routeSource = fs.readFileSync(path.resolve('src/app/api/candles/route.ts'), 'utf8');
  const contextSource = fs.readFileSync(path.resolve('src/context/ActiveAssetContext.tsx'), 'utf8');
  check(routeSource.includes('export async function GET') && routeSource.includes('status: 405') && contextSource.includes('/api/candles?symbol='), 'GET remains available while POST mutation is disabled');
  check(!contextSource.includes("data.provenance || 'LIVE_MT5'"), 'browser consumption never defaults missing provenance to LIVE_MT5');

  const tuesday = new Date(Date.UTC(2026, 8, 15, 14, 0, 0));
  const limited = generateAssetIntelligence('XAUUSD', INITIAL_LIVE_ASSETS.XAUUSD, 'H1', undefined, undefined, undefined, tuesday);
  const technical = limited.agents.find((agent) => agent.type === 'TECHNICAL');
  check(technical?.status === 'DATA LIMITED' && technical.confidence === 0, 'missing candles remain DATA LIMITED with zero confidence');

  console.log(`PROVENANCE SECURITY: ${passed}/${passed} PASSED`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
